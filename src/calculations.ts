import area from '@turf/area';
import { polygon } from '@turf/helpers';

export type RateUnit = 'L/ha' | 'mL/ha' | 'kg/ha' | 'g/ha';
export type BaseUnit = 'L' | 'kg';

export interface ApplicationInputs {
  areaHa: number;
  ratePerHa: number;
  rateUnit: RateUnit;
  applications: number;
  allowancePercent: number;
  packSize: number;
}

export interface ApplicationResult {
  baseUnit: BaseUnit;
  quantityPerApplication: number;
  totalQuantity: number;
  allowanceQuantity: number;
  packsRequired: number | null;
}

const toBaseRate = (rate: number, unit: RateUnit): { rate: number; unit: BaseUnit } => {
  if (unit === 'mL/ha') return { rate: rate / 1000, unit: 'L' };
  if (unit === 'g/ha') return { rate: rate / 1000, unit: 'kg' };
  return { rate, unit: unit === 'L/ha' ? 'L' : 'kg' };
};

const ensureNonNegative = (value: number, label: string): void => {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
};

export function calculateApplication(inputs: ApplicationInputs): ApplicationResult {
  ensureNonNegative(inputs.areaHa, 'Area');
  ensureNonNegative(inputs.ratePerHa, 'Rate');
  ensureNonNegative(inputs.allowancePercent, 'Allowance');
  ensureNonNegative(inputs.packSize, 'Pack size');

  if (!Number.isInteger(inputs.applications) || inputs.applications < 1) {
    throw new Error('Applications must be a whole number of at least one.');
  }

  const converted = toBaseRate(inputs.ratePerHa, inputs.rateUnit);
  const quantityPerApplication = inputs.areaHa * converted.rate;
  const scheduledQuantity = quantityPerApplication * inputs.applications;
  const allowanceQuantity = scheduledQuantity * (inputs.allowancePercent / 100);
  const totalQuantity = scheduledQuantity + allowanceQuantity;

  return {
    baseUnit: converted.unit,
    quantityPerApplication,
    totalQuantity,
    allowanceQuantity,
    packsRequired: inputs.packSize > 0 ? Math.ceil(totalQuantity / inputs.packSize) : null,
  };
}

export function polygonAreaHectares(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 3) return 0;
  const first = coordinates[0];
  if (!first) return 0;
  const ring = [...coordinates, first];
  return area(polygon([ring])) / 10_000;
}

export function formatQuantity(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-AU', {
    maximumFractionDigits,
  }).format(value);
}

export function isAustralianPostcode(value: string): boolean {
  return value === '' || /^\d{4}$/.test(value);
}
