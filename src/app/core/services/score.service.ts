/**
 * @file score.service.ts
 * @description Domain service for reading and refreshing scoring data.
 *
 * Responsibilities
 * ─────────────────
 *  - getTechnicalScores()        → per-technology aggregates with level + breakdown avg
 *  - getScoreEvolution()         → ordered list of weighted_score points for charting
 *  - getBreakdownAverages()      → average per breakdown category across all attempts
 *  - refreshScoresAfterAttempt() → triggers server-side recalculation via RPC
 *
 * ALL score mutations happen server-side via the PostgreSQL trigger
 * `trg_score_on_attempt_complete` (installed in migration 001).
 * This service is READ-ONLY from the Angular side.
 */
import { Injectable, inject }           from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { map, switchMap, catchError, take } from 'rxjs/operators';
import { SupabaseService }              from './supabase.service';
import { AuthService }                  from './auth.service';
import { ToastService }                 from './toast.service';
import { TechnicalScoreWithTechnology } from '../../shared/models/technical-score.model';
import { AttemptScorePoint, ScoreBreakdown } from '../../shared/models/simulation-attempt.model';

/** Average value across all four breakdown categories. */
export interface BreakdownAverages {
  concepts:        number;
  problem_solving: number;
  clean_code:      number;
  performance:     number;
}

@Injectable({ providedIn: 'root' })
export class ScoreService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly toast    = inject(ToastService);

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Retrieve all technical scores for the authenticated user,
   * joined with the technology name / icon and including level_estimated.
   *
   * @returns Observable<TechnicalScoreWithTechnology[]> sorted by average_score desc
   */
  getTechnicalScores(): Observable<TechnicalScoreWithTechnology[]> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        return from(
          this.supabase.client
            .from('technical_scores')
            .select(`
              id,
              user_id,
              technology_id,
              average_score,
              total_attempts,
              level_estimated,
              percentile_rank,
              weakest_area,
              last_attempted_at,
              updated_at,
              technology:technologies (
                id, name, category, created_at
              )
            `)
            .eq('user_id', user.id)
            .order('average_score', { ascending: false })
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as TechnicalScoreWithTechnology[];
      }),
      catchError((err: Error) => {
        // Silently return empty when the table doesn't exist yet (migration pending)
        if (err.message?.includes('schema cache') || err.message?.includes('does not exist')) {
          return [[] as TechnicalScoreWithTechnology[]];
        }
        this.toast.error('Error al cargar puntajes técnicos', err.message);
        return [[] as TechnicalScoreWithTechnology[]];
      })
    );
  }

  /**
   * Return an ordered series of weighted_score data-points for the current user.
   * Used to render the score evolution chart on the dashboard.
   *
   * Queries simulation_attempts directly (not technical_scores) so each
   * individual attempt appears as a separate point on the timeline.
   *
   * @param limit  Max number of most-recent points to return (default 20)
   * @returns Observable<AttemptScorePoint[]> ordered oldest → newest
   */
  getScoreEvolution(limit = 20): Observable<AttemptScorePoint[]> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        return from(
          this.supabase.client
            .from('simulation_attempts')
            .select(`
              completed_at,
              weighted_score,
              simulation:simulations ( title, level )
            `)
            .eq('user_id', user.id)
            .eq('status', 'completed')
            .not('weighted_score', 'is', null)
            .order('completed_at', { ascending: false })
            .limit(limit)
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);

        // Reverse so the chart renders left=oldest, right=newest
        const points = ((data ?? []) as unknown as Array<{
          completed_at: string;
          weighted_score: number;
          simulation: { title: string; level: string } | null;
        }>)
          .map((row) => ({
            completed_at:   row.completed_at,
            weighted_score: row.weighted_score,
            title:          row.simulation?.title ?? 'Simulación',
            level:          row.simulation?.level ?? 'mid',
          } satisfies AttemptScorePoint))
          .reverse();

        return points;
      }),
      catchError((err) => {
        // Non-critical chart data — do not crash the dashboard
        console.error('[ScoreService] getScoreEvolution error:', err.message);
        return [[] as AttemptScorePoint[]];
      })
    );
  }

  /**
   * Compute per-category averages across all completed attempts.
   * Returns zeros when no completed attempts exist yet.
   *
   * Note: this aggregation runs client-side from the raw breakdown data
   * because Postgres JSONB avg would require a custom SQL function.
   * If volume grows, promote this to an RPC.
   *
   * @returns Observable<BreakdownAverages>
   */
  getBreakdownAverages(): Observable<BreakdownAverages> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        return from(
          this.supabase.client
            .from('simulation_attempts')
            .select('breakdown')
            .eq('user_id', user.id)
            .eq('status', 'completed')
            .not('breakdown', 'is', null)
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);

        const rows = (data ?? []) as Array<{ breakdown: ScoreBreakdown }>;
        const n = rows.length;

        if (n === 0) {
          return { concepts: 0, problem_solving: 0, clean_code: 0, performance: 0 };
        }

        const sums = rows.reduce(
          (acc, row) => {
            const b = row.breakdown ?? ({} as ScoreBreakdown);
            acc.concepts        += b.concepts        ?? 0;
            acc.problem_solving += b.problem_solving ?? 0;
            acc.clean_code      += b.clean_code      ?? 0;
            acc.performance     += b.performance     ?? 0;
            return acc;
          },
          { concepts: 0, problem_solving: 0, clean_code: 0, performance: 0 }
        );

        return {
          concepts:        Math.round(sums.concepts        / n),
          problem_solving: Math.round(sums.problem_solving / n),
          clean_code:      Math.round(sums.clean_code      / n),
          performance:     Math.round(sums.performance     / n),
        } satisfies BreakdownAverages;
      }),
      catchError((err) => {
        console.error('[ScoreService] getBreakdownAverages error:', err.message);
        return [{ concepts: 0, problem_solving: 0, clean_code: 0, performance: 0 }];
      })
    );
  }

  /**
   * Explicitly request a server-side recalculation of technical scores.
   * Calls the `recalculate_technical_scores` Postgres function via RPC.
   *
   * Use after bulk data corrections or manual imports.
   * In normal flow the trigger fires automatically — this is a safety valve.
   *
   * @returns Observable<void>
   */
  refreshScoresAfterAttempt(): Observable<void> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        return from(
          this.supabase.client.rpc('recalculate_technical_scores', {
            p_user_id: user.id,
          })
        );
      }),
      map(({ error }) => {
        if (error) {
          console.warn('[ScoreService] refreshScoresAfterAttempt RPC warning:', error.message);
        }
      }),
      catchError((err) => {
        console.error('[ScoreService] refreshScoresAfterAttempt error:', err.message);
        return [undefined];
      })
    );
  }
}
