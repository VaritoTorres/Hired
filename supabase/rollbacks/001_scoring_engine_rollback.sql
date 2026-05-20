-- =============================================================================
-- Rollback: 001_scoring_engine_rollback.sql
-- Apply this to undo migration 001_scoring_engine.sql
-- =============================================================================

-- Remove trigger first (depends on function)
DROP TRIGGER IF EXISTS trg_score_on_attempt_complete ON public.simulation_attempts;

-- Remove all installed functions
DROP FUNCTION IF EXISTS public.hired_trg_fn_score_on_attempt_complete();
DROP FUNCTION IF EXISTS public.recalculate_technical_scores(UUID);
DROP FUNCTION IF EXISTS public.hired_upsert_technical_score(UUID, UUID, NUMERIC);
DROP FUNCTION IF EXISTS public.hired_estimate_level(NUMERIC);
DROP FUNCTION IF EXISTS public.hired_calculate_weighted_score(JSONB, TEXT);
DROP FUNCTION IF EXISTS public.hired_scoring_weights(TEXT);

-- Remove added indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_simulation_attempts_user_completed;
DROP INDEX CONCURRENTLY IF EXISTS idx_technical_scores_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_simulation_attempts_user_created;

-- Remove added columns (data loss — only run in dev/staging)
ALTER TABLE public.simulation_attempts
  DROP COLUMN IF EXISTS breakdown,
  DROP COLUMN IF EXISTS weighted_score;

ALTER TABLE public.technical_scores
  DROP COLUMN IF EXISTS level_estimated,
  DROP COLUMN IF EXISTS percentile_rank;
