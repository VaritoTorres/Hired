/**
 * @file progress.service.ts
 * @description Domain service for user progress, XP, streaks and adaptive tips.
 *
 * Responsibilities
 * ─────────────────
 *  - getUserProgress()     → per-technology progress rows (XP, streak, level)
 *  - getTotalStreak()      → highest current streak across all technologies
 *  - generateAdaptiveTip() → static helper — derives practice recommendation
 *                            from TechnicalScore.weakest_area
 *
 * XP and streak mutations happen exclusively server-side via the PostgreSQL
 * trigger `trg_progress_on_attempt_complete` (migration 002).
 * This service is READ-ONLY from the Angular side.
 */
import { Injectable, inject }           from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { map, switchMap, catchError, take } from 'rxjs/operators';
import { SupabaseService }              from './supabase.service';
import { AuthService }                  from './auth.service';
import { ToastService }                 from './toast.service';
import {
  UserProgressWithTechnology,
} from '../../shared/models/user-progress.model';
import {
  TechnicalScoreWithTechnology,
} from '../../shared/models/technical-score.model';

/** Human-readable labels for each scoring breakdown category. */
const AREA_LABELS: Record<string, string> = {
  concepts:        'Conceptos',
  problem_solving: 'Resolución de problemas',
  clean_code:      'Código limpio',
  performance:     'Performance',
};

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly toast    = inject(ToastService);

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Retrieve all per-technology progress rows for the authenticated user
   * via the `get_user_progress_with_technology` RPC.
   *
   * @returns Observable<UserProgressWithTechnology[]> sorted by xp_points desc
   */
  getUserProgress(): Observable<UserProgressWithTechnology[]> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        return from(
          this.supabase.client
            .from('user_progress')
            .select(`
              *,
              technology:technologies (
                name
              )
            `)
            .eq('user_id', user.id)
            .order('xp_points', { ascending: false })
        );
      }),
      map(({ data, error }: { data: any[] | null; error: any }) => {
        if (error) throw new Error(error.message);
        // Flatten nested technology object into the expected flat shape
        return (data ?? []).map((row) => ({
          ...row,
          technology_name:     row.technology?.name ?? '',
          technology_slug:     '',
          technology_icon_url: null,
        })) as UserProgressWithTechnology[];
      }),
      catchError((err: Error) => {
        // Silently return empty when the table doesn't exist yet (migration pending)
        if (err.message?.includes('schema cache') || err.message?.includes('does not exist')) {
          return [[] as UserProgressWithTechnology[]];
        }
        this.toast.error('Error al cargar tu progreso', err.message);
        return [[] as UserProgressWithTechnology[]];
      })
    );
  }

  /**
   * Returns the highest `streak_days` across all technologies.
   * Suitable for the global "current streak" dashboard widget.
   *
   * @returns Observable<number> — 0 if no progress exists
   */
  getTotalStreak(): Observable<number> {
    return this.getUserProgress().pipe(
      map((progress) =>
        progress.reduce((max, row) => Math.max(max, row.streak_days), 0)
      ),
      catchError(() => [0])
    );
  }

  // ─── Static helpers ────────────────────────────────────────────────────────

  /**
   * Derives a single adaptive practice recommendation from the provided
   * technical scores array.
   *
   * Algorithm:
   *  1. Filter scores that have a weakest_area set.
   *  2. Sort by average_score ascending (worst performer first).
   *  3. Return a sentence for the technology with the most room for improvement.
   *
   * @param scores  Latest TechnicalScoreWithTechnology[] from ScoreService
   * @returns A recommendation string, or null if insufficient data
   */
  generateAdaptiveTip(scores: TechnicalScoreWithTechnology[]): string | null {
    const withWeakness = scores
      .filter((s) => s.weakest_area !== null)
      .sort((a, b) => a.average_score - b.average_score);

    if (withWeakness.length === 0) return null;

    const worst      = withWeakness[0];
    const areaLabel  = AREA_LABELS[worst.weakest_area!] ?? worst.weakest_area;
    const techName   = worst.technology?.name ?? 'esa tecnología';
    const score      = Math.round(worst.average_score);

    return `Tu punto débil es ${areaLabel} en ${techName} (promedio ${score}%). ` +
      `Practica simulaciones de nivel ${this._nextDifficulty(worst.average_score)} para mejorar.`;
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _nextDifficulty(avgScore: number): string {
    if (avgScore >= 75) return 'Senior';
    if (avgScore >= 50) return 'Mid';
    return 'Junior';
  }
}
