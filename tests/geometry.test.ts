import { describe, expect, it } from 'vitest';
import { ensureClosedPolygon, pointInPolygon, samplePolygon } from '../src/geometry';

describe('paddock geometry', () => {
  const polygon = ensureClosedPolygon([[144, -37], [144.02, -37], [144.02, -37.02], [144, -37.02]]);

  it('closes polygons and detects points inside them', () => {
    expect(polygon.coordinates[0]?.[0]).toEqual(polygon.coordinates[0]?.at(-1));
    expect(pointInPolygon([144.01, -37.01], polygon)).toBe(true);
    expect(pointInPolygon([145, -37], polygon)).toBe(false);
  });

  it('creates bounded sampling points within the paddock', () => {
    const samples = samplePolygon(polygon, 9);
    expect(samples.length).toBeGreaterThan(1);
    expect(samples.length).toBeLessThanOrEqual(9);
    expect(samples.every((point) => pointInPolygon(point, polygon))).toBe(true);
  });
});
