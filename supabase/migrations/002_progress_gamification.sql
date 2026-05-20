-- ============================================================
-- HIRED — MIGRATION 002: GAMIFICATION & PROGRESS ENGINE
-- ============================================================
-- Phases covered
--   • New tables  : user_progress, certificates, global_ranking
--   • New columns : profiles.total_xp, profiles.global_rank_title
--                   technical_scores.weakest_area
--   • XP system   : hired_xp_award(), hired_xp_to_rank_title()
--   • Streak      : hired_update_streak()
--   • Adaptive    : weakest_area updated per attempt breakdown
--   • Certificates: auto-issued when avg > 85 & attempts >= 3
--   • Trigger     : trg_progress_on_attempt_complete
--   • RLS         : complete policies for all new tables
--   • Indexes     : critical performance indexes
-- ============================================================
-- Run with psql or Supabase SQL editor.
-- Idempotent: uses IF NOT EXISTS / OR REPLACE guards throughout.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- SECTION 1 — New columns on existing tables
-- ────────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS total_xp           INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS global_rank_title  TEXT        NOT NULL DEFAULT 'Rookie';

ALTER TABLE technical_scores
  ADD COLUMN IF NOT EXISTS weakest_area       TEXT;

-- ────────────────────────────────────────────────────────────
-- SECTION 2 — user_progress table
-- ────────────────────────────────────────────────────────────
-- One row per (user, technology).  Maintained exclusively by
-- the server-side trigger — never written from the client.
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_progress (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  technology_id       UUID            NOT NULL REFERENCES technologies(id) ON DELETE CASCADE,

  total_attempts      INTEGER         NOT NULL DEFAULT 0,
  best_score          NUMERIC(5,2)    NOT NULL DEFAULT 0,
  streak_days         INTEGER         NOT NULL DEFAULT 0,
  last_activity_date  DATE,
  level_unlocked      TEXT            NOT NULL DEFAULT 'Rookie',
  xp_points           INTEGER         NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_user_progress UNIQUE (user_id, technology_id)
);

-- ────────────────────────────────────────────────────────────
-- SECTION 3 — certificates table
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS certificates (
  id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID            NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  technology_id       UUID            NOT NULL REFERENCES technologies(id) ON DELETE CASCADE,

  level_achieved      TEXT            NOT NULL,   -- 'mid' | 'senior'
  issued_at           TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

  -- Short-code for public verification URL (e.g. /verify/<code>)
  verification_code   TEXT            NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),

  CONSTRAINT uq_certificate UNIQUE (user_id, technology_id, level_achieved)
);

