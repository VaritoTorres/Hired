-- =============================================================================
-- Migration: 006_subscription_plans.sql
-- Project:   HIRED — Professional Subscription & Access Control System
-- Author:    HIRED Engineering
-- Date:      2026-02-28
-- =============================================================================
--
-- OVERVIEW
-- ────────
-- Converts the plans feature from a static pricing page into a fully
-- enforced subscription system with server-side access control.
--
-- What this migration does:
--   §1  Create `subscription_plans` table     — product catalogue
--   §2  Create `user_subscriptions` table     — per-user active subscription
--   §3  Seed Free, Pro, and Elite plan rows   — canonical product data
--   §4  Add `active_subscription_id` to profiles
--   §5  Install `hired_get_active_subscription()`  — RPC: current subscription
--   §6  Install `hired_check_simulation_access()`  — RPC: can start simulation?
--   §7  Install `hired_check_feature_access()`     — RPC: generic feature gate
--   §8  Install `hired_activate_free_plan()`       — RPC: assign free plan to new user
--   §9  Install trigger `trg_assign_free_plan_on_signup`
--   §10 Backfill free subscriptions for existing users
--   §11 RLS policies for new tables
--
-- ROLLBACK
-- ────────
-- See 006_subscription_plans_rollback.sql
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- §1  SUBSCRIPTION_PLANS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      TEXT        NOT NULL UNIQUE,
  name                      TEXT        NOT NULL,
  description               TEXT        DEFAULT NULL,
  monthly_price             NUMERIC(8,2) NOT NULL DEFAULT 0,
  -- ── Capability quotas ──────────────────────────────────────────────────────
  simulations_per_month     INT         DEFAULT NULL,   -- NULL = unlimited
  max_technologies          INT         DEFAULT 1,      -- max concurrent tech slots
  -- ── Feature flags ──────────────────────────────────────────────────────────
  certification_access      BOOLEAN     NOT NULL DEFAULT FALSE,
  adaptive_ai_access        BOOLEAN     NOT NULL DEFAULT FALSE,  -- basic vs advanced
  public_profile_access     BOOLEAN     NOT NULL DEFAULT FALSE,
  pdf_reports_access        BOOLEAN     NOT NULL DEFAULT FALSE,
  extended_feedback_access  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- ── Display metadata ───────────────────────────────────────────────────────
  is_featured               BOOLEAN     NOT NULL DEFAULT FALSE,
  badge_label               TEXT        DEFAULT NULL,      -- e.g. "MÁS POPULAR"
  sort_order                INT         NOT NULL DEFAULT 0,
  -- ── Timestamps ─────────────────────────────────────────────────────────────
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  public.subscription_plans IS 'Product catalogue: subscription tiers with capability quotas and feature flags';
COMMENT ON COLUMN public.subscription_plans.simulations_per_month IS 'NULL = unlimited; positive int = monthly cap';
COMMENT ON COLUMN public.subscription_plans.max_technologies IS 'Maximum number of different technologies a user can simulate simultaneously';


-- ─────────────────────────────────────────────────────────────────────────────
-- §2  USER_SUBSCRIPTIONS TABLE
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum'
                   AND typnamespace = 'public'::regnamespace::oid) THEN
    CREATE TYPE public.subscription_status_enum AS ENUM ('active', 'cancelled', 'expired', 'trialing');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id             UUID        NOT NULL REFERENCES public.subscription_plans(id),
  status              public.subscription_status_enum NOT NULL DEFAULT 'active',
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ DEFAULT NULL,   -- NULL = never expires (free plan)
  cancelled_at        TIMESTAMPTZ DEFAULT NULL,
  -- Monthly usage counter — reset by cron or trigger at billing cycle start
  simulations_used_this_month INT NOT NULL DEFAULT 0,
  billing_cycle_start         TIMESTAMPTZ DEFAULT date_trunc('month', now()),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE  public.user_subscriptions IS 'One row per user subscription period; active plans have status=active';
COMMENT ON COLUMN public.user_subscriptions.expires_at IS 'NULL for free plan (perpetual); timestamp for paid plans';
COMMENT ON COLUMN public.user_subscriptions.simulations_used_this_month IS 'Counter incremented by hired_check_simulation_access(); reset on billing_cycle_start rollover';

CREATE INDEX IF NOT EXISTS idx_user_subs_user_id ON public.user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subs_status  ON public.user_subscriptions(user_id, status);


