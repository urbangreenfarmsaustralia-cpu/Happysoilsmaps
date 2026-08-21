import { describe, expect, it } from 'vitest';
import { createPlanCsv } from '../src/export';
import type { SavedPlan } from '../src/storage';

describe('createPlanCsv', () => {
  it('includes the structured property address and estimate', () => {
    const plan: SavedPlan = {
      id: 'plan-1',
      createdAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T00:00:00.000Z',
      paddockName: 'North flats',
      propertyName: 'Gumtree Farm',
      streetAddress: '125 Example Road',
      locality: 'Griffith',
      state: 'NSW',
      postcode: '2680',
      region: 'Riverina',
      farmingSystem: 'Pasture & livestock',
      productName: 'Label-approved input',
      areaHa: 20,
      ratePerHa: 2.5,
      rateUnit: 'L/ha',
      applications: 1,
      allowancePercent: 3,
      packSize: 20,
      notes: '',
      coordinates: [],
    };

    const csv = createPlanCsv(plan, {
      baseUnit: 'L',
      quantityPerApplication: 50,
      allowanceQuantity: 1.5,
      totalQuantity: 51.5,
      packsRequired: 3,
    });

    expect(csv).toContain('"Property or farm","Gumtree Farm"');
    expect(csv).toContain('"Street or rural address","125 Example Road"');
    expect(csv).toContain('"Locality or town","Griffith"');
    expect(csv).toContain('"State","NSW"');
    expect(csv).toContain('"Postcode","2680"');
    expect(csv).toContain('"Total quantity (L)","51.5"');
  });
});
