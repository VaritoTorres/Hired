/**
 * @file admin-analytics.component.ts
 * @description Anomaly detection panel — calls detect_anomalies() RPC
 * and presents each category with visual severity indicators.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }   from '@angular/common';
import { AdminService }   from '../../../core/services/admin.service';
import {
  AnomalyReport,
  HighScoreSimulationAnomaly,
  PerfectStreakAnomaly,
  XpSpikeAnomaly,
} from '../../../shared/models/admin.model';

@Component({
  selector: 'app-admin-analytics',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-analytics.component.html',
  styleUrls: ['./admin-analytics.component.css'],
})
export class AdminAnalyticsComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly report   = signal<AnomalyReport | null>(null);
  readonly loading  = signal(true);
  readonly errorMsg = signal<string | null>(null);
  readonly refreshing = signal(false);

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async refresh(): Promise<void> {
    this.refreshing.set(true);
    await this.load();
    this.refreshing.set(false);
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      this.report.set(await this.adminService.detectAnomalies());
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Severity colour for avg-score column */
  scoreColor(avg: number): string {
    if (avg >= 98) return 'var(--color-anomaly-critical)';
    if (avg >= 95) return 'var(--color-anomaly-warning)';
    return 'var(--color-anomaly-ok)';
  }

  /** Total anomaly count across all categories */
  totalAnomalies(r: AnomalyReport): number {
    return (
      r.high_avg_score_simulations.length +
      r.suspicious_perfect_streaks.length +
      r.xp_spike_users.length
    );
  }
}
