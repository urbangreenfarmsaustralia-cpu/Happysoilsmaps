import { describe, expect, it } from 'vitest';
import { calculateApplication, isAustralianPostcode, polygonAreaHectares } from '../src/calculations';

describe('calculateApplication', () => {
  it('calculates a liquid plan across repeated applications and allowance', () => {
    const result = calculateApplication({
      areaHa: 20,
      ratePerHa: 2.5,
      rateUnit: 'L/ha',
      applications: 2,
      allowancePercent: 5,
      packSize: 20,
    });

    expect(result.baseUnit).toBe('L');
    expect(result.quantityPerApplication).toBe(50);
    expect(result.allowanceQuantity).toBe(5);
    expect(result.totalQuantity).toBe(105);
    expect(result.packsRequired).toBe(6);
  });

  it('converts millilitres per hectare to litres', () => {
    const result = calculateApplication({
      areaHa: 12,
      ratePerHa: 500,
      rateUnit: 'mL/ha',
      applications: 1,
      allowancePercent: 0,
      packSize: 5,
    });

    expect(result.totalQuantity).toBe(6);
    expect(result.baseUnit).toBe('L');
    expect(result.packsRequired).toBe(2);
  });

  it('converts grams per hectare to kilograms', () => {
    const result = calculateApplication({
      areaHa: 80,
      ratePerHa: 125,
      rateUnit: 'g/ha',
      applications: 1,
      allowancePercent: 0,
      packSize: 10,
    });

    expect(result.totalQuantity).toBe(10);
    expect(result.baseUnit).toBe('kg');
    expect(result.packsRequired).toBe(1);
  });

  it('does not estimate packs when a pack size is omitted', () => {
    const result = calculateApplication({
      areaHa: 10,
      ratePerHa: 1,
      rateUnit: 'kg/ha',
      applications: 1,
      allowancePercent: 0,
      packSize: 0,
    });

    expect(result.packsRequired).toBeNull();
  });

  it('rejects invalid application counts', () => {
    expect(() => calculateApplication({
      areaHa: 10,
      ratePerHa: 1,
      rateUnit: 'kg/ha',
      applications: 0,
      allowancePercent: 0,
      packSize: 10,
    })).toThrow(/Applications/);
  });
});

describe('polygonAreaHectares', () => {
  it('returns zero until at least three points exist', () => {
    expect(polygonAreaHectares([[115, -32], [115.01, -32]])).toBe(0);
  });

  it('calculates a plausible geodesic area for a small paddock polygon', () => {
    const hectares = polygonAreaHectares([
      [115.8, -31.95],
      [115.81, -31.95],
      [115.81, -31.96],
      [115.8, -31.96],
    ]);

    expect(hectares).toBeGreaterThan(100);
    expect(hectares).toBeLessThan(110);
  });
});

describe('isAustralianPostcode', () => {
  it('accepts blank and four-digit postcodes, including leading zeroes', () => {
    expect(isAustralianPostcode('')).toBe(true);
    expect(isAustralianPostcode('2680')).toBe(true);
    expect(isAustralianPostcode('0800')).toBe(true);
  });

  it('rejects incomplete or non-numeric postcodes', () => {
    expect(isAustralianPostcode('800')).toBe(false);
    expect(isAustralianPostcode('NSW')).toBe(false);
  });
});
