/**
 * @file weakness.service.ts
 * @description Domain service for the Adaptive AI — Diagnostic Intelligence layer.
 *
 * Responsibilities
 * ─────────────────
 *  - getCompetenceMap()       → full concept weakness map for the current user
 *  - getWeakConcepts()        → Débil-only subset for alert/highlight use
 *  - getStagnatingConcepts()  → client-side filter from the full map
 *  - groupByTechnology()      → reshapes flat RPC results into grouped display model
 *
 * ALL metric updates happen server-side via the PostgreSQL trigger
 * `trg_concept_metrics_on_attempt` (installed in migration 005).
 * This service is READ-ONLY from the Angular side.
 */
import { Injectable, inject }           from '@angular/core';
import { from, Observable, throwError } from 'rxjs';
import { map, switchMap, catchError, take } from 'rxjs/operators';
import { SupabaseService }              from './supabase.service';
import { AuthService }                  from './auth.service';
import { ToastService }                 from './toast.service';
import {
  CompetenceMapItem,
  TechnologyConceptGroup,
  WeakConceptSummary,
  WEAKNESS_META,
  WeaknessClass,
} from '../../shared/models/concept.model';

@Injectable({ providedIn: 'root' })
export class WeaknessService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth     = inject(AuthService);
  private readonly toast    = inject(ToastService);

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Retrieves the full competence map for the authenticated user.
   * Calls the `get_competence_map(p_user_id)` RPC which returns rows from
   * `v_competence_map` (concepts + metrics + weakness index/class).
   *
   * @returns Observable<CompetenceMapItem[]> ordered by weakness_index DESC
   */
  getCompetenceMap(): Observable<CompetenceMapItem[]> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        return from(
          this.supabase.client.rpc('get_competence_map', { p_user_id: user.id })
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as CompetenceMapItem[];
      }),
      catchError((err: Error) => {
        if (err.message?.includes('schema cache') || err.message?.includes('does not exist') || err.message?.includes('function') || err.message?.includes('could not find')) {
          return [[] as CompetenceMapItem[]];
        }
        this.toast.error('Error al cargar mapa de competencias', err.message);
        return [[] as CompetenceMapItem[]];
      })
    );
  }

  /**
   * Retrieves only Débil concepts (weakness_index ≥ 0.6) for the current user.
   * Suitable for alert banners and prioritised study recommendations.
   *
   * @returns Observable<WeakConceptSummary[]>
   */
  getWeakConcepts(): Observable<WeakConceptSummary[]> {
    return this.auth.getCurrentUser().pipe(
      take(1),
      switchMap((user) => {
        if (!user) return throwError(() => new Error('No authenticated user'));

        return from(
          this.supabase.client.rpc('get_weak_concepts', { p_user_id: user.id })
        );
      }),
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as WeakConceptSummary[];
      }),
      catchError((err: Error) => {
        if (err.message?.includes('schema cache') || err.message?.includes('does not exist') || err.message?.includes('function') || err.message?.includes('could not find')) {
          return [[] as WeakConceptSummary[]];
        }
        this.toast.error('Error al cargar conceptos débiles', err.message);
        return [[] as WeakConceptSummary[]];
      })
    );
  }

  // ─── Client-side helpers ────────────────────────────────────────────────────

  /**
   * Filters a full competence map to concepts with learning_stagnation = true.
   */
  getStagnatingConcepts(map: CompetenceMapItem[]): CompetenceMapItem[] {
    return map.filter((item) => item.learning_stagnation);
  }

  /**
   * Groups a flat CompetenceMapItem array by technology for rendering the map UI.
   * Computes aggregated weak/unstable/dominated counts per group.
   *
   * @param items Flat list from getCompetenceMap()
   * @param filter Optional weakness class filter
   * @returns Array of TechnologyConceptGroup sorted by weak-count desc
   */
  groupByTechnology(
    items: CompetenceMapItem[],
    filter?: WeaknessClass | 'all' | 'stagnating'
  ): TechnologyConceptGroup[] {
    // Apply filter
    const filtered = this.applyFilter(items, filter);

    // Group
    const map = new Map<string, TechnologyConceptGroup>();

    for (const item of filtered) {
      if (!map.has(item.technology_id)) {
        map.set(item.technology_id, {
          technology_id:   item.technology_id,
          technology_name: item.technology_name,
          technology_slug: item.technology_slug,
          technology_icon: item.technology_icon,
          concepts:        [],
          total:           0,
          weak:            0,
          unstable:        0,
          dominated:       0,
        });
      }
      const group = map.get(item.technology_id)!;
      group.concepts.push(item);
      group.total++;
      if (item.weakness_class === 'debil')     group.weak++;
      if (item.weakness_class === 'inestable') group.unstable++;
      if (item.weakness_class === 'dominado')  group.dominated++;
    }

    // Sort: most critical technologies first
    return Array.from(map.values()).sort((a, b) => b.weak - a.weak || b.unstable - a.unstable);
  }

  /**
   * Computes the label for an accuracy rate (0–1 → "XX%") for display.
   */
  formatAccuracy(rate: number): string {
    return `${Math.round(rate * 100)}%`;
  }

  /**
   * Returns the display metadata object for a given weakness class.
   */
  getWeaknessMeta(cls: WeaknessClass) {
    return WEAKNESS_META[cls];
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private applyFilter(
    items: CompetenceMapItem[],
    filter?: WeaknessClass | 'all' | 'stagnating'
  ): CompetenceMapItem[] {
    if (!filter || filter === 'all') return items;
    if (filter === 'stagnating') return items.filter((i) => i.learning_stagnation);
    return items.filter((i) => i.weakness_class === filter);
  }
}
