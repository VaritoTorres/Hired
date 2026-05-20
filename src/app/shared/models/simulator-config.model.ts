/**
 * @file simulator-config.model.ts
 * @description Strictly-typed models for the Simulator configuration wizard.
 *
 * These types cover the full 6-phase simulation pipeline:
 *  Phase 1  — User configures the simulation (vacancy, company, difficulty, etc.)
 *  Phase 2  — AI analyses the vacancy and generates the exam
 *  Phase 3  — Controlled exam environment
 *  Phase 4  — Automatic evaluation
 *  Phase 5  — Intelligent feedback
 *  Phase 6  — Professional diagnostic
 */

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Configuration enumerations
// ─────────────────────────────────────────────────────────────────────────────

/** Type of hiring company — drives pressure, time and complexity. */
export type CompanyType =
  | 'startup'
  | 'mid_company'
  | 'corporate'
  | 'faang';

/** Difficulty adjustment relative to the vacancy's estimated level. */
export type DifficultyMode =
  | 'vacancy_match'   // Automatic — matches the vacancy level
  | 'challenge'       // One level higher than estimated
  | 'training';       // One level lower  than estimated

/** Structural type of the exam generated. */
export type EvaluationType =
  | 'theoretical'     // Conceptual knowledge
  | 'practical'       // Code / technical resolution
  | 'case_study'      // Real business case
  | 'mixed';          // Combination of all three

/** Pressure / feedback mode for the exam session. */
export type PressureMode =
  | 'practice'        // Feedback shown during the exam
  | 'interview'       // No feedback until submission
  | 'high_pressure';  // Reduced time + elevated difficulty

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Config form submitted by the user
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The complete configuration that the user fills in before the exam begins.
 * Stored in the `session_config` JSONB column of `simulation_attempts`.
 */
export interface SimulatorConfig {
  /** Full vacancy description text — required, drives AI analysis. */
  vacancy_description: string;

  /** Type of company advertising the role. */
  company_type: CompanyType;

  /** Difficulty offset relative to the auto-detected level. */
  difficulty_mode: DifficultyMode;

  /** Structural format of the generated exam. */
  evaluation_type: EvaluationType;

  /** Pressure / feedback level for the session. */
  pressure_mode: PressureMode;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — AI vacancy analysis result
// ─────────────────────────────────────────────────────────────────────────────

/** Experience level estimated by the AI from the vacancy text. */
export type EstimatedLevel = 'junior' | 'mid' | 'senior' | 'staff';

/**
 * Structured result returned by the AI after analysing the vacancy description.
 * Stored in the `ai_analysis` JSONB column of `simulation_attempts`.
 */
export interface VacancyAnalysis {
  /** List of technology names detected in the vacancy. */
  detected_technologies: string[];

  /** Primary programming language or framework. */
  primary_technology: string;

  /** Experience level estimated from the vacancy. */
  estimated_level: EstimatedLevel;

  /** Role type extracted from the vacancy (e.g. "Frontend Engineer"). */
  role_type: string;

  /** 0–10 complexity score derived from the vacancy requirements. */
  complexity_score: number;

  /** Key technical concepts and topics identified. */
  key_concepts: string[];

  /** Soft skills or process skills mentioned. */
  process_skills: string[];

  /** Brief context paragraph summarising the role. */
  role_summary: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 2 — Generated exam structure
// ─────────────────────────────────────────────────────────────────────────────

/** Category / dimension of a single question. */
export type QuestionCategory =
  | 'theoretical'
  | 'practical'
  | 'case_study'
  | 'algorithmic'
  | 'system_design'
  | 'behavioral';

/** Response format expected from the candidate. */
export type QuestionFormat =
  | 'multiple_choice'
  | 'free_text'
  | 'code'
  | 'multi_step';

/** A single AI-generated question for the simulator exam. */
export interface SimulatorQuestion {
  /** UUID — unique within the session. */
  id: string;

  /** Question body shown to the candidate. */
  prompt: string;

  /** Structural category of the question. */
  category: QuestionCategory;

  /** Expected response format. */
  format: QuestionFormat;

  /** Difficulty 1 (easy) – 5 (expert). */
  difficulty: number;

