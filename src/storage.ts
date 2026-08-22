import type { RateUnit } from './calculations';

export interface Coordinate {
  lat: number;
  lng: number;
}

export type PlanStatus = 'draft' | 'ready' | 'completed';

export interface SavedPlan {
  id: string;
  createdAt: string;
  updatedAt: string;
  paddockName: string;
  propertyName: string;
  streetAddress: string;
  locality: string;
  state: string;
  postcode: string;
  region: string;
  farmingSystem: string;
  productName: string;
  areaHa: number;
  ratePerHa: number;
  rateUnit: RateUnit;
  applications: number;
  allowancePercent: number;
  packSize: number;
  costPerPack: number;
  waterRateLHa: number;
  tankCapacityL: number;
  scheduledDate: string;
  status: PlanStatus;
  notes: string;
  coordinates: Coordinate[];
}

const STORAGE_KEY = 'happy-soils-maps.plans.v1';

const stringValue = (value: unknown): string => typeof value === 'string' ? value : '';
const numberValue = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : 0;

export function normalisePlan(value: unknown): SavedPlan | null {
  if (value === null || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const rateUnit: RateUnit = item.rateUnit === 'mL/ha' || item.rateUnit === 'kg/ha' || item.rateUnit === 'g/ha'
    ? item.rateUnit
    : 'L/ha';
  const status: PlanStatus = item.status === 'ready' || item.status === 'completed' ? item.status : 'draft';
  const coordinates = Array.isArray(item.coordinates)
    ? item.coordinates.flatMap((coordinate) => {
      if (coordinate === null || typeof coordinate !== 'object') return [];
      const point = coordinate as Record<string, unknown>;
      if (typeof point.lat !== 'number' || typeof point.lng !== 'number') return [];
      return Number.isFinite(point.lat) && Number.isFinite(point.lng)
        ? [{ lat: point.lat, lng: point.lng }]
        : [];
    })
    : [];

  return {
    id: stringValue(item.id) || crypto.randomUUID(),
    createdAt: stringValue(item.createdAt) || new Date().toISOString(),
    updatedAt: stringValue(item.updatedAt) || new Date().toISOString(),
    paddockName: stringValue(item.paddockName),
    propertyName: stringValue(item.propertyName),
    streetAddress: stringValue(item.streetAddress),
    locality: stringValue(item.locality),
    state: stringValue(item.state),
    postcode: stringValue(item.postcode),
    region: stringValue(item.region),
    farmingSystem: stringValue(item.farmingSystem) || 'Pasture & livestock',
    productName: stringValue(item.productName),
    areaHa: numberValue(item.areaHa),
    ratePerHa: numberValue(item.ratePerHa),
    rateUnit,
    applications: Math.max(1, Math.trunc(numberValue(item.applications) || 1)),
    allowancePercent: numberValue(item.allowancePercent),
    packSize: numberValue(item.packSize),
    costPerPack: numberValue(item.costPerPack),
    waterRateLHa: numberValue(item.waterRateLHa),
    tankCapacityL: numberValue(item.tankCapacityL),
    scheduledDate: stringValue(item.scheduledDate),
    status,
    notes: stringValue(item.notes),
    coordinates,
  };
}

export function loadPlans(): SavedPlan[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item) => {
      const plan = normalisePlan(item);
      return plan ? [plan] : [];
    });
  } catch {
    return [];
  }
}

export function storePlans(plans: SavedPlan[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}
