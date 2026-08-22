import { fromUrl } from 'geotiff';
import proj4 from 'proj4';
import { pointInPolygon, polygonBounds } from '../../src/geometry';
import type {
  Coordinate,
  NdviOverlay,
  NdviOverlayCell,
  PaddockPolygon,
  ProviderStatus,
  VegetationHistory,
  VegetationObservation,
} from '../../src/intelligence-types';

const DEA_STAC_ENDPOINT = 'https://explorer.dea.ga.gov.au/stac/search';
const MAX_OBSERVATIONS = 8;
const MIN_FIELD_CLEAR_PERCENT = 50;

interface StacAsset { href: string }
interface StacItem {
  id: string;
  properties: {
    datetime: string;
    'eo:cloud_cover'?: number;
    'fmask:cloud'?: number;
    'proj:epsg'?: number;
    'dea:dataset_maturity'?: string;
    platform?: string;
  };
  assets: Record<string, StacAsset>;
}
interface StacResponse { features?: StacItem[] }

function assetUrl(href: string): string {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(href);
  if (!match?.[1] || !match[2]) return href;
  return `https://${match[1]}.s3.ap-southeast-2.amazonaws.com/${match[2]}`;
}

function projectedCrs(epsg: number): string {
  if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${epsg - 32600} +north +datum=WGS84 +units=m +no_defs`;
  if (epsg >= 32701 && epsg <= 32760) return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
  throw new Error(`DEA scene uses unsupported projection EPSG:${epsg}.`);
}

function chooseItems(items: StacItem[]): StacItem[] {
  const usable = items
    .filter((item) => item.assets.nbart_red && item.assets.nbart_nir_1 && item.assets.oa_fmask)
    .filter((item) => item.properties['dea:dataset_maturity'] !== 'nrt')
    .filter((item) => (item.properties['eo:cloud_cover'] ?? item.properties['fmask:cloud'] ?? 0) <= 80)
    .sort((a, b) => a.properties.datetime.localeCompare(b.properties.datetime));
  if (usable.length <= MAX_OBSERVATIONS) return usable;
  return Array.from({ length: MAX_OBSERVATIONS }, (_, index) => {
    const position = Math.round((index / (MAX_OBSERVATIONS - 1)) * (usable.length - 1));
    return usable[position];
  }).filter((item): item is StacItem => Boolean(item));
}

async function queryItems(polygon: PaddockPolygon, startDate: string, endDate: string): Promise<StacItem[]> {
  const url = new URL(DEA_STAC_ENDPOINT);
  url.searchParams.set('collections', 'ga_s2am_ard_3,ga_s2bm_ard_3,ga_s2cm_ard_3');
  url.searchParams.set('bbox', polygonBounds(polygon).join(','));
  url.searchParams.set('datetime', `${startDate}T00:00:00Z/${endDate}T23:59:59Z`);
  url.searchParams.set('limit', '60');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (response.ok) {
      const payload = await response.json() as StacResponse;
      return chooseItems(payload.features ?? []);
    }
    const retryable = response.status === 429 || response.status === 502 || response.status === 503 || response.status === 504;
    if (!retryable || attempt === 2) throw new Error(`DEA STAC returned HTTP ${response.status}.`);
    await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
  }
  return [];
}

function projectedPolygon(polygon: PaddockPolygon, crs: string): PaddockPolygon {
  return {
    type: 'Polygon',
    coordinates: polygon.coordinates.map((ring) => ring.map((point) => proj4('EPSG:4326', crs, point) as Coordinate)),
  };
}

interface SampledScene {
  observation: VegetationObservation;
  overlay: NdviOverlay | null;
}

async function sampleScene(item: StacItem, polygon: PaddockPolygon, captureOverlay = false): Promise<SampledScene | null> {
  const epsg = item.properties['proj:epsg'];
  const redAsset = item.assets.nbart_red;
  const nirAsset = item.assets.nbart_nir_1;
  const maskAsset = item.assets.oa_fmask;
  if (!epsg || !redAsset || !nirAsset || !maskAsset) return null;
  const crs = projectedCrs(epsg);
  const projected = projectedPolygon(polygon, crs);
  const [redTiff, nirTiff, maskTiff] = await Promise.all([
    fromUrl(assetUrl(redAsset.href)),
    fromUrl(assetUrl(nirAsset.href)),
    fromUrl(assetUrl(maskAsset.href)),
  ]);
  const [redImage, nirImage, maskImage] = await Promise.all([redTiff.getImage(), nirTiff.getImage(), maskTiff.getImage()]);
  const bounds = redImage.getBoundingBox();
  const imageMinX = bounds[0];
  const imageMinY = bounds[1];
  const imageMaxX = bounds[2];
  const imageMaxY = bounds[3];
  if (imageMinX === undefined || imageMinY === undefined || imageMaxX === undefined || imageMaxY === undefined) return null;
  const [minX, minY, maxX, maxY] = polygonBounds(projected);
  const resolutionX = (imageMaxX - imageMinX) / redImage.getWidth();
  const resolutionY = (imageMaxY - imageMinY) / redImage.getHeight();
  const window: [number, number, number, number] = [
    Math.max(0, Math.floor((minX - imageMinX) / resolutionX)),
    Math.max(0, Math.floor((imageMaxY - maxY) / resolutionY)),
    Math.min(redImage.getWidth(), Math.ceil((maxX - imageMinX) / resolutionX)),
    Math.min(redImage.getHeight(), Math.ceil((imageMaxY - minY) / resolutionY)),
  ];
  if (window[2] <= window[0] || window[3] <= window[1]) return null;
  const nativeWidth = window[2] - window[0];
  const nativeHeight = window[3] - window[1];
  const maximumDimension = 96;
  const scale = Math.min(1, maximumDimension / Math.max(nativeWidth, nativeHeight));
  const width = Math.max(1, Math.round(nativeWidth * scale));
  const height = Math.max(1, Math.round(nativeHeight * scale));
  const projectedMinX = imageMinX + window[0] * resolutionX;
  const projectedMaxY = imageMaxY - window[1] * resolutionY;
  const projectedWidth = nativeWidth * resolutionX;
  const projectedHeight = nativeHeight * resolutionY;
  const maskBounds = maskImage.getBoundingBox();
  const maskMinX = maskBounds[0];
  const maskMinY = maskBounds[1];
  const maskMaxX = maskBounds[2];
  const maskMaxY = maskBounds[3];
  if (maskMinX === undefined || maskMinY === undefined || maskMaxX === undefined || maskMaxY === undefined) return null;
  const maskResolutionX = (maskMaxX - maskMinX) / maskImage.getWidth();
  const maskResolutionY = (maskMaxY - maskMinY) / maskImage.getHeight();
  const maskWindow: [number, number, number, number] = [
    Math.max(0, Math.floor((projectedMinX - maskMinX) / maskResolutionX)),
    Math.max(0, Math.floor((maskMaxY - projectedMaxY) / maskResolutionY)),
    Math.min(maskImage.getWidth(), Math.ceil((projectedMinX + projectedWidth - maskMinX) / maskResolutionX)),
    Math.min(maskImage.getHeight(), Math.ceil((maskMaxY - (projectedMaxY - projectedHeight)) / maskResolutionY)),
  ];
  if (maskWindow[2] <= maskWindow[0] || maskWindow[3] <= maskWindow[1]) return null;
  const [redRasters, nirRasters, maskRasters] = await Promise.all([
    redImage.readRasters({ window, width, height, samples: [0], interleave: false, resampleMethod: 'nearest' }),
    nirImage.readRasters({ window, width, height, samples: [0], interleave: false, resampleMethod: 'nearest' }),
    maskImage.readRasters({ window: maskWindow, width, height, samples: [0], interleave: false, resampleMethod: 'nearest' }),
  ]);
  const red = redRasters[0];
  const nir = nirRasters[0];
  const mask = maskRasters[0];
  if (!red || !nir || !mask) return null;
  let total = 0;
  let count = 0;
  let insideCount = 0;
  let clearCount = 0;
  const overlayCells: NdviOverlayCell[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      const redValue = Number(red[index]);
      const nirValue = Number(nir[index]);
      const point: Coordinate = [
        projectedMinX + ((column + 0.5) / width) * projectedWidth,
        projectedMaxY - ((row + 0.5) / height) * projectedHeight,
      ];
      if (!pointInPolygon(point, projected)) continue;
      insideCount += 1;
      if (Number(mask[index]) !== 1) continue;
      clearCount += 1;
      if (!Number.isFinite(redValue) || !Number.isFinite(nirValue) || redValue <= 0 || nirValue <= 0) continue;
      const denominator = nirValue + redValue;
      if (denominator === 0) continue;
      const ndvi = (nirValue - redValue) / denominator;
      if (ndvi < -1 || ndvi > 1) continue;
      total += ndvi;
      count += 1;
      if (captureOverlay) {
        const cellMinX = projectedMinX + (column / width) * projectedWidth;
        const cellMaxX = projectedMinX + ((column + 1) / width) * projectedWidth;
        const cellMaxY = projectedMaxY - (row / height) * projectedHeight;
        const cellMinY = projectedMaxY - ((row + 1) / height) * projectedHeight;
        overlayCells.push({
          coordinates: [
            proj4(crs, 'EPSG:4326', [cellMinX, cellMaxY]) as Coordinate,
            proj4(crs, 'EPSG:4326', [cellMaxX, cellMaxY]) as Coordinate,
            proj4(crs, 'EPSG:4326', [cellMaxX, cellMinY]) as Coordinate,
            proj4(crs, 'EPSG:4326', [cellMinX, cellMinY]) as Coordinate,
          ],
          value: ndvi,
        });
      }
    }
  }
  if (!count) return null;
  const validClearPercent = insideCount ? (clearCount / insideCount) * 100 : 0;
  if (validClearPercent < MIN_FIELD_CLEAR_PERCENT) return null;
  const platform = item.properties.platform ?? 'Sentinel-2';
  const observation: VegetationObservation = {
    date: item.properties.datetime.slice(0, 10),
    meanNdvi: total / count,
    sampleCount: count,
    sceneCloudPercent: item.properties['eo:cloud_cover'] ?? item.properties['fmask:cloud'] ?? null,
    sceneId: item.id,
    validClearPercent,
    nativeResolutionMetres: 10,
    platform,
  };
  const values = overlayCells.map((cell) => cell.value);
  return {
    observation,
    overlay: captureOverlay && values.length ? {
      date: observation.date,
      sceneId: item.id,
      cells: overlayCells,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
      validClearPercent,
      nativeResolutionMetres: 10,
      displayResolutionMetres: resolutionX / scale,
      platform,
    } : null,
  };
}

export async function fetchDeaVegetation(
  polygon: PaddockPolygon,
  startDate: string,
  endDate: string,
): Promise<{ vegetation: VegetationHistory | null; overlay: NdviOverlay | null; status: ProviderStatus }> {
  try {
    const items = await queryItems(polygon, startDate, endDate);
    const settled: VegetationObservation[] = [];
    let overlay: NdviOverlay | null = null;
    for (const item of [...items].reverse()) {
      try {
        const scene = await sampleScene(item, polygon, overlay === null);
        if (scene) {
          settled.push(scene.observation);
          overlay ??= scene.overlay;
        }
      } catch {
        // A single inaccessible or unsuitable scene must not discard the rest of the history.
      }
    }
    settled.sort((a, b) => a.date.localeCompare(b.date));
    const first = settled[0];
    const last = settled.at(-1);
    const trend = first && last && first !== last ? last.meanNdvi - first.meanNdvi : null;
    const vegetation: VegetationHistory | null = settled.length ? {
      provider: 'DEA',
      observations: settled,
      trend,
      sourceProduct: 'DEA Sentinel-2A/2B/2C Analysis Ready Data (10 m NBART red and NIR; NDVI derived by Happy Soils Maps)',
    } : null;
    return {
      vegetation,
      overlay,
      status: {
        provider: 'DEA',
        status: settled.length >= 3 ? 'ok' : 'partial',
        message: settled.length
          ? `${settled.length} paddock NDVI observations calculated from ${items.length} selected DEA Sentinel-2 scenes with at least ${MIN_FIELD_CLEAR_PERCENT}% clear field coverage.`
          : 'No usable cloud-screened DEA scene samples were found for this period.',
        sourceUrl: 'https://explorer.dea.ga.gov.au/stac',
        retrievedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      vegetation: null,
      overlay: null,
      status: {
        provider: 'DEA',
        status: 'unavailable',
        message: error instanceof Error ? error.message : 'DEA vegetation lookup failed.',
        sourceUrl: 'https://explorer.dea.ga.gov.au/stac',
      },
    };
  }
}
