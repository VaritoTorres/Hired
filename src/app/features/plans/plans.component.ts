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
  private readonly toastSvc = inject(ToastService);

  // -- Signals ----------------------------------------------------------------
  readonly plans        = signal<SubscriptionPlan[]>([]);
  readonly activeSub    = signal<ActiveSubscription | null>(null);
  readonly loadingPlans = signal(true);
  readonly loadingSub   = signal(true);

  // -- Derived ----------------------------------------------------------------
  readonly usagePct = computed(() => {
    const sub = this.activeSub();
    if (!sub || !sub.simulations_per_month) return 0;
    return Math.min(100, Math.round((sub.simulations_used_this_month / sub.simulations_per_month) * 100));
  });

  readonly remaining = computed(() => {
    const sub = this.activeSub();
    if (!sub || !sub.simulations_per_month) return null;
    return Math.max(0, sub.simulations_per_month - sub.simulations_used_this_month);
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
    // Mock data for local development — no Supabase calls
    const mockPlans: SubscriptionPlan[] = [
      {
        id: 'free-plan-1',
        slug: 'free',
        name: 'Gratuito',
        description: 'Perfecto para comenzar',
        monthly_price: 0,
        simulations_per_month: 3,
        max_technologies: null,
        certification_access: false,
        adaptive_ai_access: false,
        public_profile_access: false,
        pdf_reports_access: false,
        extended_feedback_access: false,
        is_featured: false,
        badge_label: null,
        sort_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'student-plan-1',
        slug: 'pro',
        name: 'Estudiante',
        description: 'Para estudiantes verificados',
        monthly_price: 0,
        simulations_per_month: 20,
        max_technologies: null,
        certification_access: true,
        adaptive_ai_access: true,
        public_profile_access: false,
        pdf_reports_access: true,
        extended_feedback_access: true,
        is_featured: false,
        badge_label: 'Verificación requerida',
        sort_order: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'premium-plan-1',
        slug: 'elite',
        name: 'Premium',
        description: 'Acceso completo',
        monthly_price: 300,
        simulations_per_month: null, // unlimited
        max_technologies: null, // unlimited
        certification_access: true,
        adaptive_ai_access: true,
        public_profile_access: true,
        pdf_reports_access: true,
        extended_feedback_access: true,
        is_featured: true,
        badge_label: 'Recomendado',
        sort_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const mockActiveSub: ActiveSubscription = {
      subscription_id: 'sub-1',
      plan_id: 'free-plan-1',
      plan_slug: 'free',
      plan_name: 'Gratuito',
      monthly_price: 0,
      simulations_per_month: 3,
      simulations_used_this_month: 1,
      max_technologies: null,
      certification_access: false,
      adaptive_ai_access: false,
      public_profile_access: false,
      pdf_reports_access: false,
      extended_feedback_access: false,
      status: 'active',
      started_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: null,
    };

    this.plans.set(mockPlans);
    this.loadingPlans.set(false);

    this.activeSub.set(mockActiveSub);
    this.loadingSub.set(false);
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
    if (plan.slug === 'pro') {
      this.toastSvc.info('Verificación de estudiante', 'Por favor verifica tu email institucional (.edu) para acceder al plan Estudiante.');
      return;
    }
    if (plan.slug === 'elite') {
      this.toastSvc.info('Plan Premium', 'El pago de $300 MXN estará disponible pronto. Contacta soporte para más información.');
      return;
    }
    this.toastSvc.info('Actualizar plan', `Ya tienes acceso a ${plan.name}.`);
  }

  getCtaLabel(plan: SubscriptionPlan): string {
    if (this.isCurrentPlan(plan.slug)) return 'Plan actual';
    if (plan.slug === 'pro') return 'Verificar como estudiante';
    if (plan.slug === 'elite') return 'Suscribirse ($300 MXN/mes)';
    return 'Seleccionar plan';
  }

  isCtaDisabled(plan: SubscriptionPlan): boolean {
    // Only disable the CTA for the current plan
    return this.isCurrentPlan(plan.slug);
  }
}
