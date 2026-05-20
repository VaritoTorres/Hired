/**
 * @file profile.service.ts
 * @description Domain service responsible for all profile-related Supabase queries.
 *
 * Responsibilities
 * ─────────────────
 *  - getCurrentProfile()   → fetch the authenticated user's profile row
 *  - updateProfile()       → patch mutable profile fields
 *  - getUserPlan()         → fetch the user's current plan (joined from plans table)
 *
 * Design notes
 * ─────────────
 *  - All DB calls go through SupabaseService, never through a direct import.
 *  - Returns Observables (from/switchMap) to compose cleanly with Angular async pipe.
 *  - Errors are normalised and surfaced via ToastService + rethrown for callers.
 */
import { Injectable, inject }          from '@angular/core';
import { from, Observable, switchMap, of } from 'rxjs';
import { map, tap, catchError }        from 'rxjs/operators';
import { throwError }                  from 'rxjs';
import { SupabaseService }             from './supabase.service';
import { AuthService }                 from './auth.service';
import { ToastService }                from './toast.service';
import { Profile, UpdateProfilePayload, ProfileWithPlan } from '../../shared/models/profile.model';
import { Plan }                        from '../../shared/models/plan.model';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly toast    = inject(ToastService);

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Fetch the currently authenticated user's profile row.
   *
   * @returns Observable<Profile> — emits once with the fresh row.
   */
  getCurrentProfile(): Observable<Profile> {
    return this.auth.getCurrentUser().pipe(
      // Take the current emission and switch to the DB query.
      switchMap((user) => {
        if (!user) {
          return throwError(() => new Error('No authenticated user'));
        }

        return from(
          this.supabase.client
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single()
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Profile;
      }),
      catchError((err) => {
        this.toast.error('Error al cargar perfil', err.message);
        return throwError(() => err);
      })
    );
  }

  /**
   * Apply a partial update to the authenticated user's profile.
   *
   * @param payload  Fields to update — only send what changed.
   * @returns Observable<Profile> with the updated row.
   */
  updateProfile(payload: UpdateProfilePayload): Observable<Profile> {
    return this.auth.getCurrentUser().pipe(
      switchMap((user) => {
        if (!user) {
          return throwError(() => new Error('No authenticated user'));
        }

        return from(
          this.supabase.client
            .from('profiles')
            .update({ ...payload, updated_at: new Date().toISOString() })
            .eq('id', user.id)
            .select()
            .single()
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Profile;
      }),
      tap(() => this.toast.success('Perfil actualizado correctamente')),
      catchError((err) => {
        this.toast.error('Error al actualizar perfil', err.message);
        return throwError(() => err);
      })
    );
  }

  /**
   * Fetch the user's profile joined with their current subscription plan.
   *
   * Uses three fully-separate, join-free queries to avoid PostgREST's
   * "Cannot coerce the result to a single JSON object" error (triggered
   * whenever profiles is queried with an embedded user_subscriptions join,
   * because the bidirectional FK makes cardinality ambiguous).
   *
   * Step 1: profiles — select('*'), no embedded selects, maybeSingle()
   * Step 2: user_subscriptions — fetched by active_subscription_id
   * Step 3: subscription_plans — fetched by plan_id
   *
   * Falls back to free-plan defaults silently at any step.
   *
   * @returns Observable<ProfileWithPlan>
   */
  getUserPlan(): Observable<ProfileWithPlan> {
    return this.auth.getCurrentUser().pipe(
      switchMap((user) => {
        if (!user) {
          return throwError(() => new Error('No authenticated user'));
        }

        // Step 1 — plain select('*'), NO embedded joins, maybeSingle() not single()
        return from(
          this.supabase.client
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle()
        ).pipe(
          switchMap(({ data: profile, error: profileErr }) => {
            if (profileErr) throw new Error(profileErr.message);

            // If no profile row yet (new user), return a bare free-plan profile
            if (!profile) {
              return of({
                profile: {
                  id: user.id,
                  full_name: user.email ?? '',
                  avatar_url: null,
                  plan_id: 'free-default',
                  role: 'user',
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  total_xp: 0,
                  global_rank_title: 'Rookie',
                  active_subscription_id: null,
                },
                subPlan: null,
              });
            }

            const subId: string | null = (profile as any).active_subscription_id ?? null;
            if (!subId) return of({ profile, subPlan: null });

            // Step 2 — subscription row, plain scalar columns only
            return from(
              this.supabase.client
                .from('user_subscriptions')
                .select('id, plan_id')
                .eq('id', subId)
                .maybeSingle()
            ).pipe(
              switchMap(({ data: sub, error: subErr }) => {
                const planId: string | null = (!subErr && sub) ? (sub as any).plan_id ?? null : null;
                if (!planId) return of({ profile, subPlan: null });

                // Step 3 — plan row, plain scalar columns only
                return from(
                  this.supabase.client
                    .from('subscription_plans')
                    .select('id, name, slug, monthly_price, simulations_per_month, max_technologies, is_featured, created_at')
                    .eq('id', planId)
                    .maybeSingle()
                ).pipe(
                  map(({ data: planData, error: planErr }) => ({
                    profile,
                    subPlan: (!planErr && planData) ? planData as any : null,
                  }))
                );
              })
            );
          })
        );
      }),
      map(({ profile, subPlan }: { profile: any; subPlan: any }) => {
        const plan: Plan = subPlan
          ? {
              id:                        subPlan.id,
              name:                      subPlan.name,
              slug:                      subPlan.slug,
              price_monthly:             subPlan.monthly_price         ?? 0,
              price_yearly:              (subPlan.monthly_price ?? 0)  * 10,
              max_simulations_per_month: subPlan.simulations_per_month ?? null,
              features:                  [],
              is_featured:               subPlan.is_featured           ?? false,
              created_at:                subPlan.created_at            ?? new Date().toISOString(),
            }
          : {
              id:                        'free-default',
              name:                      'Free',
              slug:                      'free' as import('../../shared/models/plan.model').PlanSlug,
              price_monthly:             0,
              price_yearly:              0,
              max_simulations_per_month: 3,
              features:                  [],
              is_featured:               false,
              created_at:                new Date().toISOString(),
            };

        return { ...profile, plan } as ProfileWithPlan;
      }),
      catchError((err) => {
        this.toast.error('Error al obtener plan', err.message);
        return throwError(() => err);
      })
    );
  }
}
