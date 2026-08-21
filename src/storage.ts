import type { RateUnit } from './calculations';

export interface Coordinate {
  lat: number;
  lng: number;
}

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
  notes: string;
  coordinates: Coordinate[];
}

const STORAGE_KEY = 'happy-soils-maps.plans.v1';

export function loadPlans(): SavedPlan[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map((item) => ({
        ...item,
        propertyName: typeof item.propertyName === 'string' ? item.propertyName : '',
        streetAddress: typeof item.streetAddress === 'string' ? item.streetAddress : '',
        locality: typeof item.locality === 'string' ? item.locality : '',
        state: typeof item.state === 'string' ? item.state : '',
        postcode: typeof item.postcode === 'string' ? item.postcode : '',
      } as SavedPlan));
  } catch {
    return [];
  }
}

export function storePlans(plans: SavedPlan[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}
