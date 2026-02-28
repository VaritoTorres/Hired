/**
 * @file admin.component.ts
 * @description Administration panel stub — only accessible to admins (Phase 2).
 */
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="p-8">
      <h1 class="text-2xl font-bold text-slate-800">Administración</h1>
      <p class="mt-2 text-slate-500">Panel de administración — acceso restringido.</p>
    </section>
  `,
})
export class AdminComponent {}
