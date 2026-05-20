-- =============================================================================
-- Rollback: 006_subscription_plans_rollback.sql
-- Reverses all changes made by 006_subscription_plans.sql in reverse order.
-- =============================================================================

-- §9 — Drop signup trigger
DROP TRIGGER IF EXISTS trg_assign_free_plan_on_signup ON public.profiles;
DROP FUNCTION IF EXISTS public.hired_trg_fn_assign_free_plan();

-- §8 — Drop free plan activation RPC
DROP FUNCTION IF EXISTS public.hired_activate_free_plan(UUID);

-- §7 — Drop feature access check
DROP FUNCTION IF EXISTS public.hired_check_feature_access(UUID, TEXT);

-- §6 — Drop simulation access check
DROP FUNCTION IF EXISTS public.hired_check_simulation_access(UUID);

-- §5 — Drop active subscription query
DROP FUNCTION IF EXISTS public.hired_get_active_subscription(UUID);

-- §4 — Remove column from profiles
ALTER TABLE IF EXISTS public.profiles
  DROP COLUMN IF EXISTS active_subscription_id;

-- §11 — Drop RLS policies before dropping tables
ALTER TABLE IF EXISTS public.user_subscriptions DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_subs_admin_read  ON public.user_subscriptions;
DROP POLICY IF EXISTS user_subs_owner_read  ON public.user_subscriptions;

ALTER TABLE IF EXISTS public.subscription_plans DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sub_plans_admin_write ON public.subscription_plans;
DROP POLICY IF EXISTS sub_plans_public_read ON public.subscription_plans;

-- §2 — Drop user_subscriptions
DROP TABLE IF EXISTS public.user_subscriptions;

-- §1 — Drop subscription_plans
DROP TABLE IF EXISTS public.subscription_plans;

-- Drop enum type
DROP TYPE IF EXISTS public.subscription_status_enum;
