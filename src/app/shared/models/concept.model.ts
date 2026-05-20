/**
 * @file concept.model.ts
 * @description Typed interfaces for the Adaptive AI — Diagnostic Intelligence layer.
 *
 * Covers:
 *  - Concept         → row in `concepts` table
 *  - Question        → row in `questions` table (normalised question bank)
 *  - UserConceptMetrics → row in `user_concept_metrics` table
 *  - CompetenceMapItem  → shape returned by `get_competence_map()` RPC
 *  - WeaknessClass + WEAKNESS_META → display configuration for the UI
 *  - CognitiveLevel    → Bloom's taxonomy tiers used in tagging
 */

/**
 * Simplified Bloom's taxonomy dimension used to tag each question.
 *
 *  recordar   → recall facts / memorise
 *  comprender → explain, describe, summarise
 *  aplicar    → use knowledge in a new context
 *  analizar   → break down, differentiate, compare
 *  evaluar    → judge, critique, justify
 */
export type CognitiveLevel = 'recordar' | 'comprender' | 'aplicar' | 'analizar' | 'evaluar';

/** Display label for each cognitive level. */
export const COGNITIVE_LEVEL_LABELS: Record<CognitiveLevel, string> = {
  recordar:   'Recordar',
  comprender: 'Comprender',
  aplicar:    'Aplicar',
  analizar:   'Analizar',
  evaluar:    'Evaluar',
};

// ─────────────────────────────────────────────────────────────────────────────
// Weakness classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Three-tier weakness label matching the SQL `hired_classify_weakness()` logic.
 *  debil     → WeaknessIndex ≥ 0.6
 *  inestable → 0.3 ≤ WeaknessIndex < 0.6
 *  dominado  → WeaknessIndex < 0.3
 */
export type WeaknessClass = 'debil' | 'inestable' | 'dominado';

/** Thresholds that mirror the PostgreSQL classify function */
export const WEAKNESS_THRESHOLDS = {
  WEAK:     0.60,
  UNSTABLE: 0.30,
} as const;

