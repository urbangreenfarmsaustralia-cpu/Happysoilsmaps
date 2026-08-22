import type { Coordinate, PaddockPolygon } from './intelligence-types';

export function polygonCentroid(polygon: PaddockPolygon): Coordinate {
  const ring = polygon.coordinates[0] ?? [];
  if (ring.length === 0) return [0, 0];
  const points = ring.length > 1 && ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]
    ? ring.slice(0, -1)
    : ring;
  const totals = points.reduce(([x, y], [longitude, latitude]) => [x + longitude, y + latitude], [0, 0]);
  return [totals[0] / points.length, totals[1] / points.length];
}

export function polygonBounds(polygon: PaddockPolygon): [number, number, number, number] {
  const ring = polygon.coordinates[0] ?? [];
  if (!ring.length) return [0, 0, 0, 0];
  const longitudes = ring.map(([longitude]) => longitude);
  const latitudes = ring.map(([, latitude]) => latitude);
  return [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)];
}

export function pointInPolygon([x, y]: Coordinate, polygon: PaddockPolygon): boolean {
  const ring = polygon.coordinates[0] ?? [];
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const intersects = ((a[1] > y) !== (b[1] > y))
      && (x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]);
    if (intersects) inside = !inside;
  }
  return inside;
}

export function samplePolygon(polygon: PaddockPolygon, maximum = 9): Coordinate[] {
  const centroid = polygonCentroid(polygon);
  const [minX, minY, maxX, maxY] = polygonBounds(polygon);
  const samples: Coordinate[] = [centroid];
  const gridSize = 5;
  for (let row = 0; row < gridSize && samples.length < maximum; row += 1) {
    for (let column = 0; column < gridSize && samples.length < maximum; column += 1) {
      const point: Coordinate = [
        minX + ((column + 0.5) / gridSize) * (maxX - minX),
        minY + ((row + 0.5) / gridSize) * (maxY - minY),
      ];
      if (pointInPolygon(point, polygon) && !samples.some(([x, y]) => x === point[0] && y === point[1])) {
        samples.push(point);
      }
    }
  }
  return samples;
}

export function ensureClosedPolygon(coordinates: Coordinate[]): PaddockPolygon {
  if (coordinates.length < 3) throw new Error('A paddock polygon needs at least three boundary points.');
  const first = coordinates[0];
  const last = coordinates.at(-1);
  if (!first || !last) throw new Error('The paddock polygon is empty.');
  const ring = first[0] === last[0] && first[1] === last[1] ? coordinates : [...coordinates, first];
  return { type: 'Polygon', coordinates: [ring] };
}
