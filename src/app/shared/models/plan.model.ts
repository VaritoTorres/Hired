/**
 * @file plan.model.ts
 * @description Typed interfaces for the professional subscription system (migration 006).
 *
 * Covers:
 *  - SubscriptionPlan   -> row in `subscription_plans`
 *  - UserSubscription   -> row in `user_subscriptions`
 *  - ActiveSubscription -> shape returned by `hired_get_active_subscription()` RPC
 *  - PlanFeature / PlanSlug -> feature-gate keys consumed by planGuard
 *  - PLAN_DISPLAY_META  -> UI configuration (colors, icons, labels)
 *
 * The legacy `Plan` interface is preserved at the bottom for backward
 * compatibility with profile.service.ts getUserPlan().
 */

// Canonical plan slugs

/** Machine-readable tier identifier persisted in subscription_plans.slug */
export type PlanSlug = 'free' | 'pro' | 'elite';

// Feature keys -- must match boolean column names in subscription_plans

/**
 * Each key maps to a BOOLEAN column in `subscription_plans`.
 * Used by planGuard and hired_check_feature_access() RPC.
 */
export type PlanFeature =
  | 'certification_access'
  | 'adaptive_ai_access'
  | 'public_profile_access'
  | 'pdf_reports_access'
  | 'extended_feedback_access';

// Database row types

/** Row in the `subscription_plans` table. */
export interface SubscriptionPlan {
  id: string;
  slug: PlanSlug;
  name: string;
  description: string | null;
  monthly_price: number;
  simulations_per_month: number | null;   // NULL = unlimited
  max_technologies: number | null;         // NULL = unlimited
  certification_access:     boolean;
  adaptive_ai_access:       boolean;
  public_profile_access:    boolean;
  pdf_reports_access:       boolean;
  extended_feedback_access: boolean;
  is_featured:  boolean;
  badge_label:  string | null;
  sort_order:   number;
  created_at:   string;
  updated_at:   string;
}

/** Lifecycle status of a user subscription */
export type SubscriptionStatus = 'active' | 'cancelled' | 'expired' | 'trialing';

/** Row in the `user_subscriptions` table. */
export interface UserSubscription {
  id:                           string;
  user_id:                      string;
  plan_id:                      string;
  status:                       SubscriptionStatus;
  started_at:                   string;
  expires_at:                   string | null;
  cancelled_at:                 string | null;
  simulations_used_this_month:  number;
  billing_cycle_start:          string;
  created_at:                   string;
  updated_at:                   string;
}

// RPC return type

/** Shape returned by `hired_get_active_subscription(p_user_id)` RPC. */
export interface ActiveSubscription {
  subscription_id:              string;
  plan_id:                      string;
  plan_slug:                    PlanSlug;
  plan_name:                    string;
  monthly_price:                number;
  simulations_per_month:        number | null;
  simulations_used_this_month:  number;
  max_technologies:             number | null;
  certification_access:         boolean;
  adaptive_ai_access:           boolean;
  public_profile_access:        boolean;
  pdf_reports_access:           boolean;
  extended_feedback_access:     boolean;
  status:                       string;
  started_at:                   string;
  expires_at:                   string | null;
}

/** Result of access-check RPCs */
export interface AccessCheckResult {
  allowed:        boolean;
  reason:         string;
  required_plan?: string;
}

// UI display configuration

export interface PlanDisplayMeta {
  color:       string;
  colorBg:     string;
  icon:        string;
  ctaLabel:    string;
  comingSoon:  boolean;
}

export const PLAN_DISPLAY_META: Record<PlanSlug, PlanDisplayMeta> = {
  free: {
    color:     '#64748b',
    colorBg:   'rgba(100,116,139,0.08)',
    icon:      'target',
    ctaLabel:  'Empezar gratis',
    comingSoon: false,
  },
  pro: {
    color:     '#6366f1',
    colorBg:   'rgba(99,102,241,0.08)',
    icon:      'rocket',
    ctaLabel:  'Activar Pro',
    comingSoon: false,
  },
  elite: {
    color:     '#f59e0b',
    colorBg:   'rgba(245,158,11,0.08)',
    icon:      'trophy',
    ctaLabel:  'Proximamente',
    comingSoon: true,
  },
};

/** Human-readable feature descriptions for the comparison table */
export const FEATURE_LABELS: Record<PlanFeature, string> = {
  certification_access:     'Certificados verificables',
  adaptive_ai_access:       'IA adaptativa avanzada',
  public_profile_access:    'Perfil publico /u/:slug',
  pdf_reports_access:       'Reporte PDF profesional',
  extended_feedback_access: 'Feedback extendido por IA',
};

// Backward-compatibility aliases (used by profile.service.ts + plan.guard.ts)

/** @deprecated Legacy `plans` table row. Kept for profile.service.ts getUserPlan(). */
export interface Plan {
  id:                        string;
  name:                      string;
  slug:                      PlanSlug;
  price_monthly:             number;
  price_yearly:              number;
  max_simulations_per_month: number | null;
  features:                  string[];
  is_featured:               boolean;
  created_at:                string;
}

/** @deprecated Maps slugs to features for planGuard backward compat. */
export const PLAN_FEATURES: Record<PlanSlug, PlanFeature[]> = {
  free:  [],
  pro:   ['certification_access', 'adaptive_ai_access', 'public_profile_access'],
  elite: ['certification_access', 'adaptive_ai_access', 'public_profile_access',
          'pdf_reports_access',   'extended_feedback_access'],
};

/** @deprecated Use planGuard (RPC-based) instead. */
export function hasPlanFeature(slug: PlanSlug, feature: PlanFeature): boolean {
  return PLAN_FEATURES[slug]?.includes(feature) ?? false;
}
