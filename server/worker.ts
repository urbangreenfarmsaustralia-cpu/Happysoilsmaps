import { ensureClosedPolygon } from '../src/geometry';
import type { Coordinate, PaddockIntelligenceRequest } from '../src/intelligence-types';
import { geocodeAustralianAddress, geocoderAttribution } from './geocoder';
import { buildPaddockIntelligence } from './pipeline';

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetBinding;
  GEOCODER_SEARCH_URL?: string;
  GEOCODER_USER_AGENT?: string;
  SILO_API_USERNAME?: string;
}

const publicHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
};

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status, headers: publicHeaders });
}

function parseIntelligenceRequest(payload: unknown): PaddockIntelligenceRequest {
  if (!payload || typeof payload !== 'object') throw new Error('The request body must be JSON.');
  const input = payload as Partial<PaddockIntelligenceRequest>;
  const ring = input.polygon?.coordinates?.[0] as Coordinate[] | undefined;
  if (!ring) throw new Error('A paddock polygon is required.');
  if (!input.startDate || !input.endDate) throw new Error('A start and end date are required.');
  return {
    polygon: ensureClosedPolygon(ring),
    startDate: input.startDate,
    endDate: input.endDate,
    view: 'public',
  };
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/api/health') {
        return json(200, {
          status: 'ok',
          environment: 'public-feedback',
          providers: {
            dea: 'configured',
            tern: 'configured',
            silo: env.SILO_API_USERNAME ? 'configured' : 'contact-email-required',
            adviserAccess: 'disabled-on-public-staging',
          },
        });
      }

      if (request.method === 'GET' && url.pathname === '/api/geocode/address') {
        const results = await geocodeAustralianAddress(url.searchParams.get('q') ?? '', {
          endpoint: env.GEOCODER_SEARCH_URL,
          userAgent: env.GEOCODER_USER_AGENT,
        });
        return json(200, { results, attribution: geocoderAttribution });
      }

      if (request.method === 'POST' && url.pathname === '/api/intelligence/paddock') {
        const parsed = parseIntelligenceRequest(await request.json());
        return json(200, await buildPaddockIntelligence(parsed, {
          siloUsername: env.SILO_API_USERNAME,
        }));
      }

      if (url.pathname.startsWith('/api/')) {
        return json(403, {
          error: 'Adviser uploads and outcome records are disabled on this public feedback site.',
        });
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : 'Request failed.' });
    }
  },
};

export default worker;
