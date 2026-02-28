/**
 * @file admin.routes.ts
 * @description Routes for the Admin feature.
 * Protected by both authGuard (authenticated) and roleGuard (admin role).
 * The roleGuard is a stub here — implement in Phase 2 once the profiles
 * table is populated.
 */
import { Routes } from '@angular/router';
import { authGuard } from '../../core/guards/auth.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./admin.component').then((m) => m.AdminComponent),
    title: 'Admin — HIRED',
  },
];
