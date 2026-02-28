/**
 * @file plan.guard.ts
 * @description Route guard that restricts access based on the user's plan features.
 *
 * Usage — attach to routes that require a specific plan feature:
 *
 * ```ts
 * {
 *   path: 'certificates',
 *   canActivate: [planGuard('certificates')],
 *   loadComponent: () => import('./certificates/certificates.component')
 *                          .then(m => m.CertificatesComponent),
 * }
 * ```
 *
 * When the user's plan does NOT include the requested feature:
 *  - Emits a warning toast explaining the restriction.
 *  - Redirects to /plans so the user can upgrade.
 *  - Does NOT expose the protected route at all in the browser URL bar.
 *
 * Design: factory function that returns a CanActivateFn — this pattern lets us
 * pass the required feature as a parameter with zero boilerplate.
 */
import { inject }                         from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { Observable, of }                 from 'rxjs';
import { map, catchError, take }          from 'rxjs/operators';
import { ProfileService }                 from '../services/profile.service';
import { ToastService }                   from '../services/toast.service';
import { PlanFeature, hasPlanFeature }    from '../../shared/models/plan.model';

/**
 * Factory that creates a functional guard for a specific plan feature.
 *
 * @param requiredFeature  The PlanFeature key the route requires.
 * @returns CanActivateFn  Drop-in guard for canActivate / canActivateChild.
 */
export function planGuard(requiredFeature: PlanFeature): CanActivateFn {
  return (): Observable<boolean | UrlTree> => {
    const profileService = inject(ProfileService);
    const toastService   = inject(ToastService);
    const router         = inject(Router);

    return profileService.getUserPlan().pipe(
      take(1),
      map((profileWithPlan) => {
        const slug = profileWithPlan.plan?.slug;

        if (slug && hasPlanFeature(slug, requiredFeature)) {
          // ✅ User has the required feature — allow navigation.
          return true;
        }

        // 🚫 Feature not available on current plan.
        const planName = profileWithPlan.plan?.name ?? 'tu plan actual';
        toastService.warning(
          'Función no disponible',
          `La función "${requiredFeature}" no está incluida en ${planName}. ` +
          `Actualiza tu plan para acceder a esta sección. 🚀`
        );

        // Redirect to the plans page so the user can upgrade.
        return router.createUrlTree(['/plans']);
      }),
      catchError(() => {
        // If the profile lookup fails, redirect gracefully instead of crashing.
        return of(router.createUrlTree(['/dashboard']));
      })
    );
  };
}