/** UI display metadata for each class */
export const WEAKNESS_META: Record<WeaknessClass, {
  label:  string;
  color:  string;
  bg:     string;
  emoji:  string;
  description: string;
}> = {
  debil: {
    label:  'Débil',
    color:  '#ef4444',
    bg:     'rgba(239,68,68,0.12)',
    emoji:  '🔴',
    description: 'Necesita trabajo urgente — errores frecuentes o puntaje muy bajo.',
  },
  inestable: {
    label:  'Inestable',
    color:  '#f59e0b',
    bg:     'rgba(245,158,11,0.12)',
    emoji:  '🟡',
    description: 'Desempeño inconsistente — aciertos alternados con errores.',
  },
  dominado: {
    label:  'Dominado',
    color:  '#22c55e',
    bg:     'rgba(34,197,94,0.12)',
    emoji:  '🟢',
    description: 'Concepto bien consolidado — respuestas precisas y consistentes.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Database row types
// ─────────────────────────────────────────────────────────────────────────────

/** Row in the `concepts` table. */
export interface Concept {
  /** UUID primary key */
  id: string;
  /** FK → technologies.id */
  technology_id: string;
  /** Human-readable name, e.g. "useEffect lifecycle" */
  name: string;
  /** Grouping within technology, e.g. "Hooks", "State Management" */
  category: string | null;
  /** Optional extended description */
  description: string | null;
  /** ISO-8601 creation timestamp */
  created_at: string;
  /** ISO-8601 last-updated timestamp */
  updated_at: string;
}

/** Row in the `questions` table — normalised question bank entry. */
export interface Question {
  /** UUID primary key */
  id: string;
  /** Optional FK → simulations.id */
  simulation_id: string | null;
  /** Optional FK → concepts.id */
  concept_id: string | null;
  /** Question stem */
  prompt: string;
  /** MCQ choices array; null for open-ended questions */
  choices: string[] | null;
  /** 0-based correct index into choices[]; null for open-ended */
  correct_choice_index: number | null;
  /** Difficulty from 1 (trivial) to 5 (expert) */
  difficulty_level: number | null;
  /** Bloom's taxonomy tier */
  cognitive_level: CognitiveLevel | null;
  /** Whether this question is shown in simulations */
  is_active: boolean;
  /** ISO-8601 creation timestamp */
  created_at: string;
  /** ISO-8601 last-updated timestamp */
  updated_at: string;
}

/** Row in the `user_concept_metrics` table. */
export interface UserConceptMetrics {
  /** UUID primary key */
  id: string;
  /** FK → profiles.id */
  user_id: string;
  /** FK → concepts.id */
  concept_id: string;
  /** Total number of answers submitted for this concept */
  attempts: number;
  /** Number of correct answers */
  correct_answers: number;
  /** Running average score (0–100) across all answers for this concept */
  average_score: number;
  /**
   * JSONB array storing the last 10 per-question scores.
   * Used internally by stagnation detection; length ≤ 10.
   */
  score_history: number[];
  /**
   * TRUE when ≥5 attempts exist and the last 3 scores span < 5 points.
   * Indicates the user is stuck and not improving.
   */
  learning_stagnation: boolean;
  /** ISO-8601 timestamp of last interaction */
  last_attempt_at: string | null;
  /** ISO-8601 of last metric recalculation */
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// RPC return types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shape of a single row returned by the `get_competence_map(p_user_id)` RPC.
 * Combines user_concept_metrics, concepts, and technologies into a flat object
 * with pre-computed weakness_index and weakness_class.
 */
export interface CompetenceMapItem {
  /** FK → concepts.id */
  concept_id: string;
  /** e.g. "useEffect lifecycle" */
  concept_name: string;
  /** e.g. "Hooks" */
  concept_category: string | null;
  /** FK → technologies.id */
  technology_id: string;
  /** e.g. "React" */
  technology_name: string;
  /** e.g. "react" */
  technology_slug: string;
  /** URL of the technology icon */
  technology_icon: string | null;
  /**
   * Highest cognitive level present in the question bank for this concept.
   * Represents the depth of evaluation available.
   */
  cognitive_level: CognitiveLevel | null;
  /** Maximum question difficulty level (1–5) for this concept */
  max_difficulty: number | null;
  /** Total answers given for this concept */
  attempts: number;
  /** Total correct answers */
  correct_answers: number;
  /** Running average score 0–100 */
  average_score: number;
  /** correct_answers / attempts, range 0–1 */
  accuracy_rate: number;
  /**
   * Composite weakness index 0–1.
   * Formula: (1-accuracy)*0.6 + (1-avg_score/100)*0.3 + attempt_penalty*0.1
   */
  weakness_index: number;
  /** Derived classification: 'debil' | 'inestable' | 'dominado' */
  weakness_class: WeaknessClass;
  /** TRUE when the user is stuck (no improvement in last 3 attempts) */
  learning_stagnation: boolean;
  /** ISO-8601 of last interaction with this concept */
  last_attempt_at: string | null;
}

/** Shape returned by `get_weak_concepts(p_user_id)` — Débil tier only */
export interface WeakConceptSummary {
  concept_id:          string;
  concept_name:        string;
  concept_category:    string | null;
  technology_name:     string;
  weakness_index:      number;
  attempts:            number;
  average_score:       number;
  learning_stagnation: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Frontend helper: CompetenceMapItem grouped by technology
// ─────────────────────────────────────────────────────────────────────────────

/** Items grouped by a single technology for rendering the competence map. */
export interface TechnologyConceptGroup {
  technology_id:   string;
  technology_name: string;
  technology_slug: string;
  technology_icon: string | null;
  concepts:        CompetenceMapItem[];
  /** Summary stats computed client-side */
  total:           number;
  weak:            number;
  unstable:        number;
  dominated:       number;
}

/** Extended AttemptAnswer with per-question correctness (optional, backward-compat). */
export interface AttemptAnswerExtended {
  /** Matches questions.id (or legacy SimulationQuestion.id in JSONB) */
  question_id: string;
  /** Raw text or selected choice */
  answer: string;
  /** Whether the answer was graded correct */
  is_correct?: boolean;
  /** Per-question numeric score 0–100 */
  question_score?: number;
}
