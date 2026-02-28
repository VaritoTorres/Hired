/**
 * @file simulation.service.ts
 * @description Domain service for all simulation-related operations.
 *
 * Responsibilities
 * ─────────────────
 *  - getAvailableSimulations()       → active simulations for the current user
 *  - startSimulation(simulationId)   → validates plan limits, creates an attempt row
 *  - saveAttempt(payload)            → submit answers and complete the attempt
 *  - getUserAttempts()               → history of all user attempts (joined)
 *  - countUserAttemptsThisMonth()    → integer count used for plan enforcement
 *
 * Plan enforcement (CRITICAL)
 * ────────────────────────────
 *  startSimulation() performs a two-step check BEFORE creating any DB row:
 *    1. Load the user's plan via ProfileService.getUserPlan().
 *    2. Count attempts in the current calendar month via countUserAttemptsThisMonth().
 *    3. If count >= plan.max_simulations_per_month → throw PlanLimitExceededError.
 *  This logic lives HERE, never in a component.
 */
import { Injectable, inject }         from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { map, switchMap, catchError, take } from 'rxjs/operators';
import { SupabaseService }            from './supabase.service';
import { AuthService }                from './auth.service';
import { ProfileService }             from './profile.service';
import { ToastService }               from './toast.service';
import {
  Simulation,
  SimulationWithTechnology,
} from '../../shared/models/simulation.model';
import {
  SimulationAttempt,
  AttemptWithSimulation,
  SaveAttemptPayload,
} from '../../shared/models/simulation-attempt.model';

// ─── Custom error types ───────────────────────────────────────────────────────

/**
 * Thrown when a user attempts to start a simulation that would exceed
 * their plan's monthly limit.  Catch this in the component to show
 * an upgrade CTA rather than a generic error message.
 */
export class PlanLimitExceededError extends Error {
  constructor(
    public readonly used: number,
    public readonly limit: number,
    public readonly planName: string
  ) {
    super(
      `Has alcanzado el límite de ${limit} simulaciones mensuales del plan ${planName}. ` +
      `Actualiza tu plan para continuar practicando.`
    );
    this.name = 'PlanLimitExceededError';
  }
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class SimulationService {
  private readonly supabase       = inject(SupabaseService);
  private readonly auth           = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly toast          = inject(ToastService);

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Returns all active simulations joined with their technology.
   * Sorted by technology name then difficulty level.
   *
   * @returns Observable<SimulationWithTechnology[]>
   */
  getAvailableSimulations(): Observable<SimulationWithTechnology[]> {
    return from(
      this.supabase.client
        .from('simulations')
        .select(`
          *,
          technology:technologies (
            id, name, slug, icon_url, category, created_at
          )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as SimulationWithTechnology[];
      }),
      catchError((err) => {
        this.toast.error('Error al cargar simulaciones', err.message);
        return throwError(() => err);
      })
    );
  }

  /**
   * Validates the user's plan limit and opens a new simulation attempt.
   *
   * @param simulationId UUID of the simulation to start
   * @returns Observable<SimulationAttempt> — the newly created attempt row
   * @throws PlanLimitExceededError when the monthly quota is exhausted
   */
  startSimulation(simulationId: string): Observable<SimulationAttempt> {
    // Step 1: resolve authenticated user id
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        // Step 2: load profile + plan in parallel with attempt count
        return this.profileService.getUserPlan().pipe(
          take(1),
          switchMap((profileWithPlan) => {
            return this.countUserAttemptsThisMonth().pipe(
              take(1),
              switchMap((usedCount) => {
                const plan = profileWithPlan.plan;
                const limit = plan.max_simulations_per_month;

                // Step 3: enforce limit (null = unlimited)
                if (limit !== null && usedCount >= limit) {
                  const err = new PlanLimitExceededError(usedCount, limit, plan.name);
                  this.toast.warning(
                    'Límite mensual alcanzado',
                    `${err.message} 🚀`
                  );
                  return throwError(() => err);
                }

                // Step 4: create the attempt row
                return from(
                  this.supabase.client
                    .from('simulation_attempts')
                    .insert({
                      user_id:       user.id,
                      simulation_id: simulationId,
                      status:        'in_progress',
                      started_at:    new Date().toISOString(),
                      answers:       [],
                    })
                    .select()
                    .single()
                ).pipe(
                  map(({ data, error: dbError }) => {
                    if (dbError) throw new Error(dbError.message);
                    return data as SimulationAttempt;
                  })
                );
              })
            );
          })
        );
      }),
      catchError((err) => {
        // Only show toast for non-plan-limit errors (plan limit has its own toast)
        if (!(err instanceof PlanLimitExceededError)) {
          this.toast.error('Error al iniciar simulación', err.message);
        }
        return throwError(() => err);
      })
    );
  }

  /**
   * Submit answers for a completed attempt and mark it as completed.
   *
   * @param attemptId UUID of the existing in_progress attempt
   * @param payload   Answers + elapsed duration
   * @returns Observable<SimulationAttempt> — updated attempt row
   */
  saveAttempt(
    attemptId: string,
    payload: SaveAttemptPayload
  ): Observable<SimulationAttempt> {
    return from(
      this.supabase.client
        .from('simulation_attempts')
        .update({
          answers:          payload.answers,
          duration_seconds: payload.duration_seconds,
          status:           'completed',
          completed_at:     new Date().toISOString(),
        })
        .eq('id', attemptId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as SimulationAttempt;
      }),
      catchError((err) => {
        this.toast.error('Error al guardar intento', err.message);
        return throwError(() => err);
      })
    );
  }

  /**
   * Retrieve the authenticated user's full attempt history, newest first.
   * Joined with a lightweight simulation summary for display purposes.
   *
   * @returns Observable<AttemptWithSimulation[]>
   */
  getUserAttempts(): Observable<AttemptWithSimulation[]> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        return from(
          this.supabase.client
            .from('simulation_attempts')
            .select(`
              *,
              simulation:simulations (
                id, title, difficulty, technology_id
              )
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as AttemptWithSimulation[];
      }),
      catchError((err) => {
        this.toast.error('Error al cargar historial', err.message);
        return throwError(() => err);
      })
    );
  }

  /**
   * Count the number of completed/in-progress attempts the authenticated user
   * has made in the current calendar month (UTC).
   *
   * Used internally by startSimulation() and exposed for the dashboard widget.
   *
   * @returns Observable<number>
   */
  countUserAttemptsThisMonth(): Observable<number> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        // ISO-8601 first and last second of the current UTC month
        const now       = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
          .toISOString();
        const monthEnd   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
          .toISOString();

        return from(
          this.supabase.client
            .from('simulation_attempts')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .neq('status', 'abandoned')
            .gte('created_at', monthStart)
            .lt('created_at', monthEnd)
        );
      }),
      map(({ count, error }) => {
        if (error) throw new Error(error.message);
        return count ?? 0;
      }),
      catchError((err) => {
        // Non-critical — return 0 to avoid blocking the UI
        console.error('[SimulationService] countUserAttemptsThisMonth error:', err.message);
        return [0];
      })
    );
  }
}
