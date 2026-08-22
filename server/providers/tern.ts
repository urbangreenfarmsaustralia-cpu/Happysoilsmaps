import { samplePolygon } from '../../src/geometry';
import type { PaddockPolygon, ProviderStatus, SoilAnalyteKey, SoilGridSample, SoilValue } from '../../src/intelligence-types';

const TERN_ENDPOINT = 'https://www.asris.csiro.au/ASRISApi/api/SLGA/simple/Drill';

interface TernLayer {
  upperDepth: number;
  lowerDepth: number;
  value: number;
  upperUncertaintyBound: number;
  lowerUncertaintyBound: number;
}

interface TernAttribute {
  '<attributeName>k__BackingField': string;
  '<Units>k__BackingField': string;
  SoilLayers: TernLayer[];
}

interface TernResponse {
  SoilAttributes?: TernAttribute[];
}

const attributeMap: Partial<Record<string, { key: SoilAnalyteKey; label: string; unit?: string }>> = {
  PHC: { key: 'ph', label: 'pH (CaCl₂)', unit: 'pH' },
  SOC: { key: 'organicCarbon', label: 'Organic carbon' },
  ECEC: { key: 'cec', label: 'Effective cation exchange capacity', unit: 'cmol(+)/kg' },
  TOTAL_P: { key: 'phosphorus', label: 'Total phosphorus' },
};

function topsoilValue(layers: TernLayer[]): { value: number; lower: number; upper: number; depth: string } | null {
  const selected = layers.filter((layer) => layer.upperDepth < 15 && Number.isFinite(layer.value));
  if (!selected.length) return null;
  const weighted = selected.reduce((total, layer) => {
    const thickness = Math.min(15, layer.lowerDepth) - layer.upperDepth;
    return {
      value: total.value + layer.value * thickness,
      lower: total.lower + layer.lowerUncertaintyBound * thickness,
      upper: total.upper + layer.upperUncertaintyBound * thickness,
      thickness: total.thickness + thickness,
    };
  }, { value: 0, lower: 0, upper: 0, thickness: 0 });
  if (weighted.thickness <= 0) return null;
  return {
    value: weighted.value / weighted.thickness,
    lower: weighted.lower / weighted.thickness,
    upper: weighted.upper / weighted.thickness,
    depth: '0–15 cm modelled profile',
  };
}

async function queryPoint(longitude: number, latitude: number): Promise<TernResponse> {
  const url = new URL(TERN_ENDPOINT);
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('layers', 'ALL');
  url.searchParams.set('kernal', '0');
  url.searchParams.set('json', 'true');
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`TERN returned HTTP ${response.status}.`);
  return response.json() as Promise<TernResponse>;
}

function responseValues(response: TernResponse): SoilValue[] {
  const values: SoilValue[] = [];
  for (const attribute of response.SoilAttributes ?? []) {
    const sourceName = attribute['<attributeName>k__BackingField'];
    const mapping = attributeMap[sourceName];
    if (!mapping) continue;
    const topsoil = topsoilValue(attribute.SoilLayers ?? []);
    if (!topsoil) continue;
    const relativeInterval = Math.abs(topsoil.upper - topsoil.lower) / Math.max(Math.abs(topsoil.value), 0.1);
    values.push({
      key: mapping.key,
      label: mapping.label,
      value: topsoil.value,
      unit: mapping.unit ?? attribute['<Units>k__BackingField'],
      source: 'tern-modelled',
      confidence: Math.max(0.25, Math.min(0.75, 0.75 - relativeInterval * 0.08)),
      depth: topsoil.depth,
      lowerBound: topsoil.lower,
      upperBound: topsoil.upper,
      method: 'SLGA pixel drill',
    });
  }
  return values;
}

export async function fetchTernSoilPriors(
  polygon: PaddockPolygon,
): Promise<{ values: SoilValue[]; samples: SoilGridSample[]; status: ProviderStatus }> {
  try {
    const points = samplePolygon(polygon, 9);
    const responses = await Promise.all(points.map(([longitude, latitude]) => queryPoint(longitude, latitude)));
    const samples: SoilGridSample[] = responses.map((response, index) => ({
      coordinate: points[index]!,
      values: responseValues(response),
    })).filter((sample) => sample.values.length > 0);
    const grouped = new Map<SoilAnalyteKey, SoilValue[]>();
    for (const sample of samples) {
      for (const value of sample.values) grouped.set(value.key, [...(grouped.get(value.key) ?? []), value]);
    }

    const values: SoilValue[] = [...grouped.entries()].map(([key, records]) => {
      const count = records.length;
      const first = records[0];
      if (!first) throw new Error('TERN aggregation returned an empty record.');
      const mean = records.reduce((sum, item) => sum + item.value, 0) / count;
      const lower = records.reduce((sum, item) => sum + (item.lowerBound ?? item.value), 0) / count;
      const upper = records.reduce((sum, item) => sum + (item.upperBound ?? item.value), 0) / count;
      return {
        key,
        label: first.label,
        value: mean,
        unit: first.unit,
        source: 'tern-modelled',
        confidence: records.reduce((sum, item) => sum + item.confidence, 0) / count,
        depth: first.depth,
        lowerBound: lower,
        upperBound: upper,
        method: `SLGA pixel drill averaged across ${count} paddock sample point${count === 1 ? '' : 's'}`,
      };
    });

    return {
      values,
      samples,
      status: {
        provider: 'TERN',
        status: values.length ? 'ok' : 'partial',
        message: values.length
          ? `${values.length} modelled topsoil priors from ${points.length} paddock sample points.`
          : 'The SLGA response did not include supported recommendation fields.',
        sourceUrl: TERN_ENDPOINT,
        retrievedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      values: [],
      samples: [],
      status: {
        provider: 'TERN',
        status: 'unavailable',
        message: error instanceof Error ? error.message : 'TERN soil-grid lookup failed.',
        sourceUrl: TERN_ENDPOINT,
      },
    };
  }
}
