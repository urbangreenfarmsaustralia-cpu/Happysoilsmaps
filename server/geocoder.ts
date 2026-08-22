const DEFAULT_GEOCODER_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
const MINIMUM_REQUEST_GAP_MS = 1_100;

interface NominatimResult {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
}

export interface GeocodingCandidate {
  label: string;
  latitude: number;
  longitude: number;
  boundingBox: [south: number, north: number, west: number, east: number] | null;
}

const cache = new Map<string, { expiresAt: number; candidates: GeocodingCandidate[] }>();
let lastRequestAt = 0;

function normaliseQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim().slice(0, 220);
}

function parseCandidate(result: NominatimResult): GeocodingCandidate | null {
  const latitude = Number(result.lat);
  const longitude = Number(result.lon);
  if (!result.display_name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const box = result.boundingbox?.map(Number);
  const boundingBox = box?.length === 4 && box.every(Number.isFinite)
    ? [box[0]!, box[1]!, box[2]!, box[3]!] as GeocodingCandidate['boundingBox']
    : null;
  return { label: result.display_name, latitude, longitude, boundingBox };
}

export interface GeocoderOptions {
  endpoint?: string;
  userAgent?: string;
}

export async function geocodeAustralianAddress(
  query: string,
  options: GeocoderOptions = {},
): Promise<GeocodingCandidate[]> {
  const normalised = normaliseQuery(query);
  if (normalised.length < 4) throw new Error('Enter a street, locality or postcode before searching.');
  const cacheKey = normalised.toLocaleLowerCase('en-AU');
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.candidates;

  const waitMs = Math.max(0, MINIMUM_REQUEST_GAP_MS - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();

  const endpoint = options.endpoint?.trim() || DEFAULT_GEOCODER_ENDPOINT;
  const url = new URL(endpoint);
  url.searchParams.set('q', normalised);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('countrycodes', 'au');
  url.searchParams.set('limit', '5');
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'accept-language': 'en-AU,en;q=0.8',
      'user-agent': options.userAgent?.trim()
        || 'HappySoilsMaps/0.2 (https://github.com/urbangreenfarmsaustralia-cpu/Happysoilsmaps)',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Address lookup returned HTTP ${response.status}.`);
  const payload = await response.json() as NominatimResult[];
  const candidates = payload.map(parseCandidate).filter((candidate): candidate is GeocodingCandidate => Boolean(candidate));
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_DURATION_MS, candidates });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return candidates;
}

export const geocoderAttribution = 'Search results © OpenStreetMap contributors';
