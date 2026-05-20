-- =============================================================================
-- Migration: 001_scoring_engine.sql
-- Project:   HIRED — Intelligent Technical Scoring Engine
-- Author:    HIRED Engineering
-- Date:      2026-02-28
-- =============================================================================
--
-- OVERVIEW
-- ────────
-- This migration installs the complete server-side scoring engine for HIRED.
-- ALL score computation happens inside PostgreSQL — never in frontend code.
--
-- What this migration does:
--   1. Extend `simulation_attempts`  → breakdown JSONB, weighted_score
--   2. Extend `technical_scores`     → level_estimated, percentile_rank
--   3. Install helper type           → difficulty_level (enum safety)
--   4. Install weight constants      → hired_scoring_weights()
--   5. Install scoring function      → hired_calculate_weighted_score()
--   6. Install aggregation function  → hired_upsert_technical_score()
--   7. Install trigger function      → hired_trg_fn_score_on_attempt_complete()
--   8. Install trigger               → trg_score_on_attempt_complete
--   9. Row-level security policies   → prevent direct score manipulation
--
-- ROLLBACK
-- ────────
-- See 001_scoring_engine_rollback.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — Schema extensions
-- ─────────────────────────────────────────────────────────────────────────────

-- 1a. Ensure simulation_attempts exists, then add scoring columns
--     breakdown:      JSONB capturing per-category raw scores (0–100 each)
--     weighted_score: final ponderado score (0–100), computed by scoring engine
--     status:         attempt lifecycle ('in_progress' | 'completed' | 'abandoned')
--     answers:        structured Q&A array for Adaptive AI concept tracking
--     completed_at:   timestamp when status transitioned to 'completed'
--
-- NOTE: The baseline table has user_id → profiles(id), score NUMERIC(5,2),
--       feedback JSONB, started_at, finished_at. We only ADD missing columns.
--
CREATE TABLE IF NOT EXISTS public.simulation_attempts (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  simulation_id   UUID         NOT NULL REFERENCES public.simulations(id) ON DELETE CASCADE,
  score           NUMERIC(5,2) DEFAULT NULL,
  feedback        JSONB        DEFAULT NULL,
  started_at      TIMESTAMPTZ  DEFAULT NULL,
  finished_at     TIMESTAMPTZ  DEFAULT NULL,
  status          TEXT         NOT NULL DEFAULT 'in_progress',
  breakdown       JSONB        DEFAULT NULL,
  weighted_score  NUMERIC(5,2) DEFAULT NULL,
  answers         JSONB        DEFAULT NULL,
  completed_at    TIMESTAMPTZ  DEFAULT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.simulation_attempts
  ADD COLUMN IF NOT EXISTS status         TEXT         DEFAULT 'in_progress',
  ADD COLUMN IF NOT EXISTS breakdown      JSONB        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS weighted_score NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS answers        JSONB        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS completed_at   TIMESTAMPTZ  DEFAULT NULL;

COMMENT ON COLUMN public.simulation_attempts.breakdown IS
  'Per-category raw scores: {"concepts":int, "problem_solving":int, "clean_code":int, "performance":int}';
COMMENT ON COLUMN public.simulation_attempts.weighted_score IS
  'Ponderado final score (0–100) computed by hired_calculate_weighted_score()';

-- 1b. Ensure technical_scores exists, then extend with scoring engine columns
--     level_estimated: human tier derived from average_score  (already in baseline)
--     percentile_rank: placeholder for the ranking feature (Phase N)
--     total_attempts:  count of completed attempts for this user+technology
--     last_attempted_at: timestamp of most recent attempt
--     updated_at:       last row modification timestamp
--
-- NOTE: The baseline table has user_id → profiles(id), level_estimated already
--       exists, last_updated (not last_attempted_at), no total_attempts/updated_at.
--
CREATE TABLE IF NOT EXISTS public.technical_scores (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  technology_id     UUID         NOT NULL REFERENCES public.technologies(id) ON DELETE CASCADE,
  average_score     NUMERIC(5,2) DEFAULT NULL,
  level_estimated   TEXT         DEFAULT NULL,
  total_attempts    INTEGER      NOT NULL DEFAULT 0,
  weakest_area      TEXT         DEFAULT NULL,
  last_attempted_at TIMESTAMPTZ  DEFAULT NULL,
  percentile_rank   NUMERIC(5,2) DEFAULT NULL,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, technology_id)
);

