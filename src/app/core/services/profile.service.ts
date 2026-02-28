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
import { from, Observable, switchMap } from 'rxjs';
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
   * Fetch the user's profile joined with their current plan.
   * Uses Supabase's auto-join via a foreign-key relationship.
   *
   * @returns Observable<ProfileWithPlan>
   */
  getUserPlan(): Observable<ProfileWithPlan> {
    return this.auth.getCurrentUser().pipe(
      switchMap((user) => {
        if (!user) {
          return throwError(() => new Error('No authenticated user'));
        }

        return from(
          this.supabase.client
            .from('profiles')
            .select(`
              *,
              plan:plans (
                id,
                name,
                slug,
                price_monthly,
                price_yearly,
                max_simulations_per_month,
                features,
                is_featured,
                created_at
              )
            `)
            .eq('id', user.id)
            .single()
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as ProfileWithPlan;
      }),
      catchError((err) => {
        this.toast.error('Error al obtener plan', err.message);
        return throwError(() => err);
      })
    );
  }
}
