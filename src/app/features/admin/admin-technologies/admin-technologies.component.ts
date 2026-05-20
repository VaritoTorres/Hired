/**
 * @file admin-technologies.component.ts
 * @description Manage platform technologies: toggle active state, edit metadata.
 */
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule }    from '@angular/common';
import { FormsModule }     from '@angular/forms';
import { AdminService, Technology } from '../../../core/services/admin.service';

@Component({
  selector: 'app-admin-technologies',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-technologies.component.html',
  styleUrls: ['./admin-technologies.component.css'],
})
export class AdminTechnologiesComponent implements OnInit {
  private readonly adminService = inject(AdminService);

  readonly technologies = signal<Technology[]>([]);
  readonly loading      = signal(true);
  readonly saving       = signal(false);
  readonly errorMsg     = signal<string | null>(null);
  readonly successMsg   = signal<string | null>(null);

  /** Inline editor state: maps tech id → edit draft */
  editDrafts: Record<string, Partial<Technology>> = {};
  editingId: string | null = null;

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      this.technologies.set(await this.adminService.getTechnologies());
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.loading.set(false);
    }
  }

  startEdit(tech: Technology): void {
    this.editingId = tech.id;
    this.editDrafts[tech.id] = { name: tech.name, category: tech.category };
  }

  cancelEdit(): void {
    this.editingId = null;
  }

  async saveEdit(id: string): Promise<void> {
    const patch = this.editDrafts[id];
    if (!patch) return;

    this.saving.set(true);
    this.errorMsg.set(null);
    try {
      await this.adminService.updateTechnology(id, patch);
      this.successMsg.set('Tecnología actualizada correctamente.');
      this.editingId = null;
      await this.load();
      setTimeout(() => this.successMsg.set(null), 3000);
    } catch (err) {
      this.errorMsg.set((err as Error).message);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(_tech: Technology): Promise<void> {
    // is_active column does not exist in technologies table
  }
}
