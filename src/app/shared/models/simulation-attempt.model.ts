/**
 * @file simulation-attempt.model.ts
 * @description Strictly-typed models for the `simulation_attempts` table.
 *
 * An attempt is created when a user starts a simulation and is completed
 * when they submit their answers.  Score is computed server-side via a
 * Supabase Edge Function / DB trigger.
 */
import { Simulation } from './simulation.model';

/** Status lifecycle of a simulation attempt. */
export type AttemptStatus = 'in_progress' | 'completed' | 'timed_out' | 'abandoned';

/** Persisted answer for one question within an attempt. */
export interface AttemptAnswer {
  /** Matches SimulationQuestion.id */
  question_id: string;

  /** Raw text or selected choice submitted by the candidate */
  answer: string;
}

/**
 * Row representation of the `simulation_attempts` table.
 */
export interface SimulationAttempt {
  /** UUID primary key */
  id: string;

  /** FK → profiles.id */
  user_id: string;

  /** FK → simulations.id */
  simulation_id: string;

  /** 0-100 score computed after submission (null while in_progress) */
  score: number | null;

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
  simulation: Pick<Simulation, 'id' | 'title' | 'difficulty' | 'technology_id'>;
}

/**
 * Payload sent to SimulationService.saveAttempt() when the candidate submits.
 */
export interface SaveAttemptPayload {
  simulation_id: string;
  answers: AttemptAnswer[];
  duration_seconds: number;
}
