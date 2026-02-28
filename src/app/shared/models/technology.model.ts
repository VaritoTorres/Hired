/**
 * @file technology.model.ts
 * @description Strictly-typed model for the `technologies` table.
 *
 * Technologies represent the programming languages / frameworks a simulation
 * can be associated with (e.g. React, TypeScript, Node.js).
 */

/** Difficulty levels supported by simulations. */
export type DifficultyLevel = 'junior' | 'mid' | 'senior';

/**
 * Row representation of the `technologies` table.
 */
export interface Technology {
  /** UUID primary key */
  id: string;

  /** Human-readable name, e.g. "TypeScript" */
  name: string;

  /** URL-safe slug, e.g. "typescript" */
  slug: string;

  /** Public CDN URL for the technology logo (nullable) */
  icon_url: string | null;

  /** Broad grouping, e.g. "frontend" | "backend" | "devops" */
  category: string;

  /** ISO-8601 row creation timestamp */
  created_at: string;
}
