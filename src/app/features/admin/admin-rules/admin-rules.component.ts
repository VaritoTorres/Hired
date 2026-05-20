/**
 * @file admin-rules.component.ts
 * @description Inline editor for certification_rules and scoring_weights_config.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }  from '@angular/common';
import { FormsModule }   from '@angular/forms';
import { AdminService }  from '../../../core/services/admin.service';
import {
  CertificationRule,
  ScoringWeightsConfig,
} from '../../../shared/models/admin.model';

@Component({
  selector: 'app-admin-rules',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-rules.component.html',
  styleUrls: ['./admin-rules.component.css'],
})
export class AdminRulesComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly certRules    = signal<CertificationRule[]>([]);
  readonly weights      = signal<ScoringWeightsConfig[]>([]);
  readonly loading      = signal(true);
  readonly saving       = signal(false);
  readonly errorMsg     = signal<string | null>(null);
  readonly successMsg   = signal<string | null>(null);

  /** Draft copies we edit in the form */
  certDrafts:    Record<string, CertificationRule>    = {};
  weightDrafts:  Record<string, ScoringWeightsConfig> = {};
  editingCertId:   string | null = null;
  editingWeightId: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const [rules, w] = await Promise.all([
        this.adminService.getCertificationRules(),
        this.adminService.getScoringWeights(),
      ]);
      this.certRules.set(rules);
      this.weights.set(w);
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  // ─── Certification rules ───────────────────────────────────────────────────

  startEditCert(rule: CertificationRule): void {
    this.editingCertId = rule.id;
    this.certDrafts[rule.id] = { ...rule };
  }

  cancelEditCert(): void { this.editingCertId = null; }

  async saveCert(id: string): Promise<void> {
    const draft = this.certDrafts[id];
    if (!draft) return;

    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      await this.adminService.upsertCertificationRule({
        technology_id:             draft.technology_id,
        min_score_percentage:      draft.min_score_percentage,
        min_attempts:              draft.min_attempts,
        passing_streak_required:   draft.passing_streak_required,
        xp_reward:                 draft.xp_reward,
        certificate_validity_days: draft.certificate_validity_days,
        is_active:                 draft.is_active,
        notes:                     draft.notes,
      });
      this.successMsg.set('Regla de certificación guardada.');
      this.editingCertId = null;
      await this.load();
      setTimeout(() => this.successMsg.set(null), 3000);
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  // ─── Scoring weights ───────────────────────────────────────────────────────

  startEditWeight(cfg: ScoringWeightsConfig): void {
    this.editingWeightId = cfg.id;
    this.weightDrafts[cfg.id] = { ...cfg };
  }

  cancelEditWeight(): void { this.editingWeightId = null; }

  weightsSum(draft: ScoringWeightsConfig): number {
    return +(
      draft.weight_concepts +
      draft.weight_problem_solving +
      draft.weight_clean_code +
      draft.weight_performance
    ).toFixed(4);
  }

  async saveWeight(id: string): Promise<void> {
    const draft = this.weightDrafts[id];
    if (!draft) return;

    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      await this.adminService.upsertScoringWeights({
        technology_id:          draft.technology_id,
        weight_concepts:        draft.weight_concepts,
        weight_problem_solving: draft.weight_problem_solving,
        weight_clean_code:      draft.weight_clean_code,
        weight_performance:     draft.weight_performance,
        is_active:              draft.is_active,
        notes:                  draft.notes,
      });
      this.successMsg.set('Pesos de scoring guardados.');
      this.editingWeightId = null;
      await this.load();
      setTimeout(() => this.successMsg.set(null), 3000);
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
