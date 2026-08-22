import type { OutcomeRecord } from './intelligence-types';

export function calculateRoiPercent(inputCostAud: number | null, revenueChangeAud: number | null): number | null {
  if (inputCostAud === null || revenueChangeAud === null || inputCostAud <= 0) return null;
  return ((revenueChangeAud - inputCostAud) / inputCostAud) * 100;
}

export function validateOutcome(outcome: OutcomeRecord): string[] {
  const errors: string[] = [];
  if (!outcome.paddockName.trim()) errors.push('Add a paddock name.');
  if (!outcome.treatmentDate) errors.push('Add the treatment date.');
  if (!outcome.crop.trim()) errors.push('Add the crop or pasture.');
  if (!Number.isFinite(outcome.treatmentRate) || outcome.treatmentRate <= 0) errors.push('Add a treatment rate greater than zero.');
  if ((outcome.ndviBefore === null) !== (outcome.ndviAfter === null)) errors.push('Record both before and after NDVI, or leave both blank.');
  return errors;
}
