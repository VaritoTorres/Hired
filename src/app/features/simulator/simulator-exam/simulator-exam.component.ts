/**
 * @file simulator-exam.component.ts
 * @description Controlled exam environment for the HIRED Simulator.
 *
 * Features
 * ─────────
 *  - Countdown timer with visual warnings
 *  - Auto-save on every keystroke (debounced)
 *  - Question navigator sidebar
 *  - Anti-navigation guard (router prompt)
 *  - Timed-out auto-submission
 *  - Locked structure — no config changes once started
 */
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject, interval } from 'rxjs';
import { takeUntil, debounceTime, take } from 'rxjs/operators';

import { SimulatorAiService } from '../../../core/services/simulator-ai.service';
import { ToastService }       from '../../../core/services/toast.service';
import {
  SimulatorSession,
  SimulatorQuestion,
  GeneratedExam,
  QuestionCategory,
} from '../../../shared/models/simulator-config.model';

@Component({
  selector: 'app-simulator-exam',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './simulator-exam.component.html',
  styleUrls: ['./simulator-exam.component.css'],
})
export class SimulatorExamComponent implements OnInit, OnDestroy {
  private readonly router  = inject(Router);
  private readonly route   = inject(ActivatedRoute);
  private readonly ai      = inject(SimulatorAiService);
  private readonly toast   = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  // ─── Session / exam state ──────────────────────────────────────────────────

  session   = signal<SimulatorSession | null>(null);
  exam      = computed((): GeneratedExam | null => this.session()?.exam ?? null);
  questions = computed((): SimulatorQuestion[] => this.exam()?.questions ?? []);

  // ─── Navigation ────────────────────────────────────────────────────────────

  currentIndex = signal(0);
  currentQuestion = computed((): SimulatorQuestion | null =>
    this.questions()[this.currentIndex()] ?? null
  );

  answeredSet = signal<Set<string>>(new Set());

  answeredCount = computed(() =>
    this.questions().filter((q) =>
      (this.session()?.live_answers ?? []).some(
        (a) => a.question_id === q.id && a.answer.trim().length > 0
      )
    ).length
  );

  // ─── Timer ─────────────────────────────────────────────────────────────────

  private totalSeconds = signal(0);
  remainingSeconds     = signal(0);

  timerMinutes = computed(() => Math.floor(this.remainingSeconds() / 60).toString().padStart(2, '0'));
  timerSeconds = computed(() => (this.remainingSeconds() % 60).toString().padStart(2, '0'));

  timerClass = computed((): string => {
    const r = this.remainingSeconds();
    const t = this.totalSeconds();
    if (r <= 0)          return 'timer--ended';
    if (r <= t * 0.15)  return 'timer--critical';
    if (r <= t * 0.30)  return 'timer--warning';
    return '';
  });

  // ─── Submission state ──────────────────────────────────────────────────────

  isSubmitting  = signal(false);
  showConfirm   = signal(false);
  examCompleted = signal(false);

  // ─── Autosave subject ──────────────────────────────────────────────────────

  private readonly autosave$ = new Subject<{ questionId: string; answer: string }>();

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    // Subscribe to session from service
    this.ai.session$.pipe(takeUntil(this.destroy$)).subscribe((session) => {
      this.session.set(session);
    });

    const session = this.ai.snapshot;

    if (!session?.exam) {
      // No active session — redirect back to config
      this.toast.error('Sin sesión activa', 'Configura el simulador primero.');
      this.router.navigate(['/simulator']);
      return;
    }

    // Initialise timer
    const totalMin = session.exam.duration_minutes;
    const total    = totalMin * 60;
    this.totalSeconds.set(total);
    this.remainingSeconds.set(total);

    // Start countdown
    interval(1000).pipe(takeUntil(this.destroy$)).subscribe(() => {
      const current = this.remainingSeconds();
      if (current <= 0) {
        this._onTimeUp();
        return;
      }
      this.remainingSeconds.update((s) => s - 1);

      // Warn at 5 min remaining
      if (current === 300) {
        this.toast.warning('⏱ 5 minutos restantes', 'Revisa tus respuestas antes de finalizar.');
      }
    });

