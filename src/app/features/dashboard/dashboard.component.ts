/**
 * @file dashboard.component.ts
 * @description Main authenticated landing page — Phase 2 dynamic version.
 *
 * Data sourced entirely from Supabase via domain services.
 * No raw DB calls in this component — only service method calls.
 *
 * Displayed data:
 *  - User name and current plan
 *  - Simulations used this month vs plan limit (progress bar)
 *  - Last 5 attempts with score and simulation title
 *  - Average technical score per technology
 */
import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule }                          from '@angular/common';
import { RouterModule }                          from '@angular/router';
import {
  Observable, Subject, combineLatest, of
} from 'rxjs';
import {
  takeUntil, catchError, map, shareReplay
} from 'rxjs/operators';

import { AuthService }       from '../../core/services/auth.service';
import { ProfileService }    from '../../core/services/profile.service';
import { SimulationService } from '../../core/services/simulation.service';
import { ScoreService }      from '../../core/services/score.service';

import { AppUser }                      from '../../core/models/user.model';
import { ProfileWithPlan }              from '../../shared/models/profile.model';
import { AttemptWithSimulation }        from '../../shared/models/simulation-attempt.model';
import { TechnicalScoreWithTechnology } from '../../shared/models/technical-score.model';

/** Aggregated view-model handed to the template. */
export interface DashboardVM {
  user:             AppUser;
  profile:          ProfileWithPlan;
  attemptsThisMonth: number;
  recentAttempts:   AttemptWithSimulation[];
  technicalScores:  TechnicalScoreWithTechnology[];
  /** 0–100 percentage for the usage progress bar */
  usagePercent:     number;
  /** Human-readable plan limit label (e.g. "5 / 10" or "5 / ∞") */
  usageLabel:       string;
}

@Component({
  selector:    'app-dashboard',
  standalone:  true,
  imports:     [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls:   ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit, OnDestroy {
  // ─── Dependencies ─────────────────────────────────────────────────────────

  private readonly auth            = inject(AuthService);
  private readonly profileService  = inject(ProfileService);
  private readonly simulationSvc   = inject(SimulationService);
  private readonly scoreSvc        = inject(ScoreService);

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  private readonly _destroy$ = new Subject<void>();

  /** Reactive view-model emitted once all streams resolve. */
  readonly vm$!: Observable<DashboardVM>;

  /** Loading flag shown while data is being fetched. */
  isLoading = true;

  /** Non-null when the initial data fetch encounters an unrecoverable error. */
  loadError: string | null = null;

  // ─── Initialisation ───────────────────────────────────────────────────────

  ngOnInit(): void {
    // combineLatest waits for ALL streams to emit at least once before
    // rendering — eliminates partial-render flicker.
    (this as { vm$: Observable<DashboardVM> }).vm$ = combineLatest([
      this.auth.getCurrentUser(),
      this.profileService.getUserPlan(),
      this.simulationSvc.countUserAttemptsThisMonth(),
      this.simulationSvc.getUserAttempts().pipe(
        map((attempts) => attempts.slice(0, 5)), // most recent 5
        catchError(() => of([]))
      ),
      this.scoreSvc.getTechnicalScores().pipe(
        catchError(() => of([]))
      ),
    ]).pipe(
      map(([user, profile, attemptsThisMonth, recentAttempts, technicalScores]) => {
        if (!user) throw new Error('No authenticated user');

        const limit       = profile.plan.max_simulations_per_month;
        const usagePercent = limit
          ? Math.min(100, Math.round((attemptsThisMonth / limit) * 100))
          : 0;
        const usageLabel  = limit
          ? `${attemptsThisMonth} / ${limit}`
          : `${attemptsThisMonth} / ∞`;

        return {
          user,
          profile,
          attemptsThisMonth,
          recentAttempts,
          technicalScores,
          usagePercent,
          usageLabel,
        } satisfies DashboardVM;
      }),
      catchError((err) => {
        this.loadError = 'No se pudo cargar el dashboard. Por favor recarga la página.';
        console.error('[DashboardComponent] load error:', err);
        return of(null as unknown as DashboardVM);
      }),
      shareReplay(1),
      takeUntil(this._destroy$)
    ) as Observable<DashboardVM>;

    // Clear loading state once first emission arrives
    this.vm$.pipe(takeUntil(this._destroy$)).subscribe(() => {
      this.isLoading = false;
    });
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }

  // ─── Template helpers ─────────────────────────────────────────────────────

  /** Returns 'low' | 'medium' | 'high' class suffix for the usage bar colour. */
  usageBarClass(percent: number): string {
    if (percent >= 90) return 'usage-bar--danger';
    if (percent >= 70) return 'usage-bar--warning';
    return 'usage-bar--ok';
  }

  /** Format a nullable score as a display string. */
  formatScore(score: number | null): string {
    return score !== null ? `${score}%` : '—';
  }
}
