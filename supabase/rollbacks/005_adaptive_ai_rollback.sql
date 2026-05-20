-- =============================================================================
-- Rollback: 005_adaptive_ai_rollback.sql
-- Reverses all changes made by 005_adaptive_ai.sql in reverse order.
-- =============================================================================

-- §13 — Drop RLS policies
ALTER TABLE IF EXISTS public.user_concept_metrics DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ucm_admin_read       ON public.user_concept_metrics;
DROP POLICY IF EXISTS ucm_owner_read       ON public.user_concept_metrics;

ALTER TABLE IF EXISTS public.questions     DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS questions_admin_write ON public.questions;
DROP POLICY IF EXISTS questions_auth_read   ON public.questions;

ALTER TABLE IF EXISTS public.concepts      DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS concepts_admin_write ON public.concepts;
DROP POLICY IF EXISTS concepts_public_read ON public.concepts;

-- §12 — Drop RPC get_weak_concepts
DROP FUNCTION IF EXISTS public.get_weak_concepts(UUID);

-- §11 — Drop RPC get_competence_map
DROP FUNCTION IF EXISTS public.get_competence_map(UUID);

-- §10 — Drop view v_competence_map
DROP VIEW IF EXISTS public.v_competence_map;

-- §9 — Drop stagnation detection function
DROP FUNCTION IF EXISTS public.hired_check_stagnation(UUID, UUID, JSONB);

-- §8 — Drop trigger
DROP TRIGGER IF EXISTS trg_concept_metrics_on_attempt ON public.simulation_attempts;

-- §7 — Drop trigger worker function
DROP FUNCTION IF EXISTS public.hired_trg_fn_update_concept_metrics();

-- §6 — Drop classification function
DROP FUNCTION IF EXISTS public.hired_classify_weakness(NUMERIC);

-- §5 — Drop weakness index function
DROP FUNCTION IF EXISTS public.hired_compute_weakness_index(INT, INT, NUMERIC);

-- §3 — Drop user_concept_metrics
DROP TABLE IF EXISTS public.user_concept_metrics;

-- §2 — Drop questions
DROP TABLE IF EXISTS public.questions;

-- §1 — Drop concepts
DROP TABLE IF EXISTS public.concepts;