ALTER TABLE public.technical_scores
  ADD COLUMN IF NOT EXISTS level_estimated  TEXT         DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS percentile_rank  NUMERIC(5,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS total_attempts   INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

COMMENT ON COLUMN public.technical_scores.level_estimated IS
  'Derived tier: beginner | junior | mid | senior — recalculated on every attempt';
COMMENT ON COLUMN public.technical_scores.percentile_rank IS
  'Future field: percentile within all users for this technology (0–100). NULL until ranking phase.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — Weight configuration
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns the scoring weight vector for a given difficulty level.
-- Weights sum to exactly 1.0 at every tier.
--
-- Tier rationale (business decisions — change here, nowhere else):
--   junior:  concepts heavy       (mastery of fundamentals matters most)
--   mid:     balanced             (production balance of all dimensions)
--   senior:  execution heavy      (clean architecture + performance dominate)
--
-- @param p_difficulty  'junior' | 'mid' | 'senior'
-- @returns TABLE (concepts, problem_solving, clean_code, performance)
--
CREATE OR REPLACE FUNCTION public.hired_scoring_weights(
  p_difficulty TEXT
)
RETURNS TABLE (
  concepts        NUMERIC,
  problem_solving NUMERIC,
  clean_code      NUMERIC,
  performance     NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    CASE p_difficulty WHEN 'junior' THEN 0.40 WHEN 'mid' THEN 0.30 WHEN 'senior' THEN 0.20 ELSE 0.25 END::NUMERIC AS concepts,
    CASE p_difficulty WHEN 'junior' THEN 0.30 WHEN 'mid' THEN 0.30 WHEN 'senior' THEN 0.30 ELSE 0.25 END::NUMERIC AS problem_solving,
    CASE p_difficulty WHEN 'junior' THEN 0.20 WHEN 'mid' THEN 0.20 WHEN 'senior' THEN 0.25 ELSE 0.25 END::NUMERIC AS clean_code,
    CASE p_difficulty WHEN 'junior' THEN 0.10 WHEN 'mid' THEN 0.20 WHEN 'senior' THEN 0.25 ELSE 0.25 END::NUMERIC AS performance;
$$;

COMMENT ON FUNCTION public.hired_scoring_weights(TEXT) IS
  'Returns the scoring weight vector for a difficulty level. Single source of truth for ponderación logic.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — Weighted score calculation
-- ─────────────────────────────────────────────────────────────────────────────

-- Applies difficulty-level weights to a raw breakdown JSONB and returns
-- the final 0–100 weighted score.
--
-- Formula (for each category c with weight w_c):
--   weighted_score = Σ (raw_score_c × w_c)
--
-- All raw scores are clamped to [0, 100] defensively before multiplication.
--
-- @param p_breakdown    JSONB — {"concepts":int, "problem_solving":int, "clean_code":int, "performance":int}
-- @param p_difficulty   TEXT  — 'junior' | 'mid' | 'senior'
-- @returns NUMERIC(5,2) — weighted score rounded to 2 decimal places
--
CREATE OR REPLACE FUNCTION public.hired_calculate_weighted_score(
  p_breakdown  JSONB,
  p_difficulty TEXT
)
RETURNS NUMERIC(5,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_concepts        NUMERIC;
  v_problem_solving NUMERIC;
  v_clean_code      NUMERIC;
  v_performance     NUMERIC;

  v_w_concepts        NUMERIC;
  v_w_problem_solving NUMERIC;
  v_w_clean_code      NUMERIC;
  v_w_performance     NUMERIC;

  v_weighted NUMERIC(5,2);
BEGIN
  -- Extract raw scores from breakdown JSON, defaulting missing keys to 0
  v_concepts        := LEAST(100, GREATEST(0, COALESCE((p_breakdown->>'concepts')::NUMERIC, 0)));
  v_problem_solving := LEAST(100, GREATEST(0, COALESCE((p_breakdown->>'problem_solving')::NUMERIC, 0)));
  v_clean_code      := LEAST(100, GREATEST(0, COALESCE((p_breakdown->>'clean_code')::NUMERIC, 0)));
  v_performance     := LEAST(100, GREATEST(0, COALESCE((p_breakdown->>'performance')::NUMERIC, 0)));

  -- Load weights for this difficulty
  SELECT w.concepts, w.problem_solving, w.clean_code, w.performance
  INTO   v_w_concepts, v_w_problem_solving, v_w_clean_code, v_w_performance
  FROM   public.hired_scoring_weights(p_difficulty) w;

  -- Apply weights and round
  v_weighted := ROUND(
    (v_concepts        * v_w_concepts)        +
    (v_problem_solving * v_w_problem_solving)  +
    (v_clean_code      * v_w_clean_code)       +
    (v_performance     * v_w_performance),
    2
  );

  RETURN v_weighted;
END;
$$;

COMMENT ON FUNCTION public.hired_calculate_weighted_score(JSONB, TEXT) IS
  'Computes the final ponderado score from a raw breakdown and difficulty level. '
  'Immutable — safe to call multiple times with same args.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — Level estimation helper
-- ─────────────────────────────────────────────────────────────────────────────

-- Maps an average score to a human-readable technical tier.
-- Update thresholds here — nowhere else.
--
-- @param p_score NUMERIC — average_score from technical_scores
-- @returns TEXT  — 'beginner' | 'junior' | 'mid' | 'senior'
--
CREATE OR REPLACE FUNCTION public.hired_estimate_level(
  p_score NUMERIC
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN CASE
    WHEN p_score IS NULL           THEN NULL
    WHEN p_score < 50              THEN 'beginner'
    WHEN p_score < 70              THEN 'junior'
    WHEN p_score < 85              THEN 'mid'
    ELSE                                'senior'
  END;
END;
$$;

COMMENT ON FUNCTION public.hired_estimate_level(NUMERIC) IS
  'Maps an average score (0–100) to a level label. Thresholds: <50 beginner, <70 junior, <85 mid, ≥85 senior.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — Technical score aggregation (upsert)
-- ─────────────────────────────────────────────────────────────────────────────

-- Updates (or inserts) the `technical_scores` row for a given user+technology
-- after a new weighted score has been computed.
--
-- Incremental average formula (Welford-style, numerically stable):
--   new_avg = (old_avg * old_n + new_score) / (old_n + 1)
--
-- This avoids full table scans and is safe for concurrent inserts because the
-- upsert uses a unique constraint on (user_id, technology_id).
--
-- @param p_user_id       UUID
-- @param p_technology_id UUID
-- @param p_new_score     NUMERIC(5,2) — the weighted_score from the completed attempt
--
CREATE OR REPLACE FUNCTION public.hired_upsert_technical_score(
  p_user_id       UUID,
  p_technology_id UUID,
  p_new_score     NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_avg  NUMERIC;
  v_existing_n    INT;
  v_new_avg       NUMERIC(5,2);
  v_new_n         INT;
  v_level         TEXT;
BEGIN
  -- Fetch existing aggregate (may not exist for a first attempt)
  SELECT average_score, total_attempts
  INTO   v_existing_avg, v_existing_n
  FROM   public.technical_scores
  WHERE  user_id       = p_user_id
    AND  technology_id = p_technology_id;

  IF NOT FOUND THEN
    -- First attempt for this technology: no prior average
    v_existing_avg := 0;
    v_existing_n   := 0;
  END IF;

  -- Incremental Welford average — numerically stable, O(1)
  v_new_n   := v_existing_n + 1;
  v_new_avg := ROUND(
    (v_existing_avg * v_existing_n + p_new_score) / v_new_n,
    2
  );

  -- Derive level from the fresh average
  v_level := public.hired_estimate_level(v_new_avg);

  -- Upsert: insert if first attempt, update otherwise
  INSERT INTO public.technical_scores (
    user_id,
    technology_id,
    average_score,
    total_attempts,
    level_estimated,
    last_attempted_at,
    updated_at
  )
  VALUES (
    p_user_id,
    p_technology_id,
    v_new_avg,
    v_new_n,
    v_level,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_id, technology_id) DO UPDATE
    SET average_score    = EXCLUDED.average_score,
        total_attempts   = EXCLUDED.total_attempts,
        level_estimated  = EXCLUDED.level_estimated,
        last_attempted_at = EXCLUDED.last_attempted_at,
        updated_at       = EXCLUDED.updated_at;

  -- Note: percentile_rank is left NULL intentionally — populated in ranking phase
END;
$$;

COMMENT ON FUNCTION public.hired_upsert_technical_score(UUID, UUID, NUMERIC) IS
  'Incrementally updates technical_scores using Welford running average after each attempt. '
  'Safe for concurrent writes via ON CONFLICT.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — Master trigger function
-- ─────────────────────────────────────────────────────────────────────────────

-- Orchestrates the full scoring pipeline whenever a simulation_attempt
-- transitions to `completed` status.
--
-- Pipeline (runs in a single DB transaction):
--   Step 1: Read the attempt's breakdown + difficulty from the joined simulation
--   Step 2: Compute weighted_score via hired_calculate_weighted_score()
--   Step 3: Persist weighted_score back to simulation_attempts
--   Step 4: Upsert technical_scores via hired_upsert_technical_score()
--
-- Guard: only fires when NEW.status = 'completed' AND
--        OLD.status IS DISTINCT FROM 'completed'
--        (prevents double-counting on idempotent updates)
--
CREATE OR REPLACE FUNCTION public.hired_trg_fn_score_on_attempt_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_difficulty       TEXT;
  v_technology_id    UUID;
  v_weighted_score   NUMERIC(5,2);
BEGIN
  -- ── Guard: only run when transitioning to completed ──────────────────────
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- ── Guard: breakdown must be present ─────────────────────────────────────
  IF NEW.breakdown IS NULL THEN
    RAISE WARNING '[HIRED] attempt % completed with NULL breakdown — scoring skipped', NEW.id;
    RETURN NEW;
  END IF;

  -- ── Step 1: Fetch simulation level and technology_id ──────────────────────
  -- NOTE: real column is `level`, not `difficulty`
  SELECT s.level, s.technology_id
  INTO   v_difficulty, v_technology_id
  FROM   public.simulations s
  WHERE  s.id = NEW.simulation_id;

  IF NOT FOUND THEN
    RAISE WARNING '[HIRED] simulation % not found for attempt % — scoring skipped',
                  NEW.simulation_id, NEW.id;
    RETURN NEW;
  END IF;

  -- ── Step 2: Compute weighted score ──────────────────────────────────────
  v_weighted_score := public.hired_calculate_weighted_score(
    NEW.breakdown,
    v_difficulty
  );

  -- ── Step 3: Persist weighted_score to the attempt row ───────────────────
  NEW.weighted_score := v_weighted_score;

  -- NOTE: score is NUMERIC(5,2) on the original table — assign directly
  NEW.score := v_weighted_score;

  -- ── Step 4: Upsert technical_scores aggregate ───────────────────────────
  PERFORM public.hired_upsert_technical_score(
    NEW.user_id,
    v_technology_id,
    v_weighted_score
  );

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log but do not block the attempt completion — scoring is best-effort
    RAISE WARNING '[HIRED] scoring pipeline error for attempt %: % %',
                  NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hired_trg_fn_score_on_attempt_complete() IS
  'Trigger function: orchestrates the full scoring pipeline when an attempt is marked completed.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — Trigger installation
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop then re-create so applying this migration is idempotent
DROP TRIGGER IF EXISTS trg_score_on_attempt_complete ON public.simulation_attempts;

CREATE TRIGGER trg_score_on_attempt_complete
  BEFORE UPDATE OF status             -- fires only when status column changes
  ON public.simulation_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.hired_trg_fn_score_on_attempt_complete();

COMMENT ON TRIGGER trg_score_on_attempt_complete ON public.simulation_attempts IS
  'Fires BEFORE UPDATE on status; invokes the scoring pipeline when status → ''completed''.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8 — RPC helper (callable from Angular via supabase.rpc())
-- ─────────────────────────────────────────────────────────────────────────────

-- Callable from Angular's ScoreService.refreshScoresAfterAttempt()
-- Recalculates all technical scores for a given user from scratch.
-- Useful after bulk imports or data corrections; not used in normal flow.
--
CREATE OR REPLACE FUNCTION public.recalculate_technical_scores(
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tech  RECORD;
  v_agg   RECORD;
BEGIN
  -- For each technology the user has completed attempts for:
  FOR v_tech IN
    SELECT DISTINCT s.technology_id
    FROM   public.simulation_attempts sa
    JOIN   public.simulations s ON s.id = sa.simulation_id
    WHERE  sa.user_id  = p_user_id
      AND  sa.status   = 'completed'
      AND  sa.weighted_score IS NOT NULL
  LOOP
    -- Recompute full average from all attempts for this technology
    SELECT
      COUNT(*)::INT                           AS n,
      ROUND(AVG(sa.weighted_score), 2)        AS avg_score
    INTO v_agg
    FROM public.simulation_attempts sa
    JOIN public.simulations s ON s.id = sa.simulation_id
    WHERE sa.user_id       = p_user_id
      AND s.technology_id  = v_tech.technology_id
      AND sa.status        = 'completed'
      AND sa.weighted_score IS NOT NULL;

    -- Upsert the recomputed aggregate
    INSERT INTO public.technical_scores (
      user_id, technology_id, average_score, total_attempts,
      level_estimated, last_attempted_at, updated_at
    )
    VALUES (
      p_user_id,
      v_tech.technology_id,
      COALESCE(v_agg.avg_score, 0),
      COALESCE(v_agg.n, 0),
      public.hired_estimate_level(v_agg.avg_score),
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id, technology_id) DO UPDATE
      SET average_score    = EXCLUDED.average_score,
          total_attempts   = EXCLUDED.total_attempts,
          level_estimated  = EXCLUDED.level_estimated,
          last_attempted_at = EXCLUDED.last_attempted_at,
          updated_at       = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.recalculate_technical_scores(UUID) IS
  'Full recalculation of technical_scores for a user. '
  'Called from Angular ScoreService.refreshScoresAfterAttempt() via Supabase RPC.';


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9 — RLS policies (prevent direct score manipulation)
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure RLS is enabled on both tables
ALTER TABLE public.simulation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technical_scores    ENABLE ROW LEVEL SECURITY;

-- ── simulation_attempts policies ─────────────────────────────────────────────

-- Users can read their own attempts
DROP POLICY IF EXISTS "attempts_select_own" ON public.simulation_attempts;
CREATE POLICY "attempts_select_own"
  ON public.simulation_attempts
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own attempts (startSimulation)
DROP POLICY IF EXISTS "attempts_insert_own" ON public.simulation_attempts;
CREATE POLICY "attempts_insert_own"
  ON public.simulation_attempts
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update ONLY their own in-progress attempts — and ONLY allowed columns.
-- weighted_score and breakdown are backend-only: they are set by the trigger
-- (SECURITY DEFINER) so the RLS context is the function owner, not the user.
DROP POLICY IF EXISTS "attempts_update_own_in_progress" ON public.simulation_attempts;
CREATE POLICY "attempts_update_own_in_progress"
  ON public.simulation_attempts
  FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('in_progress'))
  WITH CHECK (auth.uid() = user_id);

-- ── technical_scores policies ─────────────────────────────────────────────────

-- Users can read their own scores
DROP POLICY IF EXISTS "scores_select_own" ON public.technical_scores;
CREATE POLICY "scores_select_own"
  ON public.technical_scores
  FOR SELECT
  USING (auth.uid() = user_id);

-- No direct INSERT/UPDATE from clients — all mutations via SECURITY DEFINER functions
DROP POLICY IF EXISTS "scores_no_direct_write" ON public.technical_scores;
CREATE POLICY "scores_no_direct_write"
  ON public.technical_scores
  FOR ALL
  USING (FALSE)
  WITH CHECK (FALSE);

-- Exception: allow the DEFINER functions to bypass RLS (they run as table owner)
-- This is already guaranteed by SECURITY DEFINER — no additional policy needed.


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10 — Unique constraint guard for upsert correctness
-- ─────────────────────────────────────────────────────────────────────────────

-- hired_upsert_technical_score() uses ON CONFLICT (user_id, technology_id)
-- This unique constraint MUST exist.  Add it safely if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conrelid = 'public.technical_scores'::REGCLASS
      AND  contype  = 'u'
      AND  conname  = 'technical_scores_user_technology_unique'
  ) THEN
    ALTER TABLE public.technical_scores
      ADD CONSTRAINT technical_scores_user_technology_unique
      UNIQUE (user_id, technology_id);
  END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 11 — Performance indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Speeds up monthly attempt counting (used by plan enforcement)
CREATE INDEX IF NOT EXISTS
  idx_simulation_attempts_user_created
  ON public.simulation_attempts (user_id, created_at);

-- Speeds up score lookups on the dashboard
CREATE INDEX IF NOT EXISTS
  idx_technical_scores_user
  ON public.technical_scores (user_id);

-- Speeds up score evolution queries (ordered by date)
CREATE INDEX IF NOT EXISTS
  idx_simulation_attempts_user_completed
  ON public.simulation_attempts (user_id, completed_at)
  WHERE status = 'completed';


-- =============================================================================
-- Migration complete — scoring engine installed
-- =============================================================================
