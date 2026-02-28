/**
 * @file technical-score.model.ts
 * @description Strictly-typed model for the `technical_scores` table.
 *
 * Aggregated scores per user per technology.  Kept in sync by a Supabase
 * DB trigger / Edge Function that recalculates after every submitted attempt.
 */
import { Technology } from './technology.model';

/**
 * Row representation of the `technical_scores` table.
 */
export interface TechnicalScore {
  /** UUID primary key */
  id: string;

  /** FK → profiles.id */
  user_id: string;

  /** FK → technologies.id */
  technology_id: string;

  /** Running average score (0–100) across all completed attempts */
  average_score: number;

  /** Total number of completed attempts for this technology */
  total_attempts: number;

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
