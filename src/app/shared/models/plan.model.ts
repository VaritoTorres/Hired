/**
 * @file plan.model.ts
 * @description Strictly-typed models for the `plans` table.
 *
 * Reflects the exact columns stored in PostgreSQL.
 * Used by PlansService, ProfileService, SimulationService, and planGuard.
 */

/** Canonical slug identifiers for subscription tiers. */
export type PlanSlug = 'free' | 'pro' | 'enterprise';

/**
 * Row representation of the `plans` table.
 */
export interface Plan {
  /** UUID primary key */
  id: string;

  /** Display name (e.g. "Pro Monthly") */
  name: string;

  /** Machine-readable tier slug */
  slug: PlanSlug;

  /** Monthly price in USD cents (0 for free) */
  price_monthly: number;

  /** Annual price in USD cents (0 for free) */
  price_yearly: number;

  /** Maximum simulations allowed per calendar month (null = unlimited) */
  max_simulations_per_month: number | null;

  /** Feature flags / bullet points stored as a JSON array of strings */
  features: string[];

  /** Whether this plan is highlighted as recommended on the pricing page */
  is_featured: boolean;

  /** ISO-8601 row creation timestamp */
  created_at: string;
}

// ─── Plan feature flags ───────────────────────────────────────────────────────

/**
 * Logical feature keys used by planGuard and the UI to gate access.
 * Add a new key here whenever a gated feature is introduced.
 */
export type PlanFeature =
  | 'certificates'   // Download/share certificates → Pro+
  | 'ranking'        // Global ranking board         → Pro+
  | 'advanced_ai'    // GPT-based feedback           → Enterprise
  | 'custom_tracks'; // Custom learning paths        → Enterprise

/**
 * Mapping from PlanSlug to the set of features unlocked at that tier.
 * Evaluated at runtime inside planGuard — no magic strings in components.
 */
export const PLAN_FEATURES: Record<PlanSlug, PlanFeature[]> = {
  free:       [],
  pro:        ['certificates', 'ranking'],
  enterprise: ['certificates', 'ranking', 'advanced_ai', 'custom_tracks'],
};

/**
 * Helper: returns true when the given plan slug unlocks the requested feature.
 *
 * @example
 * hasPlanFeature('pro', 'certificates') // → true
 * hasPlanFeature('free', 'ranking')     // → false
 */
export function hasPlanFeature(slug: PlanSlug, feature: PlanFeature): boolean {
  return PLAN_FEATURES[slug]?.includes(feature) ?? false;
}
