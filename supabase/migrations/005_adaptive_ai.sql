-- =============================================================================
-- Migration: 005_adaptive_ai.sql
-- Project:   HIRED — Adaptive AI · Diagnostic Intelligence Engine
-- Author:    HIRED Engineering
-- Date:      2026-02-28
-- =============================================================================
--
-- OVERVIEW
-- ────────
-- This migration installs the complete Adaptive AI layer that enables HIRED to:
--   1. Tag questions with concept, difficulty, and cognitive dimension
--   2. Track per-user per-concept performance metrics automatically
--   3. Compute a WeaknessIndex for each concept (0–1 scale)
--   4. Classify concepts as Dominado / Inestable / Débil
--   5. Detect learning stagnation (no improvement across 5+ attempts)
--   6. Expose a "Competence Map" RPC for the professional dashboard
--
-- What this migration does:
--   §1  Create `concepts` table                     — taxonomy of technical topics
--   §2  Create `questions` table                    — normalised questions with concept tagging
--   §3  Create `user_concept_metrics` table         — persistent per-concept aggregates
--   §4  Extend simulation_attempts.answers JSON     — comment only (schema-level)
--   §5  Install hired_compute_weakness_index()      — pure function, 0–1 result
--   §6  Install hired_classify_weakness()           — maps index → label
--   §7  Install hired_trg_fn_update_concept_metrics() — trigger worker
--   §8  Install trigger trg_concept_metrics_on_attempt
--   §9  Install hired_check_stagnation()            — sets learning_stagnation flag
--   §10 Install view v_competence_map               — queryable weakness snapshot
--   §11 Install RPC get_competence_map()            — secure public accessor
--   §12 Install RPC get_weak_concepts()             — returns Débil concepts only
--   §13 RLS policies for new tables
--
-- ROLLBACK
-- ────────
-- See 005_adaptive_ai_rollback.sql
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §1  CONCEPTS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Taxonomy of technical knowledge topics.  Each concept belongs to a
-- technology and has an optional category (e.g. "Hooks", "State Management").