  /** Concept or topic this question tests. */
  concept: string;

  /** Multiple-choice options (only present when format = 'multiple_choice'). */
  choices?: string[];

  /** Programming language hint for code questions. */
  language?: string;

  /** Edge cases the candidate should consider (revealed after submission). */
  edge_cases?: string[];

  /**
   * Expected answer / evaluation rubric.
   * NEVER exposed to the frontend before submission.
   */
  expected_answer?: string;

  /** Weight of this question in the final score (default 1.0). */
  weight: number;
}

/**
 * The fully structured exam generated by the AI for this session.
 * Stored in `simulation_attempts.generated_exam` JSONB column.
 */
export interface GeneratedExam {
  /** Unique exam id for this session. */
  exam_id: string;

  /** Human-readable title, e.g. "Entrevista Senior React — FAANG". */
  title: string;

  /** Allocated time in minutes. */
  duration_minutes: number;

  /** List of questions (already ordered by section). */
  questions: SimulatorQuestion[];

  /** Distribution summary for display. */
  distribution: {
    theoretical: number;
    practical:   number;
    case_study:  number;
  };

  /** Generated at ISO-8601 timestamp. */
  generated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Exam session state (runtime, not persisted)
// ─────────────────────────────────────────────────────────────────────────────

/** Live answer saved in-memory during the exam. */
export interface LiveAnswer {
  question_id: string;
  answer:      string;
  saved_at:    string; // ISO-8601
}

/** Current status of the live exam session. */
export type ExamSessionStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'submitting'
  | 'completed'
  | 'timed_out';

// ─────────────────────────────────────────────────────────────────────────────
// Phase 4 & 5 — Evaluation and feedback
// ─────────────────────────────────────────────────────────────────────────────

/** Per-question evaluation result from the AI. */
export interface QuestionEvaluation {
  question_id:    string;
  is_correct:     boolean;
  question_score: number;        // 0–100
  feedback:       string;        // What the candidate did well / poorly
  correct_answer: string;        // Revealed after submission
  best_practice:  string;        // Recommended approach
  common_error?:  string;        // Typical mistake for this question
}

/** Per-category breakdown produced by the AI evaluator. */
export interface SimulatorScoreBreakdown {
  concepts:        number;  // 0–100
  problem_solving: number;
  clean_code:      number;
  performance:     number;
}

/** Full evaluation result returned from AI and stored in attempts. */
export interface SimulatorEvaluation {
  overall_score:     number;               // 0–100, weighted
  breakdown:         SimulatorScoreBreakdown;
  question_results:  QuestionEvaluation[];
  consistency_score: number;               // 0–100, pattern stability
  reliability_impact: number;              // delta on technical_scores
  strengths:         string[];
  improvement_areas: string[];
  evaluated_at:      string;               // ISO-8601
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Professional diagnostic
// ─────────────────────────────────────────────────────────────────────────────

/** Professional diagnostic delivered at the end of the simulation. */
export interface SimulatorDiagnostic {
  /** Text description of the estimated current level. */
  current_level_description: string;

  /** Estimated probability of passing a real interview (0–1). */
  interview_probability: number;

  /** Impact on the certification progress (delta 0–100). */
  certification_impact: number;

  /** Concepts reinforced in this session. */
  concepts_reinforced: string[];

  /** Concepts that still need work. */
  weak_concepts: string[];