-- ────────────────────────────────────────────────────────────
-- SECTION 4 — global_ranking table
-- ────────────────────────────────────────────────────────────
-- Refreshed by a scheduled function (or on-demand).
-- Percentile 0–100 (100 = top 1%).
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS global_ranking (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID            NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  total_xp      INTEGER         NOT NULL DEFAULT 0,
  percentile    NUMERIC(5,2),   -- NULL until first ranking refresh
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ────────────────────────────────────────────────────────────
-- SECTION 5 — hired_xp_to_rank_title()
-- Maps accumulated XP to a rank label.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hired_xp_to_rank_title(p_xp INTEGER)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF p_xp >= 3000 THEN RETURN 'Elite';
  ELSIF p_xp >= 1500 THEN RETURN 'Challenger';
  ELSIF p_xp >= 500  THEN RETURN 'Explorer';
  ELSE RETURN 'Rookie';
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 6 — hired_award_xp()
-- Calculates XP for a single attempt.
--
-- Base rule    : +50   (just completing)
-- Score bonus  : ≥85 → +50 | 70–84 → +25 | 50–69 → +10
-- Improve avg  : if new_score > old_avg_score → +20
-- Streak multi : if streak_days >= 2 → final total × 1.5 (ceiling)
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hired_award_xp(
  p_score         NUMERIC,
  p_old_avg_score NUMERIC,
  p_streak_days   INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_xp INTEGER := 50;  -- base
BEGIN
  -- Score bonus
  IF    p_score >= 85 THEN v_xp := v_xp + 50;
  ELSIF p_score >= 70 THEN v_xp := v_xp + 25;
  ELSIF p_score >= 50 THEN v_xp := v_xp + 10;
  END IF;

  -- Improvement bonus
  IF p_score > p_old_avg_score THEN
    v_xp := v_xp + 20;
  END IF;

  -- Streak multiplier (integer ceiling)
  IF p_streak_days >= 2 THEN
    v_xp := CEIL(v_xp * 1.5);
  END IF;

  RETURN v_xp;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 7 — hired_update_streak()
-- Increments streak or resets to 1 based on last_activity_date.
-- Returns the new streak_days value.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hired_update_streak(
  p_last_activity_date DATE
)
RETURNS INTEGER
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  -- Same day: user already practiced today, streak unchanged
  IF p_last_activity_date = CURRENT_DATE THEN
    RETURN NULL;  -- caller interprets NULL as "no change"

  -- Yesterday: streak continues
  ELSIF p_last_activity_date = CURRENT_DATE - INTERVAL '1 day' THEN
    RETURN 1;  -- caller does: streak_days + 1

  -- Gap > 1 day: reset
  ELSE
    RETURN 0;  -- caller sets streak_days = 1 (base)
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 8 — hired_weakest_area()
-- Returns the name of the lowest-scoring breakdown category.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hired_weakest_area(p_breakdown JSONB)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_categories TEXT[]   := ARRAY['concepts','problem_solving','clean_code','performance'];
  v_cat        TEXT;
  v_min_val    NUMERIC  := 101;
  v_weakest    TEXT     := 'concepts';
BEGIN
  IF p_breakdown IS NULL THEN RETURN NULL; END IF;

  FOREACH v_cat IN ARRAY v_categories LOOP
    DECLARE v_val NUMERIC;
    BEGIN
      v_val := (p_breakdown ->> v_cat)::NUMERIC;
      IF v_val IS NOT NULL AND v_val < v_min_val THEN
        v_min_val := v_val;
        v_weakest := v_cat;
      END IF;
    END;
  END LOOP;

  RETURN v_weakest;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 9 — hired_trg_fn_progress_on_attempt_complete()
-- Master trigger: fires AFTER UPDATE OF status = 'completed'.
--
-- Steps:
--  1. Read weighted_score + breakdown from the updated row
--  2. Update streak on user_progress
--  3. Award XP → upsert user_progress & profiles.total_xp
--  4. Update best_score, level_unlocked
--  5. Update technical_scores.weakest_area
--  6. Auto-issue certificate if eligible
--  7. Refresh global_ranking row
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION hired_trg_fn_progress_on_attempt_complete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_score           NUMERIC(5,2);
  v_technology_id   UUID;
  v_progress        RECORD;
  v_new_streak      INTEGER;
  v_streak_delta    INTEGER;
  v_xp_earned       INTEGER;
  v_new_xp_total    INTEGER;
  v_new_best        NUMERIC(5,2);
  v_new_level       TEXT;
  v_new_rank_title  TEXT;
  v_weakest         TEXT;
BEGIN
  -- Only process transitions to 'completed'
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Scoring engine must have set weighted_score (migration 001 trigger fires BEFORE this one)
  v_score := COALESCE(NEW.weighted_score, NEW.score, 0);

  -- Resolve which technology this simulation belongs to
  SELECT technology_id INTO v_technology_id
  FROM simulations
  WHERE id = NEW.simulation_id;

  IF v_technology_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- ── Load current progress row (locking for update) ──
  SELECT *
  INTO v_progress
  FROM user_progress
  WHERE user_id = NEW.user_id AND technology_id = v_technology_id
  FOR UPDATE;

  -- ── Streak calculation ──
  v_streak_delta := hired_update_streak(v_progress.last_activity_date);

  IF v_streak_delta IS NULL THEN
    -- Same day: keep existing streak
    v_new_streak := COALESCE(v_progress.streak_days, 1);
  ELSIF v_streak_delta = 1 THEN
    v_new_streak := COALESCE(v_progress.streak_days, 0) + 1;
  ELSE
    v_new_streak := 1;  -- reset
  END IF;

  -- ── XP calculation ──
  v_xp_earned := hired_award_xp(
    v_score,
    COALESCE(v_progress.best_score, 0),
    v_new_streak
  );

  v_new_best := GREATEST(COALESCE(v_progress.best_score, 0), v_score);

  -- level_unlocked mirrors the tier based on best_score
  v_new_level := CASE
    WHEN v_new_best >= 85 THEN 'senior'
    WHEN v_new_best >= 70 THEN 'mid'
    WHEN v_new_best >= 50 THEN 'junior'
    ELSE 'beginner'
  END;

  -- ── Upsert user_progress ──
  INSERT INTO user_progress (
    user_id, technology_id,
    total_attempts, best_score, streak_days,
    last_activity_date, level_unlocked, xp_points,
    updated_at
  )
  VALUES (
    NEW.user_id, v_technology_id,
    1, v_score, v_new_streak,
    CURRENT_DATE, v_new_level, v_xp_earned,
    NOW()
  )
  ON CONFLICT (user_id, technology_id) DO UPDATE SET
    total_attempts      = user_progress.total_attempts + 1,
    best_score          = v_new_best,
    streak_days         = v_new_streak,
    last_activity_date  = CURRENT_DATE,
    level_unlocked      = v_new_level,
    xp_points           = user_progress.xp_points + v_xp_earned,
    updated_at          = NOW();

  -- ── Update profiles.total_xp and global_rank_title ──
  UPDATE profiles
  SET
    total_xp          = total_xp + v_xp_earned,
    global_rank_title = hired_xp_to_rank_title(total_xp + v_xp_earned),
    updated_at        = NOW()
  WHERE id = NEW.user_id
  RETURNING total_xp INTO v_new_xp_total;

  -- ── Update technical_scores.weakest_area ──
  IF NEW.breakdown IS NOT NULL THEN
    v_weakest := hired_weakest_area(NEW.breakdown);

    UPDATE technical_scores
    SET weakest_area = v_weakest
    WHERE user_id = NEW.user_id AND technology_id = v_technology_id;
  END IF;

  -- ── Auto-issue certificate ──
  DECLARE
    v_ts_avg     NUMERIC(5,2);
    v_ts_total   INTEGER;
    v_cert_level TEXT;
  BEGIN
    SELECT average_score, total_attempts
    INTO v_ts_avg, v_ts_total
    FROM technical_scores
    WHERE user_id = NEW.user_id AND technology_id = v_technology_id;

    IF v_ts_avg IS NOT NULL AND v_ts_total >= 3 THEN
      -- Senior certificate: avg ≥ 85
      IF v_ts_avg >= 85 THEN
        v_cert_level := 'senior';
      -- Mid certificate: avg ≥ 70
      ELSIF v_ts_avg >= 70 THEN
        v_cert_level := 'mid';
      ELSE
        v_cert_level := NULL;
      END IF;

      IF v_cert_level IS NOT NULL THEN
        INSERT INTO certificates (user_id, technology_id, level_achieved)
        VALUES (NEW.user_id, v_technology_id, v_cert_level)
        ON CONFLICT (user_id, technology_id, level_achieved) DO NOTHING;
      END IF;
    END IF;
  END;

  -- ── Upsert global_ranking ──
  INSERT INTO global_ranking (user_id, total_xp, updated_at)
  VALUES (NEW.user_id, COALESCE(v_new_xp_total, v_xp_earned), NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    total_xp   = EXCLUDED.total_xp,
    updated_at = NOW();

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log but never block the transaction
    RAISE WARNING '[hired_progress] attempt_id=% error=%', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 10 — Trigger registration
-- AFTER the scoring engine trigger (BEFORE UPDATE) runs first,
-- this AFTER trigger reads the fully-updated row.
-- ────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_progress_on_attempt_complete ON simulation_attempts;

CREATE TRIGGER trg_progress_on_attempt_complete
  AFTER UPDATE OF status
  ON simulation_attempts
  FOR EACH ROW
  EXECUTE FUNCTION hired_trg_fn_progress_on_attempt_complete();

-- ────────────────────────────────────────────────────────────
-- SECTION 11 — RPC: get_user_progress_with_technology
-- Returns user_progress rows joined with technology metadata.
-- Callable from Angular via supabase.rpc().
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_progress_with_technology(p_user_id UUID)
RETURNS TABLE (
  id                  UUID,
  user_id             UUID,
  technology_id       UUID,
  total_attempts      INTEGER,
  best_score          NUMERIC,
  streak_days         INTEGER,
  last_activity_date  DATE,
  level_unlocked      TEXT,
  xp_points           INTEGER,
  updated_at          TIMESTAMPTZ,
  technology_name     TEXT,
  technology_slug     TEXT,
  technology_icon_url TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    up.id, up.user_id, up.technology_id,
    up.total_attempts, up.best_score, up.streak_days,
    up.last_activity_date, up.level_unlocked, up.xp_points,
    up.updated_at,
    t.name        AS technology_name,
    NULL::TEXT    AS technology_slug,
    NULL::TEXT    AS technology_icon_url
  FROM user_progress up
  JOIN technologies t ON t.id = up.technology_id
  WHERE up.user_id = p_user_id
  ORDER BY up.xp_points DESC;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 12 — RPC: refresh_global_percentiles
-- Recomputes percentile_rank for all users.
-- Intended for a scheduled Supabase Edge Cron (daily).
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_global_percentiles()
RETURNS VOID
LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE global_ranking gr
  SET
    percentile = ranked.pct,
    updated_at = NOW()
  FROM (
    SELECT
      user_id,
      ROUND(
        (PERCENT_RANK() OVER (ORDER BY total_xp DESC) * 100)::NUMERIC,
        2
      ) AS pct
    FROM global_ranking
  ) ranked
  WHERE gr.user_id = ranked.user_id;
$$;

-- ────────────────────────────────────────────────────────────
-- SECTION 13 — Row Level Security
-- ────────────────────────────────────────────────────────────

-- user_progress: each user sees only their own rows
ALTER TABLE user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_progress: own rows only"
  ON user_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_progress: no direct writes"
  ON user_progress FOR INSERT
  WITH CHECK (FALSE);   -- only SECURITY DEFINER trigger may insert

CREATE POLICY "user_progress: no direct updates"
  ON user_progress FOR UPDATE
  USING (FALSE);

-- certificates: users can read their own
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "certificates: own rows"
  ON certificates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "certificates: public verification"
  ON certificates FOR SELECT
  USING (TRUE);         -- verification_code lookup must be unauthenticated-friendly

CREATE POLICY "certificates: no direct writes"
  ON certificates FOR INSERT
  WITH CHECK (FALSE);

-- global_ranking: readable by all authenticated users (leaderboard)
ALTER TABLE global_ranking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "global_ranking: readable by authenticated"
  ON global_ranking FOR SELECT
  TO authenticated
  USING (TRUE);

CREATE POLICY "global_ranking: no direct writes"
  ON global_ranking FOR INSERT
  WITH CHECK (FALSE);

CREATE POLICY "global_ranking: no direct updates"
  ON global_ranking FOR UPDATE
  USING (FALSE);

-- ────────────────────────────────────────────────────────────
-- SECTION 14 — Performance indexes
-- ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_progress_user_id
  ON user_progress (user_id);

CREATE INDEX IF NOT EXISTS idx_user_progress_tech_xp
  ON user_progress (user_id, xp_points DESC);

CREATE INDEX IF NOT EXISTS idx_certificates_user_id
  ON certificates (user_id);

CREATE INDEX IF NOT EXISTS idx_certificates_verification
  ON certificates (verification_code);

CREATE INDEX IF NOT EXISTS idx_global_ranking_xp
  ON global_ranking (total_xp DESC);

CREATE INDEX IF NOT EXISTS idx_profiles_total_xp
  ON profiles (total_xp DESC);

COMMIT;
