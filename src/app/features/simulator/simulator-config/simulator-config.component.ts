/**
 * @file simulator-config.component.ts
 * @description Multi-step configuration wizard for the HIRED Simulator.
 *
 * Steps
 * ──────
 *  1. Vacancy description (text area + AI preview)
 *  2. Company type selection
 *  3. Difficulty mode
 *  4. Evaluation type
 *  5. Pressure mode + final review
 */
import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { SimulatorAiService } from '../../../core/services/simulator-ai.service';
import { ToastService }       from '../../../core/services/toast.service';
import {
  CompanyType,
  DifficultyMode,
  EvaluationType,
  PressureMode,
  SimulatorConfig,
  COMPANY_TYPE_META,
  DIFFICULTY_MODE_META,
  EVALUATION_TYPE_META,
  PRESSURE_MODE_META,
  calculateExamDuration,
  VacancyAnalysis,
} from '../../../shared/models/simulator-config.model';

type WizardStep = 1 | 2 | 3 | 4 | 5;

@Component({
  selector: 'app-simulator-config',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './simulator-config.component.html',
  styleUrls: ['./simulator-config.component.css'],
})
export class SimulatorConfigComponent implements OnInit, OnDestroy {
  private readonly fb      = inject(FormBuilder);
  private readonly router  = inject(Router);
  private readonly ai      = inject(SimulatorAiService);
  private readonly toast   = inject(ToastService);
  private readonly destroy$ = new Subject<void>();

  // ─── Wizard state ──────────────────────────────────────────────────────────

  readonly TOTAL_STEPS = 5;
  currentStep = signal<WizardStep>(1);

  progressPercent = computed(() =>
    ((this.currentStep() - 1) / (this.TOTAL_STEPS - 1)) * 100
  );

  // ─── UI state ─────────────────────────────────────────────────────────────

  isAnalyzing  = signal(false);
  analysis     = signal<VacancyAnalysis | null>(null);
  isSubmitting = signal(false);

  // ─── Metadata maps ─────────────────────────────────────────────────────────

  readonly COMPANY_TYPE_META    = COMPANY_TYPE_META;
  readonly DIFFICULTY_MODE_META = DIFFICULTY_MODE_META;
  readonly EVALUATION_TYPE_META = EVALUATION_TYPE_META;
  readonly PRESSURE_MODE_META   = PRESSURE_MODE_META;

  readonly companyTypes:    CompanyType[]    = ['startup', 'mid_company', 'corporate', 'faang'];
  readonly difficultyModes: DifficultyMode[] = ['training', 'vacancy_match', 'challenge'];
  readonly evaluationTypes: EvaluationType[] = ['theoretical', 'practical', 'case_study', 'mixed'];
  readonly pressureModes:   PressureMode[]   = ['practice', 'interview', 'high_pressure'];

  // ─── Form ──────────────────────────────────────────────────────────────────

  form!: FormGroup;

  // ─── Computed review values ────────────────────────────────────────────────

  get estimatedDuration(): number {
    const company  = this.form.get('company_type')?.value as CompanyType | null;
    const pressure = this.form.get('pressure_mode')?.value as PressureMode | null;
    if (!company || !pressure) return 0;
    return calculateExamDuration(company, pressure);
  }

  get selectedCompanyMeta() {
    const v = this.form.get('company_type')?.value as CompanyType | null;
    return v ? COMPANY_TYPE_META[v] : null;
  }

  get selectedDifficultyMeta() {
    const v = this.form.get('difficulty_mode')?.value as DifficultyMode | null;
    return v ? DIFFICULTY_MODE_META[v] : null;
  }

  get selectedEvalMeta() {
    const v = this.form.get('evaluation_type')?.value as EvaluationType | null;
    return v ? EVALUATION_TYPE_META[v] : null;
  }

