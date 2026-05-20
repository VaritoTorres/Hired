/**
 * @file plan.guard.ts
 * @description Route guard that enforces subscription feature access server-side.
 *
 * Usage:
 *
 * ```ts
 * {
 *   path: 'certificates',
 *   canActivate: [planGuard('certification_access')],
 *   loadComponent: () => import('./certificates/certificates.component')
 *                          .then(m => m.CertificatesComponent),
 * }
 * ```
 *
 * When the user's subscription does NOT include the requested feature:
 *  - Emits a warning toast explaining the restriction.
 *  - Redirects to /plans so the user can upgrade.
 *  - Does NOT expose the protected route in the browser URL bar.
 *
 * Enforcement is server-side via the `hired_check_feature_access` Supabase RPC,
 * so frontend-only workarounds cannot bypass the gate.
 *
 * Design: factory function returning a CanActivateFn  allows passing the
 * required feature as a parameter with zero boilerplate.
 */
import { inject }                         from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { from }                           from 'rxjs';
import { PlansService }                   from '../services/plans.service';
import { ToastService }                   from '../services/toast.service';
import { PlanFeature, FEATURE_LABELS }    from '../../shared/models/plan.model';

/**
 * Factory that creates a functional guard for a specific plan feature.
 *
 * @param requiredFeature  The PlanFeature key the route requires.
 * @returns CanActivateFn  Drop-in guard for canActivate / canActivateChild.
 */
export function planGuard(requiredFeature: PlanFeature): CanActivateFn {
  return (): ReturnType<CanActivateFn> => {
    const plansSvc   = inject(PlansService);
    const toastSvc   = inject(ToastService);
    const router     = inject(Router);

    const featureLabel = FEATURE_LABELS[requiredFeature] ?? requiredFeature;

    return from(
      plansSvc.checkFeatureAccess(requiredFeature).then(
        (result): boolean | UrlTree => {
          if (result.allowed) return true;

          const requiredPlan = result.required_plan
            ? ` Necesitas el plan ${result.required_plan}.`
            : '';

          toastSvc.warning(
            'Funcion no disponible',
            `"${featureLabel}" no esta incluida en tu plan actual.${requiredPlan} Actualiza para acceder.`
          );

          return router.createUrlTree(['/plans']);
        }
      ).catch((): UrlTree => {
        // Network/auth failure  redirect gracefully instead of crashing.
        return router.createUrlTree(['/dashboard']);
      })
    );
  };
}
