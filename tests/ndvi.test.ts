import { describe, expect, it } from 'vitest';
import { ndviColour, ndviScalePosition } from '../src/ndvi';

describe('NDVI display scales', () => {
  it('stretches a field range without changing its raw NDVI values', () => {
    expect(ndviScalePosition(0.2, 'contrast', 0.2, 0.6)).toBe(0);
    expect(ndviScalePosition(0.4, 'contrast', 0.2, 0.6)).toBeCloseTo(0.5);
    expect(ndviScalePosition(0.6, 'contrast', 0.2, 0.6)).toBe(1);
  });

  it('keeps absolute colours comparable across dates and paddocks', () => {
    expect(ndviColour(0.4, 'absolute', 0.2, 0.6)).toBe(ndviColour(0.4, 'absolute', -0.1, 0.9));
    expect(ndviScalePosition(0.8, 'absolute', 0, 1)).toBe(1);
  });
});
