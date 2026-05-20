/**
 * @file plans.component.ts
 * @description Professional subscription pricing page.
 *
 * Shows:
 *  - Current subscription status card (plan, quota used, progress bar)
 *  - 3 plan cards (Free / Pro / Elite) with pricing and feature list
 *  - Feature comparison table
 */
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule }     from '@angular/common';
import { RouterModule }     from '@angular/router';
import { PlansService }     from '../../core/services/plans.service';
import { ToastService }     from '../../core/services/toast.service';
import {
  SubscriptionPlan,
  ActiveSubscription,
  PlanFeature,
  PlanSlug,
  PLAN_DISPLAY_META,
  FEATURE_LABELS,
} from '../../shared/models/plan.model';

@Component({
  selector: 'app-plans',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './plans.component.html',
  styleUrl:    './plans.component.css',
})
export class PlansComponent implements OnInit {
  private readonly plansSvc = inject(PlansService);
  private readonly toastSvc = inject(ToastService);

  // -- Signals ----------------------------------------------------------------
  readonly plans        = signal<SubscriptionPlan[]>([]);
  readonly activeSub    = signal<ActiveSubscription | null>(null);
  readonly loadingPlans = signal(true);
  readonly loadingSub   = signal(true);

  // -- Derived ----------------------------------------------------------------
  readonly usagePct = computed(() => {
    const sub = this.activeSub();
    return sub ? this.plansSvc.getSimulationUsagePct(sub) : 0;
  });

  readonly remaining = computed(() => {
    const sub = this.activeSub();
    return sub ? this.plansSvc.getRemainingSimulations(sub) : null;
  });

  // -- Expose constants for template ------------------------------------------
  readonly PLAN_DISPLAY_META = PLAN_DISPLAY_META;
  readonly FEATURE_LABELS    = FEATURE_LABELS;
  readonly FEATURES: PlanFeature[] = [
    'certification_access',
    'adaptive_ai_access',
    'public_profile_access',
    'pdf_reports_access',
    'extended_feedback_access',
  ];

  // -- Lifecycle --------------------------------------------------------------
  ngOnInit(): void {
    this.plansSvc.getAllPlans().subscribe({
      next:  (data) => { this.plans.set(data); this.loadingPlans.set(false); },
      error: ()     => this.loadingPlans.set(false),
    });

    this.plansSvc.getActiveSubscription().subscribe({
      next:  (sub) => { this.activeSub.set(sub); this.loadingSub.set(false); },
      error: ()    => this.loadingSub.set(false),
    });
  }

  // -- Template helpers -------------------------------------------------------
  isCurrentPlan(slug: PlanSlug): boolean {
    return this.activeSub()?.plan_slug === slug;
  }

  hasFeature(plan: SubscriptionPlan, feature: PlanFeature): boolean {
    return plan[feature] === true;
  }

  formatPrice(plan: SubscriptionPlan): string {
    return plan.monthly_price === 0 ? 'Gratis' : `$${plan.monthly_price}/mes`;
  }

  formatQuota(plan: SubscriptionPlan): string {
    if (plan.simulations_per_month === null) return 'Ilimitadas';
    return `${plan.simulations_per_month} / mes`;
  }

  formatTechs(plan: SubscriptionPlan): string {
    if (plan.max_technologies === null) return 'Todas';
    return `${plan.max_technologies} tecnologias`;
  }

  requestUpgrade(plan: SubscriptionPlan): void {
    if (plan.slug === 'elite') {
      this.toastSvc.info('Proximamente', 'El plan Elite estara disponible pronto. Contacta soporte para mas informacion.');
      return;
    }
    this.toastSvc.info('Actualizar plan', `Para activar ${plan.name}, contacta soporte o espera la integracion de pagos.`);
  }

  getCtaLabel(plan: SubscriptionPlan): string {
    if (this.isCurrentPlan(plan.slug)) return 'Plan actual';
    return PLAN_DISPLAY_META[plan.slug].ctaLabel;
  }

  isCtaDisabled(plan: SubscriptionPlan): boolean {
    return this.isCurrentPlan(plan.slug) || PLAN_DISPLAY_META[plan.slug].comingSoon;
  }
}
