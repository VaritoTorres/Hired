/**
 * @file auth.guard.ts
 * @description Functional route guard that protects all private routes.
 *
 * Uses Angular's modern `inject()` pattern (no class-based CanActivate)
 * and the reactive `isAuthenticated()` stream from AuthService.
 *
 * Redirects unauthenticated users to /auth/login while preserving
 * the attempted URL as a query param for post-login redirect.
 */
import { inject }                         from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable }                     from 'rxjs';
import { map, take }                      from 'rxjs/operators';
import { AuthService }                    from '../services/auth.service';

/**
 * Functional guard — attach to any route requiring authentication.
 *
 * @example
 * ```ts
 * {
 *   path: 'dashboard',
 *   canActivate: [authGuard],
 *   loadChildren: () => import('./features/dashboard/dashboard.routes')
 *                         .then(m => m.DASHBOARD_ROUTES),
 * }
 * ```
 */
export const authGuard: CanActivateFn = (
  _route,
  state
): Observable<boolean | UrlTree> => {
  const authService = inject(AuthService);
  const router      = inject(Router);

  return authService.isAuthenticated().pipe(
    take(1),
    map((isAuth) => {
      if (isAuth) return true;

      // Preserve the intended URL so we can redirect after a successful login.
      return router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: state.url },
      });
    })
  );
};