-- ─────────────────────────────────────────────────────────────────────────────
-- §3  SEED CANONICAL PLANS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.subscription_plans
  (slug, name, description, monthly_price,
   simulations_per_month, max_technologies,
   certification_access, adaptive_ai_access, public_profile_access,
   pdf_reports_access, extended_feedback_access,
   is_featured, badge_label, sort_order)
VALUES
  -- ── Free ───────────────────────────────────────────────────────────────────
  ('free',
   'Free',
   'Empieza a practicar. Sin tarjeta de crédito.',
   0,
   3, 1,
   FALSE, FALSE, FALSE,     -- no certs, basic AI, no public profile
   FALSE, FALSE,
   FALSE, NULL, 1),

  -- ── Pro ────────────────────────────────────────────────────────────────────
  ('pro',
   'Pro',
   'Para profesionales activos en búsqueda de trabajo.',
   19.00,
   NULL, 5,                  -- unlimited simulations, 5 tech slots
   TRUE, TRUE, TRUE,         -- certs + advanced AI + public profile
   FALSE, FALSE,
   TRUE, 'MÁS POPULAR', 2),

  -- ── Elite ──────────────────────────────────────────────────────────────────
  ('elite',
   'Elite',
   'Acceso total + reportes PDF y feedback extendido.',
   49.00,
   NULL, NULL,               -- unlimited everything
   TRUE, TRUE, TRUE,
   TRUE, TRUE,               -- PDF + extended feedback
   FALSE, 'PRÓXIMAMENTE', 3)

ON CONFLICT (slug) DO UPDATE SET
  name                      = EXCLUDED.name,
  description               = EXCLUDED.description,
  monthly_price             = EXCLUDED.monthly_price,
  simulations_per_month     = EXCLUDED.simulations_per_month,
  max_technologies          = EXCLUDED.max_technologies,
  certification_access      = EXCLUDED.certification_access,
  adaptive_ai_access        = EXCLUDED.adaptive_ai_access,
  public_profile_access     = EXCLUDED.public_profile_access,
  pdf_reports_access        = EXCLUDED.pdf_reports_access,
  extended_feedback_access  = EXCLUDED.extended_feedback_access,
  is_featured               = EXCLUDED.is_featured,
  badge_label               = EXCLUDED.badge_label,
  sort_order                = EXCLUDED.sort_order,
  updated_at                = now();


-- ─────────────────────────────────────────────────────────────────────────────
-- §4  EXTEND PROFILES WITH ACTIVE_SUBSCRIPTION_ID
-- ─────────────────────────────────────────────────────────────────────────────
-- Denormalised FK for O(1) plan lookups without joining user_subscriptions.
-- Updated by hired_activate_free_plan() and upgrade flows.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_subscription_id UUID
    REFERENCES public.user_subscriptions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.active_subscription_id IS
  'FK to the user''s current active subscription row — NULL until first plan assigned';


-- ─────────────────────────────────────────────────────────────────────────────
-- §5  RPC: hired_get_active_subscription
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the caller's active subscription joined with plan details.
-- Used by planGuard and the Plans page.

CREATE OR REPLACE FUNCTION public.hired_get_active_subscription(p_user_id UUID)
RETURNS TABLE (
  subscription_id             UUID,
  plan_id                     UUID,
  plan_slug                   TEXT,
  plan_name                   TEXT,
  monthly_price               NUMERIC,
  simulations_per_month       INT,
  simulations_used_this_month INT,
  max_technologies            INT,
  certification_access        BOOLEAN,
  adaptive_ai_access          BOOLEAN,
  public_profile_access       BOOLEAN,
  pdf_reports_access          BOOLEAN,
  extended_feedback_access    BOOLEAN,
  status                      TEXT,
  started_at                  TIMESTAMPTZ,
  expires_at                  TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    us.id                         AS subscription_id,
    sp.id                         AS plan_id,
    sp.slug                       AS plan_slug,
    sp.name                       AS plan_name,
    sp.monthly_price,
    sp.simulations_per_month,
    us.simulations_used_this_month,
    sp.max_technologies,
    sp.certification_access,
    sp.adaptive_ai_access,
    sp.public_profile_access,
    sp.pdf_reports_access,
    sp.extended_feedback_access,
    us.status::TEXT,
    us.started_at,
    us.expires_at
  FROM   public.user_subscriptions    us
  JOIN   public.subscription_plans    sp ON sp.id = us.plan_id
  WHERE  us.user_id = p_user_id
    AND  us.status  = 'active'
  ORDER  BY us.started_at DESC
  LIMIT  1;
$$;

GRANT EXECUTE ON FUNCTION public.hired_get_active_subscription(UUID) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- §6  RPC: hired_check_simulation_access
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns (allowed BOOLEAN, reason TEXT) for starting a simulation.
-- Checks:
--   a) user has an active subscription
--   b) monthly simulation cap not exceeded (NULL = unlimited)
--   c) billing cycle is current (auto-resets counter if cycle rolled over)
-- If allowed, increments simulations_used_this_month atomically.

