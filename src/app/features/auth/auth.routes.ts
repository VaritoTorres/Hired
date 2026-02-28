/**
 * @file auth.routes.ts
 * @description Route definitions for the Auth feature (login + register).
 * Loaded lazily from the root router via loadChildren.
 *
 * The AuthLayoutComponent is applied at the parent level in app.routes.ts,
 * so these child routes only define the inner views.
 */
import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then((m) => m.LoginComponent),
    title: 'Iniciar sesión — HIRED',
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./register/register.component').then((m) => m.RegisterComponent),
    title: 'Crear cuenta — HIRED',
  },
];
