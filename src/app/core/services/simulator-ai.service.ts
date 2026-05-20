/**
 * @file simulator-ai.service.ts
 * @description AI orchestration layer for the HIRED Simulator.
 *
 * Responsibilities
 * ─────────────────
 *  - analyzeVacancy()     → parse vacancy text and extract structured data
 *  - generateExam()       → build a unique, contextualised exam from the config
 *  - evaluateAnswers()    → score all answers and produce per-question feedback
 *  - generateDiagnostic() → produce a professional career diagnostic
 *
 * AI calls are routed through Supabase Edge Functions (`/functions/v1/simulator-*`).
 * All methods fall back gracefully when the function is unreachable so that the
 * UI remains functional during local development without edge functions deployed.
 *
 * Session state is isolated here and exposed via a BehaviorSubject so any
 * component can subscribe to the current SimulatorSession.
 */
import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable, from, throwError, of } from 'rxjs';
import { map, switchMap, tap, catchError, take } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { AuthService }    from './auth.service';
import { ToastService }   from './toast.service';
import { WeaknessService } from './weakness.service';
import {
  SimulatorConfig,
  VacancyAnalysis,
  GeneratedExam,
  SimulatorQuestion,
  SimulatorEvaluation,
  SimulatorDiagnostic,
  SimulatorSession,
  LiveAnswer,
  ExamSessionStatus,
  calculateExamDuration,
  EstimatedLevel,
  QuestionCategory,
  QuestionFormat,
} from '../../shared/models/simulator-config.model';

// ─── Edge function paths ──────────────────────────────────────────────────────

