/**
 * @file app.routes.ts
 * @description Root route configuration for HIRED.
 *
 * Design decisions
 * ────────────────
 * • Every feature is lazy-loaded (loadChildren / loadComponent) to minimise
 *   the initial bundle and improve Time-to-Interactive.
 * • Route access is split into two layout contexts:
 *     /auth  → AuthLayoutComponent   (unauthenticated, centred)
 *     /      → MainLayoutComponent   (authenticated, nav + sidebar)
 * • `authGuard` (functional, uses inject()) protects all private routes.
 * • The root path performs a smart redirect via the RedirectGuard (see below).
 */
import { Routes }        from '@angular/router';
import { authGuard }     from './core/guards/auth.guard';
import { planGuard }     from './core/guards/plan.guard';

export const APP_ROUTES: Routes = [
  // ── Root redirect ────────────────────────────────────────────────────────────
  // Always redirect bare "/" to dashboard; authGuard will bounce
  // unauthenticated visitors to /auth/login automatically.
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },

  // ── Auth layout ──────────────────────────────────────────────────────────────
  {
    path: 'auth',
    loadComponent: () =>
      import('./layouts/auth-layout/auth-layout.component').then(
        (m) => m.AuthLayoutComponent
      ),
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // ── Main layout (authenticated) ──────────────────────────────────────────────
  {
    path: '',
    loadComponent: () =>
      import('./layouts/main-layout/main-layout.component').then(
        (m) => m.MainLayoutComponent
      ),
    canActivate: [authGuard],
    children: [
      // Dashboard
      {
        path: 'dashboard',
        loadChildren: () =>
          import('./features/dashboard/dashboard.routes').then(
            (m) => m.DASHBOARD_ROUTES
          ),
      },

      // Plans & pricing
      {
        path: 'plans',
        loadChildren: () =>
          import('./features/plans/plans.routes').then((m) => m.PLANS_ROUTES),
      },

      // Technical simulator
      {
        path: 'simulator',
        loadChildren: () =>
          import('./features/simulator/simulator.routes').then(
            (m) => m.SIMULATOR_ROUTES
          ),
      },

      // Certificates — Pro+ only (planGuard enforces plan feature)
      {
        path: 'certificates',
        canActivate: [planGuard('certificates')],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent // placeholder until CertificatesComponent is built
          ),
      },

      // Ranking — Pro+ only (planGuard enforces plan feature)
      {
        path: 'ranking',
        canActivate: [planGuard('ranking')],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent // placeholder until RankingComponent is built
          ),
      },

      // Admin (additionally guarded at the feature-routes level)
      {
        path: 'admin',
        loadChildren: () =>
          import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
      },
    ],
  },

  // ── Wildcard ─────────────────────────────────────────────────────────────────
  { path: '**', redirectTo: 'dashboard' },
];

export default APP_ROUTES;

