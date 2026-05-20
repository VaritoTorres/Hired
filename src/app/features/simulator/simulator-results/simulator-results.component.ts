/**
 * @file simulator-results.component.ts
 * @description Professional diagnostic results screen for the HIRED Simulator.
 *
 * Displays:
 *  - Overall score + breakdown radar
 *  - Per-question detailed feedback
 *  - Professional diagnostic (level, interview probability, certification impact)
 *  - Recommended next actions
 *  - Option to start a new simulation
 */
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SimulatorAiService } from '../../../core/services/simulator-ai.service';
import { ToastService }       from '../../../core/services/toast.service';
import {
  SimulatorSession,
  SimulatorEvaluation,
  SimulatorDiagnostic,
  QuestionEvaluation,
  VacancyAnalysis,
} from '../../../shared/models/simulator-config.model';

@Component({
  selector: 'app-simulator-results',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './simulator-results.component.html',
  styleUrls: ['./simulator-results.component.css'],
})
export class SimulatorResultsComponent implements OnInit, OnDestroy {
  private readonly router   = inject(Router);
  private readonly route    = inject(ActivatedRoute);
  private readonly ai       = inject(SimulatorAiService);
  private readonly toast    = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  // ─── Data ──────────────────────────────────────────────────────────────────

  session    = signal<SimulatorSession | null>(null);
  evaluation = computed((): SimulatorEvaluation | null => this.session()?.evaluation ?? null);
  diagnostic = computed((): SimulatorDiagnostic | null => this.session()?.diagnostic ?? null);
  analysis   = computed((): VacancyAnalysis | null => this.session()?.analysis ?? null);

  // ─── UI state ─────────────────────────────────────────────────────────────

  activeTab        = signal<'overview' | 'questions' | 'diagnostic'>('overview');
  expandedQuestion = signal<string | null>(null);

  // ─── Computed view values ──────────────────────────────────────────────────

  overallScore = computed((): number => this.evaluation()?.overall_score ?? 0);

  scoreGrade = computed((): { label: string; color: string; emoji: string } => {
    const s = this.overallScore();
    if (s >= 90) return { label: 'Excepcional',    color: '#10b981', emoji: '🏆' };
    if (s >= 80) return { label: 'Excelente',       color: '#3b82f6', emoji: '⭐' };
    if (s >= 70) return { label: 'Sólido',          color: '#6366f1', emoji: '✅' };
    if (s >= 60) return { label: 'En desarrollo',   color: '#f59e0b', emoji: '📈' };
    if (s >= 45) return { label: 'Fundamentos OK',  color: '#f97316', emoji: '🔨' };
    return              { label: 'Reforzar bases',  color: '#ef4444', emoji: '📚' };
  });

  breakdownItems = computed(() => {
    const b = this.evaluation()?.breakdown;
    if (!b) return [];
    return [
      { label: 'Conceptos',          value: b.concepts,        color: '#6366f1', icon: '🧠' },
      { label: 'Problem Solving',    value: b.problem_solving,  color: '#3b82f6', icon: '⚙️' },
      { label: 'Clean Code',         value: b.clean_code,       color: '#10b981', icon: '✨' },
      { label: 'Performance',        value: b.performance,      color: '#f59e0b', icon: '⚡' },
    ];
  });

  questionResults = computed((): QuestionEvaluation[] =>
    this.evaluation()?.question_results ?? []
  );

  passedCount = computed(() =>
    this.questionResults().filter((r) => r.is_correct).length
  );

  totalQuestions = computed(() => this.questionResults().length);

  interviewProbabilityPct = computed(() => {
    const p = this.diagnostic()?.interview_probability ?? 0;
    return Math.round(p * 100);
  });

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.ai.session$.pipe(takeUntil(this.destroy$)).subscribe((session) => {
      this.session.set(session);
    });

    if (!this.ai.snapshot?.evaluation) {
      this.toast.error('Sin resultados', 'Completa una simulación para ver los resultados.');
      this.router.navigate(['/simulator']);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Clear session when leaving results page
    this.ai.clearSession();
  }

  // ─── Actions ───────────────────────────────────────────────────────────────

  setTab(tab: 'overview' | 'questions' | 'diagnostic'): void {
    this.activeTab.set(tab);
  }

  toggleQuestion(id: string): void {
    this.expandedQuestion.update((v) => (v === id ? null : id));
  }

  newSimulation(): void {
    this.ai.clearSession();
    this.router.navigate(['/simulator']);
  }

  goToDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  goToCompetenceMap(): void {
    this.router.navigate(['/competence-map']);
  }

  // ─── Template helpers ──────────────────────────────────────────────────────

  scoreColor(score: number): string {
    if (score >= 80) return '#10b981';
    if (score >= 65) return '#3b82f6';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  }

  scoreBarWidth(score: number): string {
    return `${Math.min(100, Math.max(0, score))}%`;
  }

  formatProbability(p: number): string {
    return `${Math.round(p * 100)}%`;
  }

  questionScoreClass(score: number): string {
    if (score >= 80) return 'score--excellent';
    if (score >= 65) return 'score--good';
    if (score >= 50) return 'score--average';
    return 'score--poor';
  }

  categoryIcon(cat: string): string {
    const m: Record<string, string> = {
      theoretical:   '🧠',
      practical:     '💻',
      case_study:    '📊',
      algorithmic:   '⚙️',
      system_design: '🏗️',
      behavioral:    '🤝',
    };
    return m[cat] ?? '📝';
  }

  examTitle(): string {
    return this.session()?.exam?.title ?? 'Simulación técnica';
  }

  passRate(): string {
    const total = this.totalQuestions();
    if (total === 0) return '0%';
    return `${Math.round((this.passedCount() / total) * 100)}%`;
  }

  getAnswerForQuestion(questionId: string): string {
    const answers = this.session()?.live_answers ?? [];
    return answers.find((a) => a.question_id === questionId)?.answer ?? '(Sin respuesta)';
  }

  getQuestionAtIndex(index: number) {
    return this.session()?.exam?.questions?.[index] ?? null;
  }

  circumference = 2 * Math.PI * 48; // r=48

  strokeDashoffset(score: number): number {
    return this.circumference * (1 - score / 100);
  }
}
