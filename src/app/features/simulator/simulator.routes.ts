/**
 * @file simulator.routes.ts
 * @description Routes for the Simulator feature.
 *
 * Route structure (inside MainLayout)
 * ─────────────────────────────────────
 *  /simulator          → SimulatorConfigComponent  (multi-step wizard)
 *
 * Full-screen routes (outside MainLayout, defined in app.routes.ts)
 * ─────────────────────────────────────────────────────────────────
 *  /simulator/exam/:id     → SimulatorExamComponent
 *  /simulator/results/:id  → SimulatorResultsComponent
 */
import { Routes } from '@angular/router';

export const SIMULATOR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./simulator-config/simulator-config.component').then(
        (m) => m.SimulatorConfigComponent
      ),
    title: 'Configurar Simulación — HIRED',
  },
];