CREATE TABLE IF NOT EXISTS public.concepts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  technology_id UUID        NOT NULL REFERENCES public.technologies(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  category      TEXT        DEFAULT NULL,
  description   TEXT        DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  public.concepts            IS 'Technical knowledge taxonomy — tagged on questions for AI diagnosis';
COMMENT ON COLUMN public.concepts.name       IS 'Human-readable concept label, e.g. "useEffect lifecycle"';
COMMENT ON COLUMN public.concepts.category   IS 'Grouping within technology, e.g. "Hooks", "State Management"';

CREATE INDEX IF NOT EXISTS idx_concepts_technology
  ON public.concepts(technology_id);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_concepts_tech_name
  ON public.concepts(technology_id, name);


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  QUESTIONS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Normalised question bank.  Each question is optionally linked to a concept
-- and carries difficulty + cognitive metadata required for adaptive diagnosis.
--
-- Cognitive levels follow a simplified Bloom's taxonomy:
--   recordar  → recall of facts
--   comprender → explain / describe
--   aplicar   → use in context
--   analizar  → break down / compare
--   evaluar   → judge / critique

CREATE TABLE IF NOT EXISTS public.questions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id       UUID        REFERENCES public.simulations(id) ON DELETE SET NULL,
  concept_id          UUID        REFERENCES public.concepts(id) ON DELETE SET NULL,
  prompt              TEXT        NOT NULL,
  choices             JSONB       DEFAULT NULL,   -- array of strings for MCQ
  correct_choice_index INT        DEFAULT NULL,   -- 0-based index into choices[]
  difficulty_level    INT         DEFAULT NULL CHECK (difficulty_level BETWEEN 1 AND 5),
  cognitive_level     TEXT        DEFAULT NULL
    CHECK (cognitive_level IN ('recordar','comprender','aplicar','analizar','evaluar')),
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  public.questions                   IS 'Normalised question bank — concept-tagged for adaptive AI';
COMMENT ON COLUMN public.questions.difficulty_level  IS '1 (trivial) → 5 (expert); drives adaptive question selection';
COMMENT ON COLUMN public.questions.cognitive_level   IS 'Simplified Bloom taxonomy: recordar|comprender|aplicar|analizar|evaluar';
COMMENT ON COLUMN public.questions.correct_choice_index IS '0-based index; NULL for open-ended questions';

CREATE INDEX IF NOT EXISTS idx_questions_concept
  ON public.questions(concept_id);
CREATE INDEX IF NOT EXISTS idx_questions_simulation
  ON public.questions(simulation_id);
CREATE INDEX IF NOT EXISTS idx_questions_difficulty
  ON public.questions(difficulty_level);


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  USER CONCEPT METRICS TABLE
-- ─────────────────────────────────────────────────────────────────────────────
-- Persistent aggregation of per-user per-concept performance.
-- Updated automatically by the trigger installed in §8.
--
-- score_history stores the last 10 per-answer scores (JSONB number array).
-- Used exclusively by the stagnation detector (§9).

CREATE TABLE IF NOT EXISTS public.user_concept_metrics (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  concept_id          UUID        NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  attempts            INT         NOT NULL DEFAULT 0,
  correct_answers     INT         NOT NULL DEFAULT 0,
  average_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  score_history       JSONB       NOT NULL DEFAULT '[]'::JSONB,  -- last 10 scores
  learning_stagnation BOOLEAN     NOT NULL DEFAULT FALSE,
  last_attempt_at     TIMESTAMPTZ DEFAULT NULL,
  updated_at          TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT uq_user_concept UNIQUE (user_id, concept_id),
  CONSTRAINT chk_ucm_attempts      CHECK (attempts >= 0),
  CONSTRAINT chk_ucm_correct       CHECK (correct_answers >= 0 AND correct_answers <= attempts)
);

COMMENT ON TABLE  public.user_concept_metrics                  IS 'Persistent per-user per-concept performance aggregates (trigger-maintained)';
COMMENT ON COLUMN public.user_concept_metrics.score_history    IS 'JSONB array of last 10 question scores — used for stagnation detection';
COMMENT ON COLUMN public.user_concept_metrics.learning_stagnation IS 'TRUE when ≥5 attempts & no score improvement across 3 consecutive answers';

CREATE INDEX IF NOT EXISTS idx_ucm_user
  ON public.user_concept_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_ucm_concept
  ON public.user_concept_metrics(concept_id);
CREATE INDEX IF NOT EXISTS idx_ucm_stagnation
  ON public.user_concept_metrics(user_id, learning_stagnation)
  WHERE learning_stagnation = TRUE;


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  NOTE: simulation_attempts.answers JSONB extension (no DDL change)
-- ─────────────────────────────────────────────────────────────────────────────
-- Each element in simulation_attempts.answers was:
--   { "question_id": "<uuid>", "answer": "<text>" }
--
-- Going forward the scoring layer should include:
--   { "question_id": "<uuid>", "answer": "<text>",
--     "is_correct": true|false, "question_score": 0-100 }
--
-- The trigger (§8) COALESCES missing fields to FALSE / 0 for backward compat.
-- No ALTER TABLE is needed — JSONB is schema-less by nature.


-- ─────────────────────────────────────────────────────────────────────────────
-- §5  WEAKNESS INDEX FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
-- WeaknessIndex = (1-accuracy_rate)*0.6 + (1-normalised_score)*0.3 + penalty*0.1
--
-- low_attempt_penalty: users with few attempts get mild uncertainty penalty.
--   attempts < 3  → penalty = 0.5
--   attempts < 5  → penalty = 0.25
--   otherwise     → penalty = 0

CREATE OR REPLACE FUNCTION public.hired_compute_weakness_index(
  p_attempts       INT,
  p_correct        INT,
  p_average_score  NUMERIC
)
RETURNS NUMERIC LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_accuracy_rate   NUMERIC;
  v_norm_score      NUMERIC;
  v_penalty         NUMERIC;
BEGIN
  IF p_attempts IS NULL OR p_attempts = 0 THEN
    RETURN 1.0;  -- no data → treat as fully weak
  END IF;

  v_accuracy_rate := LEAST(p_correct::NUMERIC / p_attempts, 1.0);
  v_norm_score    := LEAST(COALESCE(p_average_score, 0) / 100.0, 1.0);

  v_penalty := CASE
    WHEN p_attempts < 3 THEN 0.5
    WHEN p_attempts < 5 THEN 0.25
    ELSE 0.0
  END;

  RETURN ROUND(
    (1 - v_accuracy_rate) * 0.6
    + (1 - v_norm_score)  * 0.3
    + v_penalty           * 0.1,
    4
  );
END;
$$;

COMMENT ON FUNCTION public.hired_compute_weakness_index IS
  'Computes [0-1] weakness index: high = weak concept. Components: accuracy*0.6 + score*0.3 + attempt_penalty*0.1';


-- ─────────────────────────────────────────────────────────────────────────────
-- §6  WEAKNESS CLASSIFICATION FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
-- Maps numeric weakness index to labelled tier.

CREATE OR REPLACE FUNCTION public.hired_classify_weakness(p_index NUMERIC)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_index >= 0.6 THEN 'debil'
    WHEN p_index >= 0.3 THEN 'inestable'
    ELSE 'dominado'
  END;
$$;

COMMENT ON FUNCTION public.hired_classify_weakness IS
  'Maps weakness_index → debil (≥0.6) | inestable (0.3–0.59) | dominado (<0.3)';


-- ─────────────────────────────────────────────────────────────────────────────
-- §7  TRIGGER WORKER FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
-- Fires AFTER UPDATE on simulation_attempts when status transitions to
-- 'completed'.  Iterates answers JSONB array, looks up each question_id in
-- the questions table, and upserts user_concept_metrics for any concepts found.

CREATE OR REPLACE FUNCTION public.hired_trg_fn_update_concept_metrics()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_answer       JSONB;
  v_question_id  UUID;
  v_concept_id   UUID;
  v_is_correct   BOOLEAN;
  v_q_score      NUMERIC;
  v_new_attempts INT;
  v_new_correct  INT;
  v_new_avg      NUMERIC;
  v_history      JSONB;
BEGIN
  -- Only execute on completion event
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;
  -- answers must be a non-null array
  IF NEW.answers IS NULL OR jsonb_typeof(NEW.answers) != 'array' THEN
    RETURN NEW;
  END IF;

  -- ── Process each answer ───────────────────────────────────────────────────
  FOR v_answer IN SELECT jsonb_array_elements(NEW.answers) LOOP
    -- Parse fields (backward-compat: is_correct / question_score are optional)
    BEGIN
      v_question_id := (v_answer->>'question_id')::UUID;
    EXCEPTION WHEN others THEN
      CONTINUE;  -- skip malformed entries
    END;

    v_is_correct := COALESCE((v_answer->>'is_correct')::BOOLEAN, FALSE);
    v_q_score    := COALESCE((v_answer->>'question_score')::NUMERIC, 0);

    -- Look up the concept linked to this question
    SELECT concept_id INTO v_concept_id
    FROM   public.questions
    WHERE  id = v_question_id;

    CONTINUE WHEN v_concept_id IS NULL;

    -- ── Upsert concept metrics ──────────────────────────────────────────────
    INSERT INTO public.user_concept_metrics
      (user_id, concept_id, attempts, correct_answers, average_score,
       score_history, last_attempt_at, updated_at)
    VALUES
      (NEW.user_id, v_concept_id, 1,
       CASE WHEN v_is_correct THEN 1 ELSE 0 END,
       v_q_score,
       jsonb_build_array(v_q_score),
       NOW(), NOW())
    ON CONFLICT (user_id, concept_id) DO UPDATE SET
      attempts        = user_concept_metrics.attempts + 1,
      correct_answers = user_concept_metrics.correct_answers
                        + CASE WHEN v_is_correct THEN 1 ELSE 0 END,
      -- Welford-style running average (no overflow, no full re-scan)
      average_score   = ROUND(
                          (user_concept_metrics.average_score
                           * user_concept_metrics.attempts
                           + v_q_score)
                          / (user_concept_metrics.attempts + 1),
                          2),
      -- Keep last 10 scores for stagnation detection
      score_history   = (
                          CASE
                            WHEN jsonb_array_length(user_concept_metrics.score_history) >= 10
                            THEN (user_concept_metrics.score_history - 0)   -- drop oldest
                            ELSE user_concept_metrics.score_history
                          END
                        ) || jsonb_build_array(v_q_score),
      last_attempt_at = NOW(),
      updated_at      = NOW();

    -- ── Stagnation detection ────────────────────────────────────────────────
    SELECT attempts, correct_answers, average_score, score_history
    INTO   v_new_attempts, v_new_correct, v_new_avg, v_history
    FROM   public.user_concept_metrics
    WHERE  user_id = NEW.user_id AND concept_id = v_concept_id;

    IF v_new_attempts >= 5 AND jsonb_array_length(v_history) >= 3 THEN
      PERFORM public.hired_check_stagnation(NEW.user_id, v_concept_id, v_history);
    END IF;

  END LOOP;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hired_trg_fn_update_concept_metrics IS
  'Trigger worker: iterates simulation_attempts.answers, upserts user_concept_metrics per concept';


-- ─────────────────────────────────────────────────────────────────────────────
-- §8  TRIGGER INSTALLATION
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_concept_metrics_on_attempt ON public.simulation_attempts;

CREATE TRIGGER trg_concept_metrics_on_attempt
  AFTER UPDATE OF status ON public.simulation_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.hired_trg_fn_update_concept_metrics();

COMMENT ON TRIGGER trg_concept_metrics_on_attempt ON public.simulation_attempts IS
  'Updates user_concept_metrics after each simulation attempt completes';


-- ─────────────────────────────────────────────────────────────────────────────
-- §9  STAGNATION DETECTION FUNCTION
-- ─────────────────────────────────────────────────────────────────────────────
-- Declared after the trigger function (which references it via PERFORM) because
-- PL/pgSQL resolves function names at call time, not at compile time.
--
-- Stagnation rule:
--   The last 3 scores in score_history span < 5 points (max - min < 5).
--   This indicates the user is "stuck" and not improving.

CREATE OR REPLACE FUNCTION public.hired_check_stagnation(
  p_user_id    UUID,
  p_concept_id UUID,
  p_history    JSONB
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_last3       JSONB;
  v_max_score   NUMERIC;
  v_min_score   NUMERIC;
  v_stagnating  BOOLEAN;
BEGIN
  -- Extract last 3 elements
  v_last3 := (
    SELECT jsonb_agg(val)
    FROM (
      SELECT val
      FROM   jsonb_array_elements(p_history) WITH ORDINALITY AS t(val, ord)
      ORDER  BY ord DESC
      LIMIT  3
    ) sub
  );

  SELECT
    MAX(val::TEXT::NUMERIC),
    MIN(val::TEXT::NUMERIC)
  INTO v_max_score, v_min_score
  FROM jsonb_array_elements(v_last3) AS val;

  v_stagnating := (v_max_score - v_min_score) < 5;

  UPDATE public.user_concept_metrics
  SET    learning_stagnation = v_stagnating,
         updated_at          = NOW()
  WHERE  user_id    = p_user_id
    AND  concept_id = p_concept_id;
END;
$$;

COMMENT ON FUNCTION public.hired_check_stagnation IS
  'Marks learning_stagnation=true when last 3 concept scores span < 5 points (user is stuck)';


-- ─────────────────────────────────────────────────────────────────────────────
-- §10  VIEW: v_competence_map
-- ─────────────────────────────────────────────────────────────────────────────
-- Queryable snapshot joining user_concept_metrics with concept + technology
-- metadata, plus computed weakness_index and weakness_class.

CREATE OR REPLACE VIEW public.v_competence_map AS
SELECT
  ucm.user_id,
  ucm.concept_id,
  c.name                                                   AS concept_name,
  c.category                                               AS concept_category,
  c.technology_id,
  t.name                                                   AS technology_name,
  NULL::TEXT                                               AS technology_slug,
  NULL::TEXT                                               AS technology_icon,
  -- Representative cognitive level from the question bank (max difficulty used)
  (
    SELECT q.cognitive_level
    FROM   public.questions q
    WHERE  q.concept_id = ucm.concept_id AND q.cognitive_level IS NOT NULL
    ORDER  BY q.difficulty_level DESC NULLS LAST
    LIMIT  1
  )                                                        AS cognitive_level,
  (
    SELECT MAX(q.difficulty_level)
    FROM   public.questions q
    WHERE  q.concept_id = ucm.concept_id
  )                                                        AS max_difficulty,
  ucm.attempts,
  ucm.correct_answers,
  ucm.average_score,
  -- Accuracy rate 0-1
  CASE WHEN ucm.attempts > 0
    THEN ROUND(ucm.correct_answers::NUMERIC / ucm.attempts, 4)
    ELSE 0
  END                                                      AS accuracy_rate,
  -- Weakness index 0-1
  public.hired_compute_weakness_index(
    ucm.attempts, ucm.correct_answers, ucm.average_score
  )                                                        AS weakness_index,
  -- Classification label
  public.hired_classify_weakness(
    public.hired_compute_weakness_index(
      ucm.attempts, ucm.correct_answers, ucm.average_score
    )
  )                                                        AS weakness_class,
  ucm.learning_stagnation,
  ucm.last_attempt_at,
  ucm.updated_at
FROM       public.user_concept_metrics ucm
INNER JOIN public.concepts             c   ON c.id = ucm.concept_id
INNER JOIN public.technologies         t   ON t.id = c.technology_id;

COMMENT ON VIEW public.v_competence_map IS
  'Per-user per-concept weakness snapshot with computed index, class, and metadata';


-- ─────────────────────────────────────────────────────────────────────────────
-- §11  RPC: get_competence_map
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the full competence map for one user.
-- Accessible to the authenticated user themselves and to admin roles.

CREATE OR REPLACE FUNCTION public.get_competence_map(p_user_id UUID)
RETURNS TABLE (
  concept_id          UUID,
  concept_name        TEXT,
  concept_category    TEXT,
  technology_id       UUID,
  technology_name     TEXT,
  technology_slug     TEXT,
  technology_icon     TEXT,
  cognitive_level     TEXT,
  max_difficulty      INT,
  attempts            INT,
  correct_answers     INT,
  average_score       NUMERIC,
  accuracy_rate       NUMERIC,
  weakness_index      NUMERIC,
  weakness_class      TEXT,
  learning_stagnation BOOLEAN,
  last_attempt_at     TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    concept_id,
    concept_name,
    concept_category,
    technology_id,
    technology_name,
    technology_slug,
    technology_icon,
    cognitive_level,
    max_difficulty,
    attempts,
    correct_answers,
    average_score,
    accuracy_rate,
    weakness_index,
    weakness_class,
    learning_stagnation,
    last_attempt_at
  FROM public.v_competence_map
  WHERE user_id = p_user_id
  ORDER BY weakness_index DESC, concept_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_competence_map(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_competence_map IS
  'Returns full concept weakness map for a user, ordered by weakness severity';


-- ─────────────────────────────────────────────────────────────────────────────
-- §12  RPC: get_weak_concepts
-- ─────────────────────────────────────────────────────────────────────────────
-- Convenience RPC returning only Débil (weakness_index ≥ 0.6) concepts.

CREATE OR REPLACE FUNCTION public.get_weak_concepts(p_user_id UUID)
RETURNS TABLE (
  concept_id       UUID,
  concept_name     TEXT,
  concept_category TEXT,
  technology_name  TEXT,
  weakness_index   NUMERIC,
  attempts         INT,
  average_score    NUMERIC,
  learning_stagnation BOOLEAN
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    concept_id,
    concept_name,
    concept_category,
    technology_name,
    weakness_index,
    attempts,
    average_score,
    learning_stagnation
  FROM public.v_competence_map
  WHERE user_id      = p_user_id
    AND weakness_index >= 0.6
  ORDER BY weakness_index DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_weak_concepts(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_weak_concepts IS
  'Returns only Débil concepts (weakness_index ≥ 0.6) for a user';


-- ─────────────────────────────────────────────────────────────────────────────
-- §13  ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- concepts — readable by everyone, writable only by admin-privileged functions
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS concepts_public_read  ON public.concepts;
CREATE POLICY concepts_public_read ON public.concepts
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS concepts_admin_write  ON public.concepts;
CREATE POLICY concepts_admin_write ON public.concepts
  FOR ALL USING (FALSE);  -- write via service role key or SECURITY DEFINER functions

-- questions — readable by authenticated users, writable by admins
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS questions_auth_read ON public.questions;
CREATE POLICY questions_auth_read ON public.questions
  FOR SELECT TO authenticated USING (is_active = TRUE);

DROP POLICY IF EXISTS questions_admin_write ON public.questions;
CREATE POLICY questions_admin_write ON public.questions
  FOR ALL USING (FALSE);  -- write via service role key or SECURITY DEFINER functions

-- user_concept_metrics — users read their own, trigger writes for everyone
ALTER TABLE public.user_concept_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ucm_owner_read ON public.user_concept_metrics;
CREATE POLICY ucm_owner_read ON public.user_concept_metrics
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS ucm_admin_read ON public.user_concept_metrics;
CREATE POLICY ucm_admin_read ON public.user_concept_metrics
  FOR SELECT USING (FALSE);  -- admin reads via service role key

-- Trigger functions run as SECURITY DEFINER so they bypass RLS for writes.


-- ─────────────────────────────────────────────────────────────────────────────
-- END OF MIGRATION 005
-- ─────────────────────────────────────────────────────────────────────────────
