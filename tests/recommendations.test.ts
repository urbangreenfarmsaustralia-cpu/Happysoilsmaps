import { describe, expect, it } from 'vitest';
import { evaluateRuleSet } from '../src/recommendations';
import type { ProductRuleSet, SoilValue } from '../src/intelligence-types';

const soil: SoilValue[] = [
  { key: 'ph', label: 'pH', value: 5.2, unit: 'pH', source: 'measured', confidence: 0.95 },
  { key: 'organicCarbon', label: 'Organic carbon', value: 1.3, unit: '%', source: 'measured', confidence: 0.95 },
];

describe('recommendation rules', () => {
  it('refuses to recommend from an unapproved ruleset', () => {
    const result = evaluateRuleSet({
      product: 'Activate', version: 'draft', approved: false, approvedBy: null, approvedAt: null, bands: [], exceptionRules: [],
    }, soil, null, null);
    expect(result.status).toBe('not-configured');
    expect(result.band).toBeNull();
  });

  it('preserves rate caps and split logic from an approved matching band', () => {
    const rules: ProductRuleSet = {
      product: 'Energise',
      version: 'approved-1',
      approved: true,
      approvedBy: 'Qualified reviewer',
      approvedAt: '2026-08-21',
      bands: [{
        id: 'low-ph', label: 'Low pH band', when: [{ field: 'ph', operator: 'lt', value: 5.5 }],
        ratePerHa: 2, rateUnit: 'L/ha', maximumPerApplication: 2, maximumPerSeason: 4,
        splitApplications: 2, minimumDaysBetweenApplications: 21, notes: ['Example test fixture only'],
      }],
      exceptionRules: [],
    };
    const result = evaluateRuleSet(rules, soil, null, null);
    expect(result.band?.maximumPerSeason).toBe(4);
    expect(result.band?.splitApplications).toBe(2);
  });
});
