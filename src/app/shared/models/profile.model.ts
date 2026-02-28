/**
 * @file profile.model.ts
 * @description Strictly-typed models for the `profiles` table.
 *
 * The `profiles` table extends `auth.users` with app-specific fields.
 * Every field is typed against the PostgreSQL column type.
 */

/** Supported subscription plan slugs — kept in sync with the `plans` table. */
export type PlanSlug = 'free' | 'pro' | 'enterprise';

/**
 * Row representation of the `profiles` table.
 * Maps 1-to-1 with the database schema; no any types.
 */
export interface Profile {
  /** UUID — mirrors auth.users.id */
  id: string;

  /** User's display name */
  full_name: string;

  /** Public avatar URL (can be null for new users) */
  avatar_url: string | null;

  /** Free-text bio */
  bio: string | null;

  /** GitHub profile URL */
  github_url: string | null;

  /** LinkedIn profile URL */
  linkedin_url: string | null;

  /** FK → plans.id */
  plan_id: string;

  /** ISO-8601 timestamp when the paid plan expires (null for free plan) */
  plan_expires_at: string | null;

  /** ISO-8601 row creation timestamp */
  created_at: string;

  /** ISO-8601 last-updated timestamp */
  updated_at: string;
}

/**
 * Payload accepted by ProfileService.updateProfile().
 * All fields are optional — send only the ones being changed.
 */
export type UpdateProfilePayload = Partial<
  Pick<Profile, 'full_name' | 'avatar_url' | 'bio' | 'github_url' | 'linkedin_url'>
>;

/**
 * Denormalised view returned by getUserPlan().
 * Joins profile with the plan row for a single query.
 */
export interface ProfileWithPlan extends Profile {
  plan: import('./plan.model').Plan;
}
