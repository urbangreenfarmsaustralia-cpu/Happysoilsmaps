import type { PlanStatus, SavedPlan } from './storage';

export interface PlanSummary {
  totalPlans: number;
  totalAreaHa: number;
  draftPlans: number;
  readyPlans: number;
  completedPlans: number;
  scheduledPlans: number;
}

export function summarisePlans(plans: SavedPlan[]): PlanSummary {
  return plans.reduce<PlanSummary>((summary, plan) => ({
    totalPlans: summary.totalPlans + 1,
    totalAreaHa: summary.totalAreaHa + Math.max(0, plan.areaHa),
    draftPlans: summary.draftPlans + (plan.status === 'draft' ? 1 : 0),
    readyPlans: summary.readyPlans + (plan.status === 'ready' ? 1 : 0),
    completedPlans: summary.completedPlans + (plan.status === 'completed' ? 1 : 0),
    scheduledPlans: summary.scheduledPlans + (plan.scheduledDate && plan.status !== 'completed' ? 1 : 0),
  }), {
    totalPlans: 0,
    totalAreaHa: 0,
    draftPlans: 0,
    readyPlans: 0,
    completedPlans: 0,
    scheduledPlans: 0,
  });
}

export function filterPlans(plans: SavedPlan[], query: string, status: PlanStatus | 'all'): SavedPlan[] {
  const normalisedQuery = query.trim().toLocaleLowerCase('en-AU');
  return plans.filter((plan) => {
    if (status !== 'all' && plan.status !== status) return false;
    if (!normalisedQuery) return true;
    return [
      plan.paddockName,
      plan.propertyName,
      plan.locality,
      plan.region,
      plan.productName,
    ].some((value) => value.toLocaleLowerCase('en-AU').includes(normalisedQuery));
  });
}
