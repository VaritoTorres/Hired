/**
 * @file simulator.routes.ts
 * @description Routes for the Simulator feature.
 */
import { Routes } from '@angular/router';

export const SIMULATOR_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./simulator.component').then((m) => m.SimulatorComponent),
    title: 'Simulador — HIRED',
  },
];
