/**
 * @file plans.service.ts
 * @description Domain service for querying the `plans` table.
 *
 * Responsibilities
 * ─────────────────
 *  - getAllPlans()     → full catalogue for the pricing page
 *  - getPlanById(id)  → single plan lookup by UUID
 *
 * This service is read-only; plan assignment happens via Stripe webhooks
 * that update the profiles.plan_id column server-side.
 */
import { Injectable, inject }   from '@angular/core';
import { from, Observable }     from 'rxjs';
import { map, catchError }      from 'rxjs/operators';
import { throwError }           from 'rxjs';
import { SupabaseService }      from './supabase.service';
import { ToastService }         from './toast.service';
import { Plan }                 from '../../shared/models/plan.model';

@Injectable({ providedIn: 'root' })
export class PlansService {
  private readonly supabase = inject(SupabaseService);
  private readonly toast    = inject(ToastService);

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Retrieve all active plans ordered by price ascending.
   * Used on the /plans pricing page.
   *
   * @returns Observable<Plan[]>
   */
  getAllPlans(): Observable<Plan[]> {
    return from(
      this.supabase.client
        .from('plans')
        .select('*')
        .order('price_monthly', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as Plan[];
      }),
      catchError((err) => {
        this.toast.error('Error al cargar planes', err.message);
        return throwError(() => err);
      })
    );
  }

  /**
   * Retrieve a single plan by its UUID.
   *
   * @param id UUID of the plan
   * @returns Observable<Plan>
   */
  getPlanById(id: string): Observable<Plan> {
    return from(
      this.supabase.client
        .from('plans')
        .select('*')
        .eq('id', id)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data as Plan;
      }),
      catchError((err) => {
        this.toast.error('Error al cargar plan', err.message);
        return throwError(() => err);
      })
    );
  }
}
