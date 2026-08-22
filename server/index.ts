import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadEnvFile } from 'node:process';
import { ensureClosedPolygon } from '../src/geometry';
import { validateOutcome } from '../src/outcomes';
import type { Coordinate, OutcomeRecord, PaddockIntelligenceRequest } from '../src/intelligence-types';
import { appendOutcome, readOutcomes } from './outcome-store';
import { buildPaddockIntelligence } from './pipeline';
import { extractSoilTest } from './soil-test-extractor';
import { geocodeAustralianAddress, geocoderAttribution } from './geocoder';

try {
  loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

const port = Number(process.env.HAPPY_SOILS_API_PORT ?? 8787);
const maximumBodyBytes = 15 * 1024 * 1024;

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBodyBytes) throw new Error('Upload exceeds the 15 MB limit.');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function json(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(payload));
}

function isLocalRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress ?? '';
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function adviserAllowed(request: IncomingMessage): boolean {
  if (isLocalRequest(request)) return true;
  const expected = process.env.ADVISER_API_TOKEN;
  return Boolean(expected && request.headers.authorization === `Bearer ${expected}`);
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
    view: input.view === 'public' ? 'public' : 'adviser',
    ...(input.soilTest ? { soilTest: input.soilTest } : {}),
  };
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    if (request.method === 'GET' && url.pathname === '/api/health') {
      json(response, 200, {
        status: 'ok',
        providers: {
          dea: 'configured',
          tern: 'configured',
          silo: process.env.SILO_API_USERNAME ? 'configured' : 'contact-email-required',
          adviserAccess: isLocalRequest(request) || process.env.ADVISER_API_TOKEN ? 'configured' : 'token-required',
        },
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/geocode/address') {
      const query = url.searchParams.get('q') ?? '';
      const results = await geocodeAustralianAddress(query, {
        endpoint: process.env.GEOCODER_SEARCH_URL,
        userAgent: process.env.GEOCODER_USER_AGENT,
      });
      json(response, 200, { results, attribution: geocoderAttribution });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/soil-tests/extract') {
      if (!adviserAllowed(request)) {
        json(response, 401, { error: 'Adviser access is required for soil-test extraction.' });
        return;
      }
      const body = await readBody(request);
      const filename = decodeURIComponent(String(request.headers['x-file-name'] ?? 'soil-test'));
      const extraction = await extractSoilTest(body, filename, String(request.headers['content-type'] ?? 'text/plain'));
      json(response, 200, extraction);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/intelligence/paddock') {
      const payload = JSON.parse((await readBody(request)).toString('utf8')) as unknown;
      const parsed = parseIntelligenceRequest(payload);
      if (parsed.view === 'adviser' && !adviserAllowed(request)) {
        json(response, 401, { error: 'Adviser access is required for full paddock intelligence.' });
        return;
      }
      json(response, 200, await buildPaddockIntelligence(parsed, {
        siloUsername: process.env.SILO_API_USERNAME,
      }));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/outcomes') {
      if (!adviserAllowed(request)) {
        json(response, 401, { error: 'Adviser access is required to record outcomes.' });
        return;
      }
      const outcome = JSON.parse((await readBody(request)).toString('utf8')) as OutcomeRecord;
      const errors = validateOutcome(outcome);
      if (errors.length) {
        json(response, 400, { errors });
        return;
      }
      await appendOutcome(outcome);
      json(response, 201, { saved: true, id: outcome.id });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/outcomes') {
      if (!adviserAllowed(request)) {
        json(response, 401, { error: 'Adviser access is required to read outcomes.' });
        return;
      }
      const outcomes = await readOutcomes();
      json(response, 200, { outcomes, count: outcomes.length });
      return;
    }

    json(response, 404, { error: 'Not found.' });
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : 'Request failed.' });
  }
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Happy Soils data service listening on http://127.0.0.1:${port}\n`);
});
