/**
 * @file admin-dashboard.component.ts
 * @description Global platform metrics panel.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }   from '@angular/common';
import { AdminService }   from '../../../core/services/admin.service';
import { AdminMetrics }   from '../../../shared/models/admin.model';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css'],
})
export class AdminDashboardComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly metrics  = signal<AdminMetrics | null>(null);
  readonly loading  = signal(true);
  readonly errorMsg = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      this.metrics.set(await this.adminService.getMetrics());
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  /** Object.entries wrapper for the level_distribution map */
  levelEntries(dist: Record<string, number> | undefined): [string, number][] {
    if (!dist) return [];
    return Object.entries(dist).sort(([a], [b]) => Number(a) - Number(b));
  }
}
