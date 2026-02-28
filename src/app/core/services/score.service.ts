/**
 * @file score.service.ts
 * @description Domain service for the `technical_scores` table.
 *
 * Responsibilities
 * ─────────────────
 *  - getTechnicalScores()          → aggregated scores by technology for the current user
 *  - refreshScoresAfterAttempt()   → triggers a server-side recalculation via RPC
 *
 * The `technical_scores` table is typically kept up-to-date by a Postgres trigger.
 * refreshScoresAfterAttempt() calls a Supabase RPC function as an explicit refresh
 * hook so the dashboard always shows the latest numbers without polling.
 */
import { Injectable, inject }         from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { map, switchMap, catchError, take } from 'rxjs/operators';
import { SupabaseService }            from './supabase.service';
import { AuthService }                from './auth.service';
import { ToastService }               from './toast.service';
import { TechnicalScoreWithTechnology } from '../../shared/models/technical-score.model';

@Injectable({ providedIn: 'root' })
export class ScoreService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly toast    = inject(ToastService);

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Retrieve all technical scores for the authenticated user,
   * joined with the technology name and icon.
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
              *,
              technology:technologies (
                id, name, slug, icon_url, category, created_at
              )
            `)
            .eq('user_id', user.id)
            .order('average_score', { ascending: false })
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as TechnicalScoreWithTechnology[];
      }),
      catchError((err) => {
        this.toast.error('Error al cargar puntajes técnicos', err.message);
        return throwError(() => err);
      })
    );
  }

  /**
   * Explicitly request a server-side recalculation of technical scores.
   *
   * This calls the `recalculate_technical_scores` Postgres function via RPC.
   * Invoke this after saving a simulation attempt to guarantee the dashboard
   * reflects the latest data immediately.
   *
   * If the RPC function does not exist yet (e.g. in development), this call
   * is a no-op — the error is swallowed to avoid breaking the attempt flow.
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
        // Silently ignore missing RPC (feature-flagged in production)
        if (error) {
          console.warn('[ScoreService] refreshScoresAfterAttempt RPC error:', error.message);
        }
      }),
      catchError((err) => {
        // Non-critical — do not block the caller
        console.error('[ScoreService] refreshScoresAfterAttempt error:', err.message);
        return [undefined];
      })
    );
  }
}
