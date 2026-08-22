import { describe, expect, it } from 'vitest';
import { filterPlans, summarisePlans } from '../src/dashboard';
import type { SavedPlan } from '../src/storage';

const plan = (overrides: Partial<SavedPlan>): SavedPlan => ({
  id: crypto.randomUUID(),
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
  paddockName: 'North flats',
  propertyName: 'Gumtree Farm',
  streetAddress: '',
  locality: 'Griffith',
  state: 'NSW',
  postcode: '2680',
  region: 'Riverina',
  farmingSystem: 'Broadacre',
  productName: 'Label-approved input',
  areaHa: 20,
  ratePerHa: 1,
  rateUnit: 'L/ha',
  applications: 1,
  allowancePercent: 3,
  packSize: 20,
  costPerPack: 0,
  waterRateLHa: 0,
  tankCapacityL: 0,
  scheduledDate: '',
  status: 'draft',
  notes: '',
  coordinates: [],
  ...overrides,
});

describe('plan dashboard', () => {
  it('summarises area, state and scheduled work', () => {
    const summary = summarisePlans([
      plan({ status: 'draft', areaHa: 20 }),
      plan({ status: 'ready', areaHa: 30, scheduledDate: '2026-09-01' }),
      plan({ status: 'completed', areaHa: 10, scheduledDate: '2026-08-01' }),
    ]);

    expect(summary.totalPlans).toBe(3);
    expect(summary.totalAreaHa).toBe(60);
    expect(summary.draftPlans).toBe(1);
    expect(summary.readyPlans).toBe(1);
    expect(summary.completedPlans).toBe(1);
    expect(summary.scheduledPlans).toBe(1);
  });

  it('filters across plan details and status', () => {
    const plans = [
      plan({ paddockName: 'North flats', status: 'ready' }),
      plan({ paddockName: 'South hill', productName: 'Granular input', status: 'draft' }),
    ];

    expect(filterPlans(plans, 'granular', 'all')).toHaveLength(1);
    expect(filterPlans(plans, '', 'ready')).toHaveLength(1);
    expect(filterPlans(plans, 'south', 'ready')).toHaveLength(0);
  });
});
