/**
 * @file plans.service.ts
 * @description Domain service for the professional subscription system.
 *
 * Responsibilities
 * -----------------
 *  - getAllPlans()            -> full catalogue for the pricing page
 *  - getActiveSubscription() -> current user active subscription via RPC
 *  - checkSimulationAccess() -> atomic quota check + counter increment via RPC
 *  - checkFeatureAccess()    -> feature-flag gate check via RPC
 *  - getRemainingSimulations() / getSimulationUsagePct() -> UI helpers
 *
 * All enforcement RPCs run server-side (Supabase), ensuring the client cannot
 * bypass quota or feature restrictions by manipulating local state.
 */
import { Injectable, inject }    from '@angular/core';
import { from, Observable, of }  from 'rxjs';
import { map, catchError, switchMap, take } from 'rxjs/operators';
import { throwError, firstValueFrom }       from 'rxjs';
import { SupabaseService }       from './supabase.service';
import { AuthService }           from './auth.service';
import { ToastService }          from './toast.service';
import {
  SubscriptionPlan,
  ActiveSubscription,
  AccessCheckResult,
  PlanFeature,
} from '../../shared/models/plan.model';

@Injectable({ providedIn: 'root' })
export class PlansService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly toast    = inject(ToastService);

  // -- Public API -------------------------------------------------------------

  /**
   * Retrieve all subscription plans ordered by sort_order ascending.
   * Used on the /plans pricing page.
   */
  getAllPlans(): Observable<SubscriptionPlan[]> {
    return from(
      this.supabase.client
        .from('subscription_plans')
        .select('*')
        .order('sort_order', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as SubscriptionPlan[];
      }),
      catchError((err: Error) => {
        if (err.message?.includes('schema cache') || err.message?.includes('does not exist') || err.message?.includes('could not find')) {
          return [[] as SubscriptionPlan[]];
        }
        this.toast.error('Error al cargar planes', err.message);
        return [[] as SubscriptionPlan[]];
      })
    );
  }

  /**
   * Get the current user's active subscription via the
   * `hired_get_active_subscription` RPC. Returns null when no subscription
   * is found or the user is not authenticated.
   */
  getActiveSubscription(): Observable<ActiveSubscription | null> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return of(null);
        return from(
          this.supabase.client.rpc('hired_get_active_subscription', {
            p_user_id: user.id,
          })
        ).pipe(
          map(({ data, error }) => {
            if (error) throw new Error(error.message);
            const rows = (data ?? []) as ActiveSubscription[];
            return rows.length > 0 ? rows[0] : null;
          }),
          catchError((err: Error) => {
            if (!err.message?.includes('schema cache') && !err.message?.includes('does not exist') && !err.message?.includes('could not find')) {
              this.toast.error('Error al cargar suscripcion', err.message);
            }
            return of(null);
          })
        );
      })
    );
  }

  /**
   * Server-side atomic check + counter increment via
   * `hired_check_simulation_access`. Returns an AccessCheckResult.
   * Call this BEFORE starting a simulation.
   */
  async checkSimulationAccess(): Promise<AccessCheckResult> {
    const user = await firstValueFrom(this.auth.getCurrentUser().pipe(take(1)));
    if (!user) {
      return { allowed: false, reason: 'Usuario no autenticado.' };
    }

    const { data, error } = await this.supabase.client.rpc(
      'hired_check_simulation_access',
      { p_user_id: user.id }
    );

    if (error) {
      this.toast.error('Error de acceso', error.message);
      return { allowed: false, reason: error.message };
    }

    const result = Array.isArray(data) ? data[0] : data;
    return {
      allowed: result?.allowed ?? false,
      reason:  result?.reason  ?? '',
    };
  }

  /**
   * Server-side feature flag check via `hired_check_feature_access`.
   * Returns an AccessCheckResult with an optional required_plan hint.
   *
   * @param feature  The PlanFeature key to check (e.g. 'certification_access')
   */
  async checkFeatureAccess(feature: PlanFeature): Promise<AccessCheckResult> {
    const user = await firstValueFrom(this.auth.getCurrentUser().pipe(take(1)));
    if (!user) {
      return { allowed: false, reason: 'Usuario no autenticado.' };
    }

    const { data, error } = await this.supabase.client.rpc(
      'hired_check_feature_access',
      { p_user_id: user.id, p_feature: feature }
    );

    if (error) {
      this.toast.error('Error de acceso', error.message);
      return { allowed: false, reason: error.message };
    }

    const result = Array.isArray(data) ? data[0] : data;
    return {
      allowed:       result?.allowed       ?? false,
      reason:        result?.reason        ?? '',
      required_plan: result?.required_plan ?? undefined,
    };
  }

  // -- UI Helpers -------------------------------------------------------------

  /**
   * Remaining simulations for the current billing cycle.
   * Returns null when the plan has unlimited simulations.
   */
  getRemainingSimulations(sub: ActiveSubscription): number | null {
    if (sub.simulations_per_month === null) return null;
    return Math.max(0, sub.simulations_per_month - sub.simulations_used_this_month);
  }

  /**
   * Simulation quota usage as a percentage (0-100).
   * Returns 0 when the plan has unlimited simulations.
   */
  getSimulationUsagePct(sub: ActiveSubscription): number {
    if (sub.simulations_per_month === null) return 0;
    if (sub.simulations_per_month === 0) return 100;
    const pct = (sub.simulations_used_this_month / sub.simulations_per_month) * 100;
    return Math.min(100, Math.round(pct));
  }
}
