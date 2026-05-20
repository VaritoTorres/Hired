-- =============================================================================
-- Migration: 007_fix_schema_alignment.sql
-- Project:   HIRED — Schema Alignment Patch
-- Date:      2026-02-28
-- =============================================================================
--
-- PURPOSE
-- ───────
-- Aligns migrations 001–006 with the original baseline schema.
-- The baseline was created before these migrations and has different column
-- names / missing columns that caused the scoring pipeline to fail silently.
--
-- Issues fixed:
--   1. technical_scores missing: total_attempts, last_attempted_at, updated_at
--   2. simulation_attempts missing: answers JSONB (needed by migration 005 trigger)
--   3. hired_trg_fn_score_on_attempt_complete: s.difficulty → s.level
--   4. hired_upsert_technical_score: INSERT referenced non-existent columns
--   5. recalculate_technical_scores: same INSERT column fix
--
-- SAFE TO RE-RUN: all ADD COLUMN use IF NOT EXISTS, functions use CREATE OR REPLACE
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §1  Add missing columns to technical_scores
-- ─────────────────────────────────────────────────────────────────────────────
-- The original table only had: id, user_id, technology_id, average_score,
-- level_estimated, last_updated, UNIQUE(user_id, technology_id).
-- The scoring functions expect total_attempts, last_attempted_at, updated_at.

ALTER TABLE public.technical_scores
  ADD COLUMN IF NOT EXISTS total_attempts    INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempted_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  Add answers column to simulation_attempts
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 005 trigger (hired_trg_fn_update_concept_metrics) reads
-- NEW.answers to track per-concept performance. The original table only has
-- a `feedback` column; `answers` is separate (structured Q&A array).

ALTER TABLE public.simulation_attempts
  ADD COLUMN IF NOT EXISTS answers JSONB DEFAULT NULL;

COMMENT ON COLUMN public.simulation_attempts.answers IS
  'Array of {question_id, answer, is_correct, question_score} — used by Adaptive AI trigger';


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  Fix hired_upsert_technical_score
-- ─────────────────────────────────────────────────────────────────────────────
-- Previous version inserted total_attempts and last_attempted_at which did not
-- exist yet. Now those columns are present (added in §1 above).

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
  SELECT average_score, total_attempts
  INTO   v_existing_avg, v_existing_n
  FROM   public.technical_scores
  WHERE  user_id = p_user_id AND technology_id = p_technology_id;

  IF NOT FOUND THEN
    v_existing_avg := 0;
    v_existing_n   := 0;
  END IF;

  v_new_n   := v_existing_n + 1;
  v_new_avg := ROUND(
    (v_existing_avg * v_existing_n + p_new_score) / v_new_n,
    2
  );

  v_level := public.hired_estimate_level(v_new_avg);

  INSERT INTO public.technical_scores (
    user_id, technology_id,
    average_score, total_attempts, level_estimated,
    last_attempted_at, updated_at
  )
  VALUES (
    p_user_id, p_technology_id,
    v_new_avg, v_new_n, v_level,
    NOW(), NOW()
  )
  ON CONFLICT (user_id, technology_id) DO UPDATE
    SET average_score     = EXCLUDED.average_score,
        total_attempts    = EXCLUDED.total_attempts,
        level_estimated   = EXCLUDED.level_estimated,
        last_attempted_at = EXCLUDED.last_attempted_at,
        updated_at        = EXCLUDED.updated_at;
END;
$$;

COMMENT ON FUNCTION public.hired_upsert_technical_score(UUID, UUID, NUMERIC) IS
  'Incrementally updates technical_scores using Welford running average. Fixed in 007.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  Fix hired_trg_fn_score_on_attempt_complete
-- ─────────────────────────────────────────────────────────────────────────────
-- Bug: referenced s.difficulty but the real column is s.level.
-- Also: NEW.score is NUMERIC(5,2) on the original table — assign directly
-- without the ::INT cast that silently truncated decimals.

CREATE OR REPLACE FUNCTION public.hired_trg_fn_score_on_attempt_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_level            TEXT;
  v_technology_id    UUID;
  v_weighted_score   NUMERIC(5,2);
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  IF NEW.breakdown IS NULL THEN
    RAISE WARNING '[HIRED] attempt % completed with NULL breakdown — scoring skipped', NEW.id;
    RETURN NEW;
  END IF;

  -- FIX: real column is `level`, not `difficulty`
  SELECT s.level, s.technology_id
  INTO   v_level, v_technology_id
  FROM   public.simulations s
  WHERE  s.id = NEW.simulation_id;

  IF NOT FOUND THEN
    RAISE WARNING '[HIRED] simulation % not found for attempt % — scoring skipped',
                  NEW.simulation_id, NEW.id;
    RETURN NEW;
  END IF;

  v_weighted_score := public.hired_calculate_weighted_score(
    NEW.breakdown,
    v_level
  );

  NEW.weighted_score := v_weighted_score;
  -- FIX: score is NUMERIC(5,2) on the original table — no ::INT cast needed
  NEW.score := v_weighted_score;

  PERFORM public.hired_upsert_technical_score(
    NEW.user_id,
    v_technology_id,
    v_weighted_score
  );

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING '[HIRED] scoring pipeline error for attempt %: % %',
                  NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hired_trg_fn_score_on_attempt_complete() IS
  'Trigger: orchestrates scoring pipeline when attempt → completed. Fixed in 007 (level not difficulty).';


-- ─────────────────────────────────────────────────────────────────────────────
-- §5  Fix recalculate_technical_scores
-- ─────────────────────────────────────────────────────────────────────────────
-- Same column fix: total_attempts, last_attempted_at, updated_at now exist.

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
  FOR v_tech IN
    SELECT DISTINCT s.technology_id
    FROM   public.simulation_attempts sa
    JOIN   public.simulations s ON s.id = sa.simulation_id
    WHERE  sa.user_id  = p_user_id
      AND  sa.status   = 'completed'
      AND  sa.weighted_score IS NOT NULL
  LOOP
    SELECT
      COUNT(*)::INT                    AS n,
      ROUND(AVG(sa.weighted_score), 2) AS avg_score
    INTO v_agg
    FROM public.simulation_attempts sa
    JOIN public.simulations s ON s.id = sa.simulation_id
    WHERE sa.user_id      = p_user_id
      AND s.technology_id = v_tech.technology_id
      AND sa.status       = 'completed'
      AND sa.weighted_score IS NOT NULL;

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
      SET average_score     = EXCLUDED.average_score,
          total_attempts    = EXCLUDED.total_attempts,
          level_estimated   = EXCLUDED.level_estimated,
          last_attempted_at = EXCLUDED.last_attempted_at,
          updated_at        = EXCLUDED.updated_at;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.recalculate_technical_scores(UUID) IS
  'Full recalculation of technical_scores for a user. Fixed in 007.';


-- =============================================================================
-- Migration 007 complete — schema aligned with baseline
-- =============================================================================