  get selectedPressureMeta() {
    const v = this.form.get('pressure_mode')?.value as PressureMode | null;
    return v ? PRESSURE_MODE_META[v] : null;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.form = this.fb.group({
      vacancy_description: ['', [Validators.required, Validators.minLength(80)]],
      company_type:        ['', Validators.required],
      difficulty_mode:     ['vacancy_match', Validators.required],
      evaluation_type:     ['mixed', Validators.required],
      pressure_mode:       ['interview', Validators.required],
    });

    // Trigger live vacancy analysis after user stops typing
    this.form.get('vacancy_description')!.valueChanges.pipe(
      debounceTime(1200),
      distinctUntilChanged(),
      takeUntil(this.destroy$),
    ).subscribe((text: string) => {
      if (text?.trim().length >= 80) {
        this._triggerAnalysis(text);
      } else {
        this.analysis.set(null);
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  canProceed(): boolean {
    switch (this.currentStep()) {
      case 1: {
        const v = this.form.get('vacancy_description')!;
        return v.valid && !this.isAnalyzing();
      }
      case 2: return !!this.form.get('company_type')?.value;
      case 3: return !!this.form.get('difficulty_mode')?.value;
      case 4: return !!this.form.get('evaluation_type')?.value;
      case 5: return !!this.form.get('pressure_mode')?.value;
      default: return false;
    }
  }

  next(): void {
    if (!this.canProceed()) return;
    if (this.currentStep() === 1 && !this.analysis()) {
      // Force analysis before proceeding
      this._triggerAnalysis(this.form.get('vacancy_description')!.value);
      return;
    }
    if (this.currentStep() < this.TOTAL_STEPS) {
      this.currentStep.update((s) => (s + 1) as WizardStep);
    }
  }

  prev(): void {
    if (this.currentStep() > 1) {
      this.currentStep.update((s) => (s - 1) as WizardStep);
    }
  }

  goToStep(step: WizardStep): void {
    // Allow going back to a previous step only
    if (step < this.currentStep()) {
      this.currentStep.set(step);
    }
  }

  // ─── Analysis ─────────────────────────────────────────────────────────────

  private _triggerAnalysis(text: string): void {
    this.isAnalyzing.set(true);
    this.ai.analyzeVacancy(text).subscribe({
      next: (result) => {
        this.analysis.set(result);
        this.isAnalyzing.set(false);
        // Auto-advance if still on step 1
        if (this.currentStep() === 1) {
          this.currentStep.set(2);
        }
      },
      error: () => {
        this.isAnalyzing.set(false);
        this.toast.error('Análisis', 'No se pudo analizar la vacante. Continúa manualmente.');
        if (this.currentStep() === 1) {
          this.currentStep.set(2);
        }
      },
    });
  }

  // ─── Form select helpers ───────────────────────────────────────────────────

  selectCompanyType(value: CompanyType): void {
    this.form.get('company_type')!.setValue(value);
  }

  selectDifficultyMode(value: DifficultyMode): void {
    this.form.get('difficulty_mode')!.setValue(value);
  }

  selectEvaluationType(value: EvaluationType): void {
    this.form.get('evaluation_type')!.setValue(value);
  }

  selectPressureMode(value: PressureMode): void {
    this.form.get('pressure_mode')!.setValue(value);
  }

  isSelected(field: string, value: string): boolean {
    return this.form.get(field)?.value === value;
  }

  // ─── Submit ────────────────────────────────────────────────────────────────

  submitConfig(): void {
    if (this.form.invalid || this.isSubmitting()) return;
    this.isSubmitting.set(true);

    const config: SimulatorConfig = this.form.value;
    const session = this.ai.initSession(config);

    // Generate the exam; redirect to exam environment when ready
    const analysis = this.analysis() ?? this.ai.snapshot?.analysis;

    if (!analysis) {
      // Re-analyze first
      this.ai.analyzeVacancy(config.vacancy_description).subscribe({
        next: (va) => this._startGenerationFlow(config, va),
        error: (err) => {
          this.isSubmitting.set(false);
          this.toast.error('Error', 'No se pudo analizar la vacante.');
        },
      });
    } else {
      this._startGenerationFlow(config, analysis);
    }
  }

  private _startGenerationFlow(config: SimulatorConfig, analysis: VacancyAnalysis): void {
    this.ai.generateExam(config, analysis).subscribe({
      next: () => {
        const session = this.ai.snapshot;
        this.isSubmitting.set(false);
        this.router.navigate(['/simulator/exam', session?.attempt_id ?? 'new']);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.toast.error('Error al generar examen', err.message ?? '');
      },
    });
  }

  // ─── Template helpers ──────────────────────────────────────────────────────

  levelLabel(level: string): string {
    const map: Record<string, string> = {
      junior: '🟢 Junior',
      mid:    '🟡 Mid',
      senior: '🔴 Senior',
      staff:  '⚫ Staff / Principal',
    };
    return map[level] ?? level;
  }

  vacancyCharCount(): number {
    return (this.form.get('vacancy_description')?.value ?? '').length;
  }

  readonly stepLabels: Record<number, string> = {
    1: 'Vacante',
    2: 'Empresa',
    3: 'Dificultad',
    4: 'Evaluación',
    5: 'Presión',
  };
}
