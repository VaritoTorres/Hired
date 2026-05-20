/**
 * @file admin.routes.ts
 * @description Routes for the SuperAdmin Academic Module.
 *
 * Two-layer protection:
 *  1. authGuard   — user must be authenticated
 *  2. adminGuard  — user must have an active record in admin_users
 *
 * Route tree:
 *  /admin                    → AdminLayoutComponent (shell + sidebar)
 *    /admin                  → redirect → /admin/dashboard
 *    /admin/dashboard        → AdminDashboardComponent
 *    /admin/technologies     → AdminTechnologiesComponent
 *    /admin/simulations      → AdminSimulationsComponent
 *    /admin/rules            → AdminRulesComponent
 *    /admin/analytics        → AdminAnalyticsComponent
 */
import { Routes } from '@angular/router';
import { authGuard }  from '../../core/guards/auth.guard';
import { adminGuard } from '../../core/guards/admin.guard';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard, adminGuard],
    loadComponent: () =>
      import('./admin-layout/admin-layout.component').then((m) => m.AdminLayoutComponent),
    title: 'Admin — HIRED',
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./admin-dashboard/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
        title: 'Métricas — Admin HIRED',
      },
      {
        path: 'technologies',
        loadComponent: () =>
          import('./admin-technologies/admin-technologies.component').then((m) => m.AdminTechnologiesComponent),
        title: 'Tecnologías — Admin HIRED',
      },
      {
        path: 'simulations',
        loadComponent: () =>
          import('./admin-simulations/admin-simulations.component').then((m) => m.AdminSimulationsComponent),
        title: 'Simulaciones — Admin HIRED',
      },
      {
        path: 'rules',
        loadComponent: () =>
          import('./admin-rules/admin-rules.component').then((m) => m.AdminRulesComponent),
        title: 'Reglas — Admin HIRED',
      },
      {
        path: 'analytics',
        loadComponent: () =>
          import('./admin-analytics/admin-analytics.component').then((m) => m.AdminAnalyticsComponent),
        title: 'Analíticas — Admin HIRED',
      },
      {
        path: 'certificates',
        loadComponent: () =>
          import('./admin-certificates/admin-certificates.component').then((m) => m.AdminCertificatesComponent),
        title: 'Certificados — Admin HIRED',
      },
    ],
  },
];
