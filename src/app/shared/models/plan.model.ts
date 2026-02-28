/**
 * @file plan.model.ts
 * @description Subscription plan models — placeholder for Phase 2.
 */

export type PlanId = 'free' | 'pro' | 'enterprise';

export interface Plan {
  id:          PlanId;
  name:        string;
  priceMonthly: number;
  priceYearly:  number;
  features:    string[];
  isFeatured?: boolean;
}
