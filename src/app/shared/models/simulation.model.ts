/**
 * @file simulation.model.ts
 * @description Strictly-typed models for the `simulations` table.
 *
 * A simulation is a timed technical interview containing a fixed set of
 * questions for a given technology and difficulty level.
 */
import { DifficultyLevel, Technology } from './technology.model';

/** A single question as stored in the simulation's `questions` JSONB column. */
export interface SimulationQuestion {
  /** Sequential or UUID identifier within the simulation */
  id: string;

  /** Question stem displayed to the candidate */
  prompt: string;

  /** Optional list of choices for MCQ questions */
  choices?: string[];

  /**
   * Expected answer or scoring rubric (never exposed to the frontend
   * before the attempt is submitted).
   */
  // answer intentionally omitted from this interface
}

/**
 * Row representation of the `simulations` table.
 */
export interface Simulation {
  /** UUID primary key */
  id: string;

  /** Display title, e.g. "React Hooks — Mid Level" */
  title: string;

  /** Short description shown on the simulation card */
  description: string;

  /** FK → technologies.id */
  technology_id: string;

  /** Difficulty tier */
  difficulty: DifficultyLevel;

  /** Allocated time in minutes */
  duration_minutes: number;

  /** Questions stored as a typed JSON array */
  questions: SimulationQuestion[];

  /** When false the simulation is hidden from candidates */
  is_active: boolean;

  /** ISO-8601 row creation timestamp */
  created_at: string;
}

/**
 * Simulation joined with its Technology row.
 * Returned by SimulationService.getAvailableSimulations().
 */
export interface SimulationWithTechnology extends Simulation {
  technology: Technology;
}
