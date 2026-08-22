import { describe, expect, it } from 'vitest';
import { normalisePlan } from '../src/storage';

describe('normalisePlan', () => {
  it('migrates a phase-one plan into the expanded model', () => {
    const migrated = normalisePlan({
      id: 'legacy-plan',
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T00:00:00.000Z',
      paddockName: 'North flats',
      productName: 'Label-approved input',
      areaHa: 20,
      ratePerHa: 2,
      rateUnit: 'L/ha',
      applications: 1,
      allowancePercent: 3,
      packSize: 20,
      coordinates: [],
    });

    expect(migrated).not.toBeNull();
    expect(migrated?.status).toBe('draft');
    expect(migrated?.scheduledDate).toBe('');
    expect(migrated?.costPerPack).toBe(0);
    expect(migrated?.waterRateLHa).toBe(0);
    expect(migrated?.tankCapacityL).toBe(0);
  });

  it('rejects values that are not plan objects', () => {
    expect(normalisePlan(null)).toBeNull();
    expect(normalisePlan('not a plan')).toBeNull();
  });
});
