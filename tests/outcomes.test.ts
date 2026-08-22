import { describe, expect, it } from 'vitest';
import { calculateRoiPercent } from '../src/outcomes';

describe('outcome economics', () => {
  it('calculates ROI after treatment cost', () => {
    expect(calculateRoiPercent(1_000, 1_600)).toBe(60);
  });

  it('does not calculate ROI without a positive cost baseline', () => {
    expect(calculateRoiPercent(0, 1_600)).toBeNull();
    expect(calculateRoiPercent(null, 1_600)).toBeNull();
  });
});
