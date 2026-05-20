/**
 * @file technical-score.model.ts
 * @description Strictly-typed model for the `technical_scores` table.
 *
 * Aggregated scores per user per technology.  Kept in sync by the
 * `trg_score_on_attempt_complete` trigger (see migration 001).
 */
import { Technology } from './technology.model';

/**
 * Tier labels returned by hired_estimate_level() in PostgreSQL.
 * Thresholds: <50 beginner · <70 junior · <85 mid · ≥85 senior.
 */
export type LevelEstimate = 'beginner' | 'junior' | 'mid' | 'senior';

/** Display metadata for each level (used in the dashboard badge). */
export const LEVEL_META: Record<LevelEstimate, { label: string; color: string }> = {
  beginner: { label: 'Beginner',    color: '#94a3b8' },
  junior:   { label: 'Junior',      color: '#f59e0b' },
  mid:      { label: 'Mid-Level',   color: '#6366f1' },
  senior:   { label: 'Senior',      color: '#16a34a' },
};

/**
 * Row representation of the `technical_scores` table.
 * Includes the new columns added in migration 001.
 */
export interface TechnicalScore {
  /** UUID primary key */
  id: string;

  /** FK → profiles.id */
  user_id: string;

  /** FK → technologies.id */
  technology_id: string;

  /** Running weighted average score (0–100, 2 dp) */
  average_score: number;

  /** Total completed attempts contributing to the average */
  total_attempts: number;

  /**
   * Estimated experience tier derived from average_score.
   * Recomputed after every attempt by hired_estimate_level().
   */
  level_estimated: LevelEstimate | null;

  /**
   * Percentile rank placeholder (0–100).
   * NULL until the ranking phase is implemented.
   */
  percentile_rank: number | null;

  /**
   * The scoring breakdown category with the lowest average.
   * Values: 'concepts' | 'problem_solving' | 'clean_code' | 'performance'
   * Updated by hired_trg_fn_progress_on_attempt_complete() after each attempt.
   * NULL until at least one attempt with breakdown data exists.
   */
  weakest_area: 'concepts' | 'problem_solving' | 'clean_code' | 'performance' | null;

  /** ISO-8601 timestamp of the most recent attempt */
  last_attempted_at: string;

  /** ISO-8601 timestamp of the last recalculation */
  updated_at: string;
}

/**
 * Score joined with its Technology row.
 * Returned by ScoreService.getTechnicalScores() for display on the Dashboard.
 */
export interface TechnicalScoreWithTechnology extends TechnicalScore {
  technology: Technology;
}