CREATE OR REPLACE FUNCTION public.hired_check_simulation_access(p_user_id UUID)
RETURNS TABLE (allowed BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sub_id         UUID;
  v_plan_limit     INT;
  v_used           INT;
  v_cycle_start    TIMESTAMPTZ;
  v_current_cycle  TIMESTAMPTZ;
BEGIN
  v_current_cycle := date_trunc('month', now());

  -- Fetch active subscription
  SELECT us.id, sp.simulations_per_month, us.simulations_used_this_month,
         us.billing_cycle_start
  INTO   v_sub_id, v_plan_limit, v_used, v_cycle_start
  FROM   public.user_subscriptions us
  JOIN   public.subscription_plans sp ON sp.id = us.plan_id
  WHERE  us.user_id = p_user_id AND us.status = 'active'
  ORDER  BY us.started_at DESC
  LIMIT  1;

  IF v_sub_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Sin suscripción activa. Activa un plan para continuar.';
    RETURN;
  END IF;

  -- Reset counter if billing cycle rolled over
  IF v_cycle_start < v_current_cycle THEN
    UPDATE public.user_subscriptions
    SET    simulations_used_this_month = 0,
           billing_cycle_start         = v_current_cycle,
           updated_at                  = now()
    WHERE  id = v_sub_id;
    v_used := 0;
  END IF;

  -- NULL = unlimited
  IF v_plan_limit IS NULL THEN
    UPDATE public.user_subscriptions
    SET    simulations_used_this_month = v_used + 1,
           updated_at                  = now()
    WHERE  id = v_sub_id;
    RETURN QUERY SELECT TRUE, 'OK';
    RETURN;
  END IF;

  -- Check cap
  IF v_used >= v_plan_limit THEN
    RETURN QUERY SELECT FALSE,
      format('Has alcanzado el límite de %s simulaciones este mes. Actualiza tu plan para continuar.', v_plan_limit);
    RETURN;
  END IF;

  -- Consume one slot
  UPDATE public.user_subscriptions
  SET    simulations_used_this_month = v_used + 1,
         updated_at                  = now()
  WHERE  id = v_sub_id;

  RETURN QUERY SELECT TRUE, 'OK';
END;
$$;

GRANT EXECUTE ON FUNCTION public.hired_check_simulation_access(UUID) TO authenticated;

COMMENT ON FUNCTION public.hired_check_simulation_access IS
  'Gate function for starting simulations. Returns (allowed, reason) and consumes one quota slot atomically.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §7  RPC: hired_check_feature_access
-- ─────────────────────────────────────────────────────────────────────────────
-- Generic feature gate.  Returns (allowed, reason, required_plan).
-- feature_key must match a BOOLEAN column name in subscription_plans.

CREATE OR REPLACE FUNCTION public.hired_check_feature_access(
  p_user_id    UUID,
  p_feature    TEXT   -- 'certification_access' | 'adaptive_ai_access' | etc.
)
RETURNS TABLE (allowed BOOLEAN, reason TEXT, required_plan TEXT)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_has_access     BOOLEAN;
  v_plan_name      TEXT;
  v_min_plan_name  TEXT;
BEGIN
  -- Look up current subscription feature flag dynamically
  EXECUTE format(
    'SELECT sp.%I, sp.name
     FROM   public.user_subscriptions us
     JOIN   public.subscription_plans sp ON sp.id = us.plan_id
     WHERE  us.user_id = $1 AND us.status = ''active''
     ORDER  BY us.started_at DESC LIMIT 1',
    p_feature
  )
  USING p_user_id
  INTO  v_has_access, v_plan_name;

  IF v_has_access IS NULL THEN
    RETURN QUERY SELECT FALSE,
      'Sin suscripción activa.',
      'pro';
    RETURN;
  END IF;

  IF v_has_access THEN
    RETURN QUERY SELECT TRUE, 'OK', v_plan_name;
    RETURN;
  END IF;

  -- Find the cheapest plan that includes this feature
  EXECUTE format(
    'SELECT name FROM public.subscription_plans
     WHERE  %I = TRUE
     ORDER  BY monthly_price ASC LIMIT 1',
    p_feature
  )
  INTO v_min_plan_name;

  RETURN QUERY SELECT FALSE,
    format('Esta función requiere el plan %s o superior.', COALESCE(v_min_plan_name, 'Pro')),
    COALESCE(v_min_plan_name, 'Pro');
END;
$$;

GRANT EXECUTE ON FUNCTION public.hired_check_feature_access(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.hired_check_feature_access IS
  'Generic feature gate. Returns (allowed, reason, required_plan) for any boolean feature column.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §8  RPC: hired_activate_free_plan
-- ─────────────────────────────────────────────────────────────────────────────
-- Creates a free subscription for a user who has none.
-- Called by the signup trigger (§9) and manually for existing users (§10).

CREATE OR REPLACE FUNCTION public.hired_activate_free_plan(p_user_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_free_plan_id  UUID;
  v_sub_id        UUID;
  v_existing_id   UUID;
BEGIN
  -- Idempotency: skip if user already has an active subscription
  SELECT id INTO v_existing_id
  FROM   public.user_subscriptions
  WHERE  user_id = p_user_id AND status = 'active'
  LIMIT  1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  SELECT id INTO v_free_plan_id
  FROM   public.subscription_plans
  WHERE  slug = 'free'
  LIMIT  1;

  IF v_free_plan_id IS NULL THEN
    RAISE EXCEPTION 'Free plan not found in subscription_plans';
  END IF;

  INSERT INTO public.user_subscriptions
    (user_id, plan_id, status, started_at, expires_at)
  VALUES
    (p_user_id, v_free_plan_id, 'active', now(), NULL)
  RETURNING id INTO v_sub_id;

  -- Update the denormalised FK on profiles
  UPDATE public.profiles
  SET    active_subscription_id = v_sub_id,
         updated_at             = now()
  WHERE  id = p_user_id;

  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hired_activate_free_plan(UUID) TO authenticated;

COMMENT ON FUNCTION public.hired_activate_free_plan IS
  'Idempotent: creates a free subscription for a new user. Called by signup trigger.';


-- ─────────────────────────────────────────────────────────────────────────────
-- §9  TRIGGER: assign free plan on new profile creation
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.hired_trg_fn_assign_free_plan()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.hired_activate_free_plan(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_free_plan_on_signup ON public.profiles;

CREATE TRIGGER trg_assign_free_plan_on_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.hired_trg_fn_assign_free_plan();

COMMENT ON TRIGGER trg_assign_free_plan_on_signup ON public.profiles IS
  'Automatically assigns the free plan to every new user at registration';


-- ─────────────────────────────────────────────────────────────────────────────
-- §10  BACKFILL: create free subscriptions for existing users
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN
    SELECT p.id
    FROM   public.profiles p
    WHERE  NOT EXISTS (
      SELECT 1 FROM public.user_subscriptions us
      WHERE  us.user_id = p.id AND us.status = 'active'
    )
  LOOP
    PERFORM public.hired_activate_free_plan(v_user.id);
  END LOOP;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- §11  ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- subscription_plans — public read, admin write
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sub_plans_public_read ON public.subscription_plans;
CREATE POLICY sub_plans_public_read ON public.subscription_plans
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS sub_plans_admin_write ON public.subscription_plans;
CREATE POLICY sub_plans_admin_write ON public.subscription_plans
  FOR ALL USING (FALSE);  -- write via service role key

-- user_subscriptions — users read/see only their own, trigger writes for all
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_subs_owner_read  ON public.user_subscriptions;
CREATE POLICY user_subs_owner_read ON public.user_subscriptions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS user_subs_admin_read  ON public.user_subscriptions;
CREATE POLICY user_subs_admin_read ON public.user_subscriptions
  FOR SELECT USING (FALSE);  -- admin reads via service role key

-- ─────────────────────────────────────────────────────────────────────────────
-- END OF MIGRATION 006
-- ─────────────────────────────────────────────────────────────────────────────
