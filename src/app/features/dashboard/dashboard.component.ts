/**
 * @file dashboard.component.ts
 * @description Main authenticated landing page — Phase 5 gamification version.
 *
 * Streams consumed:
 *  1. currentUser           — auth identity
 *  2. profileWithPlan       — plan slug, name, limits + XP + rank title
 *  3. attemptsThisMonth     — integer counter for usage widget
 *  4. recentAttempts        — last 5, joined with simulation title
 *  5. technicalScores       — per-technology avg + level_estimated + weakest_area
 *  6. scoreEvolution        — ordered weighted_score points for mini-chart
 *  7. breakdownAverages     — average per scoring category
 *  8. userProgress          — per-technology XP, streak, best_score
 *  9. certificates          — earned certificates with technology metadata
 *
 * ALL data comes from domain services.  Zero direct Supabase calls here.
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

import { AuthService }                 from '../../core/services/auth.service';
import { ScoreService, BreakdownAverages } from '../../core/services/score.service';

import { AppUser, UserRole }            from '../../core/models/user.model';
import { ProfileWithPlan }              from '../../shared/models/profile.model';
import { AttemptWithSimulation, AttemptScorePoint } from '../../shared/models/simulation-attempt.model';
import {
  TechnicalScoreWithTechnology,
  LEVEL_META,
  LevelEstimate,
} from '../../shared/models/technical-score.model';
import {
  UserProgressWithTechnology,
  RankTitle,
  RANK_META,
  getRankTitle,
  xpToNextRank,
} from '../../shared/models/user-progress.model';
import {
  CertificateWithTechnology,
  CERTIFICATE_META,
} from '../../shared/models/certificate.model';

/** Aggregated view-model handed to the template. */
export interface DashboardVM {
  user:               AppUser;
  profile:            ProfileWithPlan;
  attemptsThisMonth:  number;
  recentAttempts:     AttemptWithSimulation[];
  technicalScores:    TechnicalScoreWithTechnology[];
  scoreEvolution:     AttemptScorePoint[];
  breakdownAverages:  BreakdownAverages;
  userProgress:       UserProgressWithTechnology[];
  certificates:       CertificateWithTechnology[];
  /** 0–100 percentage for the usage progress bar */
  usagePercent:       number;
  /** Human-readable plan limit label e.g. "5 / 10" or "5 / ∞" */
  usageLabel:         string;
  /** Adaptive recommendation derived from weakest_area */
  adaptiveTip:        string | null;
  /** Highest streak across all technologies */
  currentStreak:      number;
  /** XP needed to reach the next global rank */
  xpToNextRank:       number;
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

  private readonly auth = inject(AuthService);

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  private readonly _destroy$ = new Subject<void>();

  /** Reactive view-model emitted once all streams resolve. */
  readonly vm$!: Observable<DashboardVM>;

  isLoading = true;
  loadError: string | null = null;

  // Expose metadata constants to the template
  readonly levelMeta       = LEVEL_META;
  readonly rankMeta        = RANK_META;
  readonly certificateMeta = CERTIFICATE_META;

  // ─── Initialisation ───────────────────────────────────────────────────────

