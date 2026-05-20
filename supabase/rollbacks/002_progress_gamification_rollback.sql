-- ============================================================
-- HIRED — ROLLBACK 002: GAMIFICATION & PROGRESS ENGINE
-- ============================================================
-- Run this to undo migration 002_progress_gamification.sql
-- ============================================================

BEGIN;

-- Triggers
DROP TRIGGER IF EXISTS trg_progress_on_attempt_complete ON simulation_attempts;

-- Functions
DROP FUNCTION IF EXISTS get_user_progress_with_technology(UUID);
DROP FUNCTION IF EXISTS refresh_global_percentiles();
DROP FUNCTION IF EXISTS hired_trg_fn_progress_on_attempt_complete();
DROP FUNCTION IF EXISTS hired_weakest_area(JSONB);
DROP FUNCTION IF EXISTS hired_update_streak(DATE);
DROP FUNCTION IF EXISTS hired_award_xp(NUMERIC, NUMERIC, INTEGER);
DROP FUNCTION IF EXISTS hired_xp_to_rank_title(INTEGER);

-- Tables (order matters for FK constraints)
DROP TABLE IF EXISTS global_ranking CASCADE;
DROP TABLE IF EXISTS certificates CASCADE;
DROP TABLE IF EXISTS user_progress CASCADE;

-- Columns on existing tables
ALTER TABLE technical_scores DROP COLUMN IF EXISTS weakest_area;
ALTER TABLE profiles          DROP COLUMN IF EXISTS global_rank_title;
ALTER TABLE profiles          DROP COLUMN IF EXISTS total_xp;

COMMIT;
