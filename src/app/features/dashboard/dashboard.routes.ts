/**
 * @file dashboard.routes.ts
 * @description Routes for the authenticated dashboard feature.
 * Protected by authGuard at the parent route level in app.routes.ts.
 */
import { Routes } from '@angular/router';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard.component').then((m) => m.DashboardComponent),
    title: 'Dashboard — HIRED',
  },
];
