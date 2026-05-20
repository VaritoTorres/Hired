/**
 * @file app.routes.ts
 * @description Root route configuration for HIRED.
 *
 * Design decisions
 * ----------------
 * → Every feature is lazy-loaded (loadChildren / loadComponent) to minimise
 *   the initial bundle and improve Time-to-Interactive.
 * → Route access is split into two layout contexts:
 *     /auth  ? AuthLayoutComponent   (unauthenticated, centred)
 *     /      ? MainLayoutComponent   (authenticated, nav + sidebar)
 * → `authGuard` (functional, uses inject()) protects all private routes.
 * → The root path performs a smart redirect via the RedirectGuard (see below).
 */
import { Routes }        from '@angular/router';
import { authGuard }     from './core/guards/auth.guard';
import { planGuard }     from './core/guards/plan.guard';

export const APP_ROUTES: Routes = [
  // -- Root redirect ------------------------------------------------------------
  // Always redirect bare "/" to dashboard; authGuard will bounce
  // unauthenticated visitors to /auth/login automatically.
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'dashboard',
  },

  // -- Simulator exam — full-screen (no main layout) -------------------------
  // Defined BEFORE the main-layout '' route so specific paths are matched first.
  {
    path: 'simulator/exam/:attemptId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/simulator/simulator-exam/simulator-exam.component').then(
        (m) => m.SimulatorExamComponent
      ),
    title: 'Examen — HIRED',
  },

  // -- Simulator results — full-screen (no main layout) ---------------------
  {
    path: 'simulator/results/:attemptId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/simulator/simulator-results/simulator-results.component').then(
        (m) => m.SimulatorResultsComponent
      ),
    title: 'Resultados — HIRED',
  },

  // -- Auth layout --------------------------------------------------------------
  {
    path: 'auth',
    loadComponent: () =>
      import('./layouts/auth-layout/auth-layout.component').then(
        (m) => m.AuthLayoutComponent
      ),
    loadChildren: () =>
      import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
  },

  // -- Main layout (authenticated) ----------------------------------------------
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
        canActivate: [planGuard('certification_access')],
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent // placeholder until CertificatesComponent is built
          ),
      },

      // Mapa de Competencias — Adaptive AI diagnostic intelligence
      {
        path: 'competence-map',
        loadChildren: () =>
          import('./features/competence-map/competence-map.routes').then(
            (m) => m.COMPETENCE_MAP_ROUTES
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

  // -- Public certificate verification (no auth required) ----------------------
  {
    path: 'verify/:code',
    loadComponent: () =>
      import('./features/verify/verify-certificate.component').then(
        (m) => m.VerifyCertificateComponent
      ),
    title: 'Verificar Certificado — HIRED',
  },

  // -- Public technical profile (no auth required) ---------------------------
  {
    path: 'u/:slug',
    loadComponent: () =>
      import('./features/public-profile/public-profile.component').then(
        (m) => m.PublicProfileComponent
      ),
    title: 'Perfil Técnico — HIRED',
  },

  // -- Wildcard -----------------------------------------------------------------
  { path: '**', redirectTo: 'dashboard' },
];

export default APP_ROUTES;