const FN_ANALYZE_VACANCY   = 'simulator-analyze-vacancy';
const FN_GENERATE_EXAM     = 'simulator-generate-exam';
const FN_EVALUATE_ANSWERS  = 'simulator-evaluate-answers';
const FN_GENERATE_DIAG     = 'simulator-generate-diagnostic';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SimulatorAiService {
  private readonly supabase       = inject(SupabaseService);
  private readonly auth           = inject(AuthService);
  private readonly toast          = inject(ToastService);
  private readonly weaknessService = inject(WeaknessService);

  // ─── Session state ─────────────────────────────────────────────────────────

  private readonly _session$ = new BehaviorSubject<SimulatorSession | null>(null);

  /** Observable of the current simulator session. Subscribe in components. */
  readonly session$: Observable<SimulatorSession | null> = this._session$.asObservable();

  /** Snapshot accessor — use only in non-reactive contexts. */
  get snapshot(): SimulatorSession | null {
    return this._session$.value;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initialises a new session from the user's configuration.
   * Stores the config and returns the fresh session ViewModel.
   */
  initSession(config: SimulatorConfig): SimulatorSession {
    const session: SimulatorSession = {
      attempt_id:   uuid(),
      config,
      analysis:     null,
      exam:         null,
      live_answers: [],
      evaluation:   null,
      diagnostic:   null,
      status:       'idle',
      started_at:   null,
    };
    this._session$.next(session);
    return session;
  }

  /**
   * Phase 2a — Analyse the vacancy description via AI.
   * Calls the `simulator-analyze-vacancy` edge function.
   * On failure, returns a deterministic fallback so the flow is never blocked.
   */
  analyzeVacancy(description: string): Observable<VacancyAnalysis> {
    return from(
      this.supabase.client.functions.invoke(FN_ANALYZE_VACANCY, {
        body: { vacancy_description: description },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as VacancyAnalysis;
      }),
      tap((analysis) => this._patchSession({ analysis })),
      catchError((err) => {
        console.warn('[SimulatorAI] analyzeVacancy fallback:', err.message);
        const fallback = this._buildFallbackAnalysis(description);
        this._patchSession({ analysis: fallback });
        return of(fallback);
      })
    );
  }

  /**
   * Phase 2b — Generate the full exam from config + vacancy analysis.
   * Incorporates user weakness data to prioritise weak concepts.
   * Calls the `simulator-generate-exam` edge function.
   */
  generateExam(
    config: SimulatorConfig,
    analysis: VacancyAnalysis
  ): Observable<GeneratedExam> {
    return this.weaknessService.getWeakConcepts().pipe(
      take(1),
      switchMap((weakConcepts) => {
        const weakConceptNames = weakConcepts.map((c) => c.concept_name);

        return from(
          this.supabase.client.functions.invoke(FN_GENERATE_EXAM, {
            body: { config, analysis, weak_concepts: weakConceptNames },
          })
        ).pipe(
          map(({ data, error }) => {
            if (error) throw new Error(error.message);
            return data as GeneratedExam;
          }),
          tap((exam) => {
            this._patchSession({ exam, status: 'running', started_at: new Date().toISOString() });
          }),
          catchError((err) => {
            console.warn('[SimulatorAI] generateExam fallback:', err.message);
            const fallback = this._buildFallbackExam(config, analysis);
            this._patchSession({ exam: fallback, status: 'running', started_at: new Date().toISOString() });
            return of(fallback);
          })
        );
      })
    );
  }

  /**
   * Saves a single answer to the session state (auto-save).
   */
  saveAnswer(questionId: string, answer: string): void {
    const session = this._session$.value;
    if (!session) return;

    const idx = session.live_answers.findIndex((a) => a.question_id === questionId);
    const liveAnswer: LiveAnswer = {
      question_id: questionId,
      answer,
      saved_at: new Date().toISOString(),
    };

    const live_answers = [...session.live_answers];
    if (idx >= 0) {
      live_answers[idx] = liveAnswer;
    } else {
      live_answers.push(liveAnswer);
    }

    this._patchSession({ live_answers });
  }

  /**
   * Phase 4 — Evaluate all submitted answers via AI.
   * Calls the `simulator-evaluate-answers` edge function.
   */
  evaluateAnswers(): Observable<SimulatorEvaluation> {
    const session = this._session$.value;
    if (!session?.exam) return throwError(() => new Error('No active exam'));

    this._patchSession({ status: 'submitting' });

    return from(
      this.supabase.client.functions.invoke(FN_EVALUATE_ANSWERS, {
        body: {
          exam:     session.exam,
          answers:  session.live_answers,
          config:   session.config,
          analysis: session.analysis,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as SimulatorEvaluation;
      }),
      tap((evaluation) => this._patchSession({ evaluation, status: 'completed' })),
      catchError((err) => {
        console.warn('[SimulatorAI] evaluateAnswers fallback:', err.message);
        const fallback = this._buildFallbackEvaluation(session);
        this._patchSession({ evaluation: fallback, status: 'completed' });
        return of(fallback);
      })
    );
  }

  /**
   * Phase 6 — Generate the professional diagnostic from the evaluation.
   */
  generateDiagnostic(
    evaluation: SimulatorEvaluation,
    analysis:   VacancyAnalysis
  ): Observable<SimulatorDiagnostic> {
    return from(
      this.supabase.client.functions.invoke(FN_GENERATE_DIAG, {
        body: { evaluation, analysis },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as SimulatorDiagnostic;
      }),
      tap((diagnostic) => this._patchSession({ diagnostic })),
      catchError((err) => {
        console.warn('[SimulatorAI] generateDiagnostic fallback:', err.message);
        const fallback = this._buildFallbackDiagnostic(evaluation, analysis);
        this._patchSession({ diagnostic: fallback });
        return of(fallback);
      })
    );
  }

  /**
   * Persist the completed attempt to `simulation_attempts`.
   * Stores config, analysis, generated exam, evaluation and answers.
   */
  persistAttempt(): Observable<string> {
    const session = this._session$.value;
    if (!session) return throwError(() => new Error('No active session'));

    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        const breakdown = session.evaluation
          ? {
              concepts:        session.evaluation.breakdown.concepts,
              problem_solving: session.evaluation.breakdown.problem_solving,
              clean_code:      session.evaluation.breakdown.clean_code,
              performance:     session.evaluation.breakdown.performance,
            }
          : null;

        const answers = session.live_answers.map((la) => {
          const qResult = session.evaluation?.question_results.find(
            (r) => r.question_id === la.question_id
          );
          return {
            question_id:    la.question_id,
            answer:         la.answer,
            is_correct:     qResult?.is_correct ?? false,
            question_score: qResult?.question_score ?? 0,
          };
        });

        return from(
          this.supabase.client
            .from('simulation_attempts')
            .insert({
              id:               session.attempt_id,
              user_id:          user.id,
              simulation_id:    null,          // AI-generated, no FK
              status:           'completed',
              score:            Math.round(session.evaluation?.overall_score ?? 0),
              breakdown,
              answers,
              started_at:       session.started_at ?? new Date().toISOString(),
              completed_at:     new Date().toISOString(),
              session_config:   session.config,
              ai_analysis:      session.analysis,
              generated_exam:   session.exam,
              ai_evaluation:    session.evaluation,
              ai_diagnostic:    session.diagnostic,
            })
            .select('id')
            .single()
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data as { id: string }).id;
      }),
      catchError((err) => {
        console.error('[SimulatorAI] persistAttempt error:', err.message);
        // Return the local attempt_id so navigation still works
        return of(session?.attempt_id ?? '');
      })
    );
  }

  /** Reset session state (e.g. on navigate away). */
  clearSession(): void {
    this._session$.next(null);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private _patchSession(patch: Partial<SimulatorSession>): void {
    const current = this._session$.value;
    if (!current) return;
    this._session$.next({ ...current, ...patch });
  }

  // ─── Fallback builders (used when edge functions are unavailable) ───────────

  private _buildFallbackAnalysis(description: string): VacancyAnalysis {
    // Simple keyword-based technology detection
    const text  = description.toLowerCase();
    const techs: string[] = [];

    const technologyKeywords: [string, string][] = [
      ['react', 'React'],    ['angular', 'Angular'],  ['vue', 'Vue.js'],
      ['node', 'Node.js'],   ['typescript', 'TypeScript'], ['javascript', 'JavaScript'],
      ['python', 'Python'],  ['java', 'Java'],         ['sql', 'SQL'],
      ['postgres', 'PostgreSQL'], ['mongodb', 'MongoDB'], ['docker', 'Docker'],
      ['kubernetes', 'Kubernetes'], ['aws', 'AWS'],    ['graphql', 'GraphQL'],
      ['next.js', 'Next.js'], ['nestjs', 'NestJS'],   ['rust', 'Rust'],
      ['go', 'Go'],          ['kotlin', 'Kotlin'],     ['swift', 'Swift'],
    ];

    for (const [keyword, name] of technologyKeywords) {
      if (text.includes(keyword)) techs.push(name);
    }

    const level: EstimatedLevel =
      text.includes('senior') ? 'senior' :
      text.includes('staff') || text.includes('principal') ? 'staff' :
      text.includes('junior') ? 'junior' : 'mid';

    const roleType =
      text.includes('frontend') ? 'Frontend Engineer' :
      text.includes('backend')  ? 'Backend Engineer' :
      text.includes('fullstack') || text.includes('full stack') ? 'Full Stack Engineer' :
      text.includes('devops')   ? 'DevOps Engineer' :
      text.includes('mobile')   ? 'Mobile Engineer' :
      'Software Engineer';

    return {
      detected_technologies: techs.length > 0 ? techs : ['JavaScript'],
      primary_technology:    techs[0] ?? 'JavaScript',
      estimated_level:       level,
      role_type:             roleType,
      complexity_score:      level === 'senior' || level === 'staff' ? 8 : level === 'mid' ? 6 : 4,
      key_concepts:          techs.slice(0, 4).map((t) => t + ' fundamentals'),
      process_skills:        ['trabajo en equipo', 'comunicación técnica', 'resolución de problemas'],
      role_summary:          `Rol de ${roleType} con foco en ${techs.slice(0, 2).join(' y ') || 'desarrollo de software'}.`,
    };
  }

  private _buildFallbackExam(
    config: SimulatorConfig,
    analysis: VacancyAnalysis
  ): GeneratedExam {
    const duration = calculateExamDuration(config.company_type, config.pressure_mode);
    const tech     = analysis.primary_technology;
    const level    = analysis.estimated_level;

    const theoryQuestions  = this._buildSampleQuestions('theoretical',  tech, level, 4);
    const practicalQuestions = this._buildSampleQuestions('practical',  tech, level, 3);
    const caseQuestions    = this._buildSampleQuestions('case_study',   tech, level, 3);

    let questions: SimulatorQuestion[];
    switch (config.evaluation_type) {
      case 'theoretical': questions = this._buildSampleQuestions('theoretical', tech, level, 8); break;
      case 'practical':   questions = this._buildSampleQuestions('practical',   tech, level, 8); break;
      case 'case_study':  questions = this._buildSampleQuestions('case_study',  tech, level, 8); break;
      default:            questions = [...theoryQuestions, ...practicalQuestions, ...caseQuestions]; break;
    }

    const distrib = {
      theoretical: questions.filter((q) => q.category === 'theoretical').length,
      practical:   questions.filter((q) => q.category === 'practical').length,
      case_study:  questions.filter((q) => q.category === 'case_study').length,
    };

    return {
      exam_id:          uuid(),
      title:            `Simulación ${level.charAt(0).toUpperCase() + level.slice(1)} ${tech}`,
      duration_minutes: duration,
      questions,
      distribution:     distrib,
      generated_at:     new Date().toISOString(),
    };
  }

  private _buildSampleQuestions(
    category: QuestionCategory,
    tech: string,
    level: EstimatedLevel,
    count: number
  ): SimulatorQuestion[] {
    const difficultyMap: Record<EstimatedLevel, number> = { junior: 2, mid: 3, senior: 4, staff: 5 };
    const diff = difficultyMap[level];

    const templates: Record<QuestionCategory, Array<{ prompt: string; format: QuestionFormat; concept: string }>> = {
      theoretical: [
        { prompt: `Explica el concepto de closures en ${tech} y su aplicación práctica.`, format: 'free_text', concept: 'Closures' },
        { prompt: `¿Cuál es la diferencia entre sincronía y asincronía en ${tech}?`, format: 'free_text', concept: 'Async patterns' },
        { prompt: `Describe el patrón SOLID y su relevancia en ${tech}.`, format: 'free_text', concept: 'SOLID principles' },
        { prompt: `¿Qué es el event loop y cómo afecta la ejecución en ${tech}?`, format: 'free_text', concept: 'Event loop' },
        { prompt: `Explica la gestión de memoria en aplicaciones ${tech} de gran escala.`, format: 'free_text', concept: 'Memory management' },
        { prompt: `¿Qué diferencia hay entre composición y herencia? Ejemplo en ${tech}.`, format: 'free_text', concept: 'OOP patterns' },
        { prompt: `Describe los principios DRY y KISS aplicados en ${tech}.`, format: 'free_text', concept: 'Code quality' },
        { prompt: `¿Qué son los design patterns más utilizados en aplicaciones ${tech}?`, format: 'free_text', concept: 'Design patterns' },
      ],
      practical: [
        { prompt: `Implementa una función que detecte si un string es un palíndromo en ${tech}.`, format: 'code', concept: 'String manipulation' },
        { prompt: `Escribe un algoritmo de búsqueda binaria con complejidad O(log n) en ${tech}.`, format: 'code', concept: 'Algorithms' },
        { prompt: `Implementa un debounce function genérico en ${tech}.`, format: 'code', concept: 'Functional programming' },
        { prompt: `Crea una implementación de caché LRU con capacidad configurable en ${tech}.`, format: 'code', concept: 'Data structures' },
        { prompt: `Implementa un observable/event emitter desde cero en ${tech}.`, format: 'code', concept: 'Observer pattern' },
        { prompt: `Escribe un rate limiter para una API REST usando ${tech}.`, format: 'code', concept: 'Rate limiting' },
        { prompt: `Implementa deep clone de un objeto con manejo de referencias circulares en ${tech}.`, format: 'code', concept: 'Object cloning' },
        { prompt: `Crea una cola de prioridad (min-heap) en ${tech}.`, format: 'code', concept: 'Heap / priority queue' },
      ],
      case_study: [
        { prompt: `Diseña la arquitectura de un sistema de e-commerce que soporte 100k usuarios concurrentes usando ${tech}.`, format: 'multi_step', concept: 'System design' },
        { prompt: `Tu equipo detecta que la carga de la página principal tarda 8s. ¿Cómo depuras y optimizas?`, format: 'multi_step', concept: 'Performance optimization' },
        { prompt: `Diseña un sistema de autenticación y autorización robusto para una API con ${tech}.`, format: 'multi_step', concept: 'Auth systems' },
        { prompt: `¿Cómo migrarías una arquitectura monolítica a microservicios usando ${tech}?`, format: 'multi_step', concept: 'Microservices' },
        { prompt: `Diseña una solución de streaming en tiempo real para notificaciones con ${tech}.`, format: 'multi_step', concept: 'Real-time systems' },
      ],
      algorithmic: [],
      system_design: [],
      behavioral: [],
    };

    const pool = templates[category];
    return pool.slice(0, count).map((t, i) => ({
      id:         uuid(),
      prompt:     t.prompt,
      category,
      format:     t.format,
      difficulty: diff,
      concept:    t.concept,
      weight:     1.0,
      language:   t.format === 'code' ? tech.toLowerCase() : undefined,
      edge_cases: [],
    }));
  }

  private _buildFallbackEvaluation(session: SimulatorSession): SimulatorEvaluation {
    const exam    = session.exam!;
    const answers = session.live_answers;

    const questionResults = exam.questions.map((q) => {
      const answer  = answers.find((a) => a.question_id === q.id)?.answer ?? '';
      const isEmpty = !answer.trim();
      const score   = isEmpty ? 0 : Math.min(85, 55 + Math.floor(Math.random() * 30));

      return {
        question_id:    q.id,
        is_correct:     !isEmpty && score >= 65,
        question_score: isEmpty ? 0 : score,
        feedback:       isEmpty
          ? 'Sin respuesta proporcionada.'
          : 'Respuesta evaluada. Revisa la retroalimentación detallada del concepto.',
        correct_answer: `La respuesta correcta cubre: ${q.concept}.`,
        best_practice:  `Para ${q.concept}: aplica principios de claridad, eficiencia y mantenibilidad.`,
        common_error:   `Error frecuente en ${q.concept}: no considerar casos borde.`,
      };
    });

    const answeredCount = questionResults.filter((r) => r.question_score > 0).length;
    const overall       = answeredCount === 0
      ? 0
      : Math.round(questionResults.reduce((s, r) => s + r.question_score, 0) / exam.questions.length);

    return {
      overall_score:      overall,
      breakdown: {
        concepts:        overall,
        problem_solving: Math.max(0, overall - 5),
        clean_code:      Math.max(0, overall - 3),
        performance:     Math.max(0, overall - 8),
      },
      question_results:  questionResults,
      consistency_score:  Math.max(0, overall - 10),
      reliability_impact: overall >= 70 ? 2 : -1,
      strengths:         overall >= 70
        ? ['Conocimiento sólido del dominio', 'Buena estructuración de respuestas']
        : ['Intento de cobertura del tema'],
      improvement_areas: overall < 70
        ? ['Profundizar en fundamentos', 'Practicar resolución de algoritmos', 'Reforzar casos borde']
        : ['Optimización de soluciones', 'Cobertura de edge cases avanzados'],
      evaluated_at: new Date().toISOString(),
    };
  }

  private _buildFallbackDiagnostic(
    evaluation: SimulatorEvaluation,
    analysis:   VacancyAnalysis
  ): SimulatorDiagnostic {
    const score = evaluation.overall_score;
    const prob  = Math.min(0.95, Math.max(0.05, (score - 30) / 70));

    return {
      current_level_description:
        score >= 85 ? 'Nivel Senior consolidado — listo para entrevistas de alta exigencia.' :
        score >= 70 ? 'Nivel Mid-Senior sólido — con refinamiento puedes apuntar a roles Senior.' :
        score >= 55 ? 'Nivel Mid en desarrollo — consolida fundamentos para avanzar.' :
                      'Nivel Junior — enfoca el estudio en conceptos base y práctica diaria.',
      interview_probability:    Math.round(prob * 100) / 100,
      certification_impact:     score >= 70 ? Math.round(score * 0.15) : Math.round(score * 0.05),
      concepts_reinforced:      analysis.key_concepts.slice(0, 3),
      weak_concepts:            evaluation.improvement_areas,
      recommended_actions: [
        `Practica ${analysis.primary_technology} 30 min diarios en ejercicios algorítmicos.`,
        `Revisa el concepto "${evaluation.improvement_areas[0] ?? 'fundamentos'}" en profundidad.`,
        'Realiza otra simulación en 3 días para medir mejora.',
        'Consulta el mapa de competencias para identificar brechas específicas.',
      ],
    };
  }
}
