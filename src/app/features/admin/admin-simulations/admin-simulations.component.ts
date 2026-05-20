/**
 * @file admin-simulations.component.ts
 * @description List, edit, and delete platform simulations.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }     from '@angular/common';
import { FormsModule }      from '@angular/forms';
import { AdminService, Simulation } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-simulations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-simulations.component.html',
  styleUrls: ['./admin-simulations.component.css'],
})
export class AdminSimulationsComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly simulations  = signal<Simulation[]>([]);
  readonly loading      = signal(true);
  readonly saving       = signal(false);
  readonly errorMsg     = signal<string | null>(null);
  readonly successMsg   = signal<string | null>(null);

  editDrafts: Record<string, Partial<Simulation>> = {};
  editingId: string | null = null;
  confirmDeleteId: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      this.simulations.set(await this.adminService.getSimulations({ limit: 200 }));
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  startEdit(sim: Simulation): void {
    this.editingId = sim.id;
    this.editDrafts[sim.id] = {
      title:     sim.title,
      level:     sim.level,
      is_active: sim.is_active,
    };
  }

  cancelEdit(): void { this.editingId = null; }

  async saveEdit(id: string): Promise<void> {
    const patch = this.editDrafts[id];
    if (!patch) return;

    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      await this.adminService.updateSimulation(id, patch);
      this.successMsg.set('Simulación actualizada.');
      this.editingId = null;
      await this.load();
      setTimeout(() => this.successMsg.set(null), 3000);
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  confirmDelete(id: string): void { this.confirmDeleteId = id; }
  cancelDelete(): void             { this.confirmDeleteId = null; }

  async executeDelete(id: string): Promise<void> {
    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      await this.adminService.deleteSimulation(id);
      this.confirmDeleteId = null;
      this.successMsg.set('Simulación eliminada.');
      await this.load();
      setTimeout(() => this.successMsg.set(null), 3000);
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }
}