    // Autosave with debounce
    this.autosave$.pipe(
      debounceTime(600),
      takeUntil(this.destroy$),
    ).subscribe(({ questionId, answer }) => {
      this.ai.saveAnswer(questionId, answer);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Browser close / navigate guard ───────────────────────────────────────

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): string | undefined {
    if (!this.examCompleted()) {
      event.preventDefault();
      return 'Tu examen está en curso. ¿Seguro que deseas salir?';
    }
    return undefined;
  }

  // ─── Question navigation ───────────────────────────────────────────────────

  goToQuestion(index: number): void {
    if (index >= 0 && index < this.questions().length) {
      this.currentIndex.set(index);
    }
  }

  prevQuestion(): void { this.goToQuestion(this.currentIndex() - 1); }
  nextQuestion(): void { this.goToQuestion(this.currentIndex() + 1); }

  // ─── Answer management ─────────────────────────────────────────────────────

  getAnswer(questionId: string): string {
    return this.session()?.live_answers.find((a) => a.question_id === questionId)?.answer ?? '';
  }

  onAnswerChange(questionId: string, answer: string): void {
    // Optimistically update set of answered questions
    const set = new Set(this.answeredSet());
    if (answer.trim()) {
      set.add(questionId);
    } else {
      set.delete(questionId);
    }
    this.answeredSet.set(set);
    // Debounced persist
    this.autosave$.next({ questionId, answer });
  }

  isAnswered(questionId: string): boolean {
    const answer = this.getAnswer(questionId);
    return answer.trim().length > 0;
  }

  // ─── Timer expiry ──────────────────────────────────────────────────────────

  private _onTimeUp(): void {
    if (this.examCompleted() || this.isSubmitting()) return;
    this.toast.warning('⏰ Tiempo agotado', 'El examen se envía automáticamente.');
    this._submitExam(true);
  }

  // ─── Submission ─────────────────────────────────────────────────────────────

  requestSubmit(): void {
    this.showConfirm.set(true);
  }

  cancelSubmit(): void {
    this.showConfirm.set(false);
  }

  confirmSubmit(): void {
    this.showConfirm.set(false);
    this._submitExam(false);
  }

  private _submitExam(timedOut: boolean): void {
    if (this.isSubmitting()) return;
    this.isSubmitting.set(true);
    this.examCompleted.set(true);

    this.ai.evaluateAnswers().subscribe({
      next: (evaluation) => {
        // After evaluation, generate diagnostic
        const session  = this.ai.snapshot!;
        const analysis = session.analysis;
        if (analysis) {
          this.ai.generateDiagnostic(evaluation, analysis).subscribe({
            next: () => {
              this.ai.persistAttempt().pipe(take(1)).subscribe({
                next: (attemptId) => {
                  this.isSubmitting.set(false);
                  this.router.navigate(['/simulator/results', attemptId]);
                },
                error: () => {
                  this.isSubmitting.set(false);
                  const id = this.ai.snapshot?.attempt_id ?? 'local';
                  this.router.navigate(['/simulator/results', id]);
                },
              });
            },
            error: () => {
              this.isSubmitting.set(false);
              const id = this.ai.snapshot?.attempt_id ?? 'local';
              this.router.navigate(['/simulator/results', id]);
            },
          });
        } else {
          this.ai.persistAttempt().pipe(take(1)).subscribe({
            next: (id) => {
              this.isSubmitting.set(false);
              this.router.navigate(['/simulator/results', id]);
            },
            error: () => {
              this.isSubmitting.set(false);
              this.router.navigate(['/simulator/results', 'local']);
            },
          });
        }
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.toast.error('Error en evaluación', 'No se pudo evaluar el examen. Intenta de nuevo.');
      },
    });
  }

  // ─── Template helpers ──────────────────────────────────────────────────────

  questionStatusClass(index: number): string {
    const q = this.questions()[index];
    if (!q) return '';
    if (this.currentIndex() === index) return 'q-nav__item--current';
    if (this.isAnswered(q.id))         return 'q-nav__item--answered';
    return '';
  }

  categoryIcon(category: QuestionCategory): string {
    const map: Record<QuestionCategory, string> = {
      theoretical:   '🧠',
      practical:     '💻',
      case_study:    '📊',
      algorithmic:   '⚙️',
      system_design: '🏗️',
      behavioral:    '🤝',
    };
    return map[category] ?? '📝';
  }

  categoryLabel(category: QuestionCategory): string {
    const map: Record<QuestionCategory, string> = {
      theoretical:   'Teórico',
      practical:     'Práctico',
      case_study:    'Caso real',
      algorithmic:   'Algorítmico',
      system_design: 'Diseño de sistema',
      behavioral:    'Competencias',
    };
    return map[category] ?? category;
  }

  difficultyStars(diff: number): string {
    return '★'.repeat(Math.min(diff, 5)) + '☆'.repeat(Math.max(0, 5 - diff));
  }

  completionPercent(): number {
    const total = this.questions().length;
    if (total === 0) return 0;
    return Math.round((this.answeredCount() / total) * 100);
  }

  formatDuration(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m > 0 ? m + 'min' : ''}`.trim();
  }
}
