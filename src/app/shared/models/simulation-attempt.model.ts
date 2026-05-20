/**
 * @file simulation-attempt.model.ts
 * @description Strictly-typed models for the `simulation_attempts` table.
 *
 * An attempt is created when a user starts a simulation and is completed
 * when they submit their answers.  Score is computed server-side by the
 * `trg_score_on_attempt_complete` PostgreSQL trigger (see migration 001).
 */
import { Simulation } from './simulation.model';

/** Status lifecycle of a simulation attempt. */
export type AttemptStatus = 'in_progress' | 'completed' | 'timed_out' | 'abandoned';

/** Persisted answer for one question within an attempt. */
export interface AttemptAnswer {
  /** Matches SimulationQuestion.id (or questions.id for tagged questions) */
  question_id: string;

  /** Raw text or selected choice submitted by the candidate */
  answer: string;

  /**
   * Whether the answer was graded correct.
   * Optional for backward compatibility with older attempts.
   * Required by the concept-metrics trigger (migration 005) to update
   * user_concept_metrics.correct_answers.
   */
  is_correct?: boolean;

  /**
   * Per-question numeric score 0–100.
   * Optional for backward compatibility.
   * Consumed by the concept-metrics trigger to maintain
   * user_concept_metrics.average_score per concept.
   */
  question_score?: number;
}

/**
 * Per-category raw scores included in every completed attempt.
 * Stored as JSONB in simulation_attempts.breakdown.
 *
 * Each category scores 0–100 independently before weighting.
 *
 * Categories map to the four scoring dimensions:
 *  - concepts:        Depth of knowledge / theoretical correctness
 *  - problem_solving: Quality of the algorithmic approach
 *  - clean_code:      Readability, structure, naming conventions
 *  - performance:     Big-O awareness, memory efficiency
 */
export interface ScoreBreakdown {
  concepts:        number;
  problem_solving: number;
  clean_code:      number;
  performance:     number;
}

/**
 * Row representation of the `simulation_attempts` table.
 * Reflects both the original columns and the columns added in migration 001.
 */
export interface SimulationAttempt {
  /** UUID primary key */
  id: string;

  /** FK → profiles.id */
  user_id: string;

  /** FK → simulations.id */
  simulation_id: string;

  /**
   * Rounded integer score (0–100) — kept for backward compatibility.
   * Set server-side by the scoring trigger as ROUND(weighted_score).
   */
  score: number | null;

  /**
   * Per-category raw scores provided by the evaluator (AI or human).
   * NULL until the attempt is completed and the breakdown is submitted.
   */
  breakdown: ScoreBreakdown | null;

  /**
   * Final ponderado score (0–100, 2 decimal places).
   * Computed server-side by hired_calculate_weighted_score().
   * NULL while in_progress — present after the scoring trigger fires.
   */
  weighted_score: number | null;

  /** Lifecycle status of this attempt */
  status: AttemptStatus;

  /** Candidate's answers stored as JSONB */
  answers: AttemptAnswer[];

  /** ISO-8601 timestamp when the attempt was opened */
  started_at: string;

  /** ISO-8601 timestamp when the attempt was submitted (null if not yet complete) */
  completed_at: string | null;

  /** Elapsed seconds between start and completion */
  duration_seconds: number | null;

  /** ISO-8601 row creation timestamp */
  created_at: string;
}

/**
 * Attempt joined with its Simulation row.
 * Used on the History and Dashboard pages.
 */
export interface AttemptWithSimulation extends SimulationAttempt {
  simulation: Pick<Simulation, 'id' | 'title' | 'level' | 'technology_id'>;
}

/**
 * Payload sent to SimulationService.saveAttempt() when the candidate submits.
 *
 * `breakdown` is submitted by the frontend (evaluator layer) so the
 * server-side trigger can compute the weighted_score immediately.
 */
export interface SaveAttemptPayload {
  simulation_id: string;
  answers:          AttemptAnswer[];
  breakdown:        ScoreBreakdown;
  duration_seconds: number;
}

/**
 * Lightweight projection used in the dashboard evolution chart.
 * Contains only the fields needed to render the score-over-time graph.
 */
export interface AttemptScorePoint {
  /** ISO-8601 completion timestamp (x-axis) */
  completed_at: string;
  /** Weighted score 0–100 (y-axis) */
  weighted_score: number;
  /** Simulation title for tooltip */
  title: string;
  /** Level for colour coding */
  level: string;
}
