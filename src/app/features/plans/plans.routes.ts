/**
 * @file plans.routes.ts
 * @description Routes for the Plans feature.
 */
import { Routes } from '@angular/router';

export const PLANS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./plans.component').then((m) => m.PlansComponent),
    title: 'Planes — HIRED',
  },
];