  ngOnInit(): void {
    // Mock data for local development — no Supabase calls
    const mockUser: AppUser = {
      id: 'local-user-1',
      email: 'admin@local.test',
      fullName: 'Admin Local',
      avatarUrl: '',
      role: UserRole.CANDIDATE,
      createdAt: new Date().toISOString(),
    };

    const mockProfile: ProfileWithPlan = {
      id: 'local-user-1',
      full_name: 'Admin Local',
      avatar_url: null,
      plan_id: 'free-plan',
      created_at: new Date().toISOString(),
      total_xp: 3500,
      global_rank_title: 'Challenger',
      updated_at: new Date().toISOString(),
      plan: {
        id: 'free-plan',
        slug: 'free' as const,
        name: 'Free Plan',
        price_monthly: 0,
        price_yearly: 0,
        max_simulations_per_month: 5,
        features: [],
        is_featured: false,
        created_at: new Date().toISOString(),
      },
    };

    const mockRecentAttempts: AttemptWithSimulation[] = [
      {
        id: 'attempt-1',
        user_id: 'local-user-1',
        simulation_id: 'sim-1',
        score: 78,
        breakdown: { concepts: 80, problem_solving: 75, clean_code: 82, performance: 70 },
        weighted_score: 78.5,
        status: 'completed',
        answers: [],
        started_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        technology_id: 'tech-1',
        simulation_title: 'TypeScript Generics Challenge',
      } as any,
      {
        id: 'attempt-2',
        user_id: 'local-user-1',
        simulation_id: 'sim-2',
        score: 85,
        breakdown: { concepts: 88, problem_solving: 87, clean_code: 82, performance: 83 },
        weighted_score: 85.0,
        status: 'completed',
        answers: [],
        started_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        completed_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        technology_id: 'tech-2',
        simulation_title: 'React Hooks Deep Dive',
      } as any,
    ];

    const mockTechnicalScores: TechnicalScoreWithTechnology[] = [
      {
        id: 'score-1',
        user_id: 'local-user-1',
        technology_id: 'tech-1',
        average_score: 78.5,
        attempt_count: 5,
        level_estimated: 'junior' as LevelEstimate,
        weakest_area: 'performance',
        updated_at: new Date().toISOString(),
        technology: { id: 'tech-1', name: 'TypeScript', slug: 'typescript', color: '#3178c6' } as any,
      } as any,
      {
        id: 'score-2',
        user_id: 'local-user-1',
        technology_id: 'tech-2',
        average_score: 82.0,
        attempt_count: 3,
        level_estimated: 'mid' as LevelEstimate,
        weakest_area: 'concepts',
        updated_at: new Date().toISOString(),
        technology: { id: 'tech-2', name: 'React', slug: 'react', color: '#61dafb' } as any,
      } as any,
    ];

    const mockScoreEvolution: AttemptScorePoint[] = [
      { completed_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), weighted_score: 70.0, title: 'TypeScript Basics', level: 'beginner' },
      { completed_at: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(), weighted_score: 72.5, title: 'TypeScript Advanced', level: 'junior' },
      { completed_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(), weighted_score: 75.0, title: 'React Hooks', level: 'junior' },
      { completed_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(), weighted_score: 78.5, title: 'React Performance', level: 'mid' },
    ];

    const mockBreakdownAverages: BreakdownAverages = {
      concepts: 81,
      problem_solving: 79,
      clean_code: 77,
      performance: 72,
    };

    const mockUserProgress: UserProgressWithTechnology[] = [
      {
        id: 'progress-1',
        user_id: 'local-user-1',
        technology_id: 'tech-1',
        total_xp: 1500,
        streak_days: 7,
        best_score: 92,
        updated_at: new Date().toISOString(),
        technology: { id: 'tech-1', name: 'TypeScript', slug: 'typescript', color: '#3178c6' } as any,
      } as any,
      {
        id: 'progress-2',
        user_id: 'local-user-1',
        technology_id: 'tech-2',
        total_xp: 2000,
        streak_days: 5,
        best_score: 95,
        updated_at: new Date().toISOString(),
        technology: { id: 'tech-2', name: 'React', slug: 'react', color: '#61dafb' } as any,
      } as any,
    ];

    const mockCertificates: CertificateWithTechnology[] = [
      {
        id: 'cert-1',
        user_id: 'local-user-1',
        technology_id: 'tech-1',
        issued_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: new Date(Date.now() + 300 * 24 * 60 * 60 * 1000).toISOString(),
        technology: { id: 'tech-1', name: 'TypeScript', slug: 'typescript', color: '#3178c6' } as any,
      } as any,
    ];