  /** Personalised next-steps list. */
  recommended_actions: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregate — Full simulation session (runtime ViewModel)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Runtime ViewModel used across Simulator components.
 * Built from `SimulatorConfig + VacancyAnalysis + GeneratedExam + SimulatorEvaluation`.
 */
export interface SimulatorSession {
  attempt_id:    string;
  config:        SimulatorConfig;
  analysis:      VacancyAnalysis | null;
  exam:          GeneratedExam  | null;
  live_answers:  LiveAnswer[];
  evaluation:    SimulatorEvaluation | null;
  diagnostic:    SimulatorDiagnostic | null;
  status:        ExamSessionStatus;
  started_at:    string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Display metadata for company types. */
export const COMPANY_TYPE_META: Record<CompanyType, {
  label: string;
  description: string;
  icon: string;
  pressure: string;
  color: string;
}> = {
  startup: {
    label:       'Startup',
    description: 'Agilidad y autonomía. Roles full-stack, velocidad sobre perfección.',
    icon:        '🚀',
    pressure:    '45 min · Presión media',
    color:       '#10b981',
  },
  mid_company: {
    label:       'Empresa Mediana',
    description: 'Procesos estructurados, trabajo en equipo y escalabilidad.',
    icon:        '🏢',
    pressure:    '55 min · Presión media-alta',
    color:       '#3b82f6',
  },
  corporate: {
    label:       'Corporativo Internacional',
    description: 'Procesos formales, estándares altos y documentación rigurosa.',
    icon:        '🌐',
    pressure:    '60 min · Presión alta',
    color:       '#8b5cf6',
  },
  faang: {
    label:       'FAANG / Alta Exigencia',
    description: 'Máxima rigurosidad técnica. Algoritmos, sistemas y excelencia.',
    icon:        '⚡',
    pressure:    '75 min · Presión máxima',
    color:       '#f59e0b',
  },
};

/** Display metadata for difficulty modes. */
export const DIFFICULTY_MODE_META: Record<DifficultyMode, {
  label: string;
  description: string;
  icon: string;
}> = {
  vacancy_match: {
    label:       'Ajustado a la vacante',
    description: 'La IA detecta el nivel y adapta el examen automáticamente.',
    icon:        '🎯',
  },
  challenge: {
    label:       'Modo desafío (+1 nivel)',
    description: 'Preguntas un nivel más exigentes para preparación avanzada.',
    icon:        '🔥',
  },
  training: {
    label:       'Modo entrenamiento (−1 nivel)',
    description: 'Enfocado en consolidar conceptos base sin máxima presión.',
    icon:        '🏋️',
  },
};

/** Display metadata for evaluation types. */
export const EVALUATION_TYPE_META: Record<EvaluationType, {
  label: string;
  description: string;
  icon: string;
}> = {
  theoretical: {
    label:       'Teórico conceptual',
    description: 'Profundidad conceptual, fundamentos y principios técnicos.',
    icon:        '🧠',
  },
  practical: {
    label:       'Práctico (código)',
    description: 'Resolución de problemas, algoritmos y calidad del código.',
    icon:        '💻',
  },
  case_study: {
    label:       'Caso empresarial real',
    description: 'Decisiones de diseño y arquitectura en contexto real.',
    icon:        '📊',
  },
  mixed: {
    label:       'Mixto (recomendado)',
    description: 'Combinación proporcional de teoría, código y caso real.',
    icon:        '🔀',
  },
};

/** Display metadata for pressure modes. */
export const PRESSURE_MODE_META: Record<PressureMode, {
  label: string;
  description: string;
  icon: string;
  time_modifier: number; // multiplier applied to base duration
}> = {
  practice: {
    label:         'Modo práctica',
    description:   'Feedback inmediato en cada respuesta. Ideal para aprender.',
    icon:          '🧘',
    time_modifier: 1.0,
  },
  interview: {
    label:         'Modo entrevista real',
    description:   'Sin feedback hasta el final. Simula condiciones reales.',
    icon:          '⏱',
    time_modifier: 1.0,
  },
  high_pressure: {
    label:         'Alta presión',
    description:   'Tiempo reducido −20% y dificultad elevada. Máximo reto.',
    icon:          '🔥',
    time_modifier: 0.8,
  },
};

/** Returns the base duration in minutes for a given company type. */
export function getBaseDuration(companyType: CompanyType): number {
  const map: Record<CompanyType, number> = {
    startup:     45,
    mid_company: 55,
    corporate:   60,
    faang:       75,
  };
  return map[companyType];
}

/** Calculates the final exam duration applying pressure mode modifier. */
export function calculateExamDuration(
  companyType: CompanyType,
  pressureMode: PressureMode
): number {
  const base     = getBaseDuration(companyType);
  const modifier = PRESSURE_MODE_META[pressureMode].time_modifier;
  return Math.round(base * modifier);
}