    (this as { vm$: Observable<DashboardVM> }).vm$ = combineLatest([
      of(mockUser),
      of(mockProfile),
      of(2), // attemptsThisMonth
      of(mockRecentAttempts),
      of(mockTechnicalScores),
      of(mockScoreEvolution),
      of(mockBreakdownAverages),
      of(mockUserProgress),
      of(mockCertificates),
    ]).pipe(
      map(([
        user, profile, attemptsThisMonth,
        recentAttempts, technicalScores,
        scoreEvolution, breakdownAverages,
        userProgress, certificates,
      ]) => {
        if (!user) throw new Error('No authenticated user');

        const limit        = profile.plan.max_simulations_per_month;
        const usagePercent = limit
          ? Math.min(100, Math.round((attemptsThisMonth / limit) * 100))
          : 0;
        const usageLabel   = limit
          ? `${attemptsThisMonth} / ${limit}`
          : `${attemptsThisMonth} / ∞`;

        const currentStreak = (userProgress as UserProgressWithTechnology[])
          .reduce((max, row) => Math.max(max, row.streak_days), 0);

        const adaptiveTip = 'Mejora tu performance en TypeScript — estás en un buen camino.';

        const totalXp = (profile as ProfileWithPlan).total_xp ?? 0;

        return {
          user, profile,
          attemptsThisMonth,
          recentAttempts,
          technicalScores,
          scoreEvolution,
          breakdownAverages,
          userProgress,
          certificates,
          usagePercent,
          usageLabel,
          adaptiveTip,
          currentStreak,
          xpToNextRank: xpToNextRank(totalXp),
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

    this.vm$.pipe(takeUntil(this._destroy$)).subscribe(() => {
      this.isLoading = false;
    });
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }

  // ─── Template helpers ─────────────────────────────────────────────────────

  usageBarClass(percent: number): string {
    if (percent >= 90) return 'usage-bar--danger';
    if (percent >= 70) return 'usage-bar--warning';
    return 'usage-bar--ok';
  }

  formatScore(score: number | null | undefined): string {
    return score != null ? `${Math.round(score)}%` : '—';
  }

  /** Normalise a score to a 0–100 value for bar height. */
  evolutionBarHeight(score: number, allScores: AttemptScorePoint[]): number {
    const max = Math.max(...allScores.map((p) => p.weighted_score), 1);
    return Math.round((score / max) * 100);
  }

  /** Display label for a level badge. */
  levelLabel(level: LevelEstimate | null): string {
    if (!level) return '—';
    return LEVEL_META[level]?.label ?? level;
  }

  levelColor(level: LevelEstimate | null): string {
    if (!level) return '#94a3b8';
    return LEVEL_META[level]?.color ?? '#94a3b8';
  }

  /** XP bar percentage toward the next rank. */
  xpBarPercent(profile: ProfileWithPlan): number {
    const xp = profile.total_xp ?? 0;
    const rank = getRankTitle(xp);
    const meta = RANK_META[rank];
    const next = RANK_META[this._nextRank(rank)];
    if (!next) return 100; // Elite — fully filled
    const range = next.minXp - meta.minXp;
    return Math.round(((xp - meta.minXp) / range) * 100);
  }

  rankColor(rankTitle: string): string {
    return RANK_META[rankTitle as RankTitle]?.color ?? '#94a3b8';
  }

  rankDescription(rankTitle: string): string {
    return RANK_META[rankTitle as RankTitle]?.description ?? '';
  }

  certLevelLabel(level: string): string {
    return CERTIFICATE_META[level as 'mid' | 'senior']?.label ?? level;
  }

  certColor(level: string): string {
    return CERTIFICATE_META[level as 'mid' | 'senior']?.color ?? '#94a3b8';
  }

  private _nextRank(current: RankTitle): RankTitle {
    const order: RankTitle[] = ['Rookie', 'Explorer', 'Challenger', 'Elite'];
    const idx = order.indexOf(current);
    return order[Math.min(idx + 1, order.length - 1)];
  }
}

