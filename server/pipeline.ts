import { polygonCentroid } from '../src/geometry';
import { evaluateRuleSet } from '../src/recommendations';
import { mergeSoilValues } from '../src/soil-test';
import type { PaddockIntelligenceRequest, PaddockIntelligenceResponse, ProviderStatus } from '../src/intelligence-types';
import { fetchDeaVegetation } from './providers/dea';
import { fetchSiloClimate } from './providers/silo';
import { fetchTernSoilPriors } from './providers/tern';
import { productRuleSets } from './rules';

export interface PipelineOptions {
  siloUsername?: string;
}

export async function buildPaddockIntelligence(
  request: PaddockIntelligenceRequest,
  options: PipelineOptions = {},
): Promise<PaddockIntelligenceResponse> {
  const [dea, tern, silo] = await Promise.all([
    fetchDeaVegetation(request.polygon, request.startDate, request.endDate),
    fetchTernSoilPriors(request.polygon),
    fetchSiloClimate(request.polygon, request.startDate, request.endDate, options.siloUsername),
  ]);

  const measured = request.soilTest?.values ?? [];
  const soil = mergeSoilValues(tern.values, measured);
  const soilTestStatus: ProviderStatus = {
    provider: 'SOIL_TEST',
    status: measured.length ? 'ok' : 'not-configured',
    message: measured.length
      ? `${measured.length} measured values override matching modelled priors.`
      : 'No laboratory soil test is attached; modelled priors remain clearly marked.',
    ...(request.soilTest ? { retrievedAt: request.soilTest.extractedAt } : {}),
  };
  const recommendations = productRuleSets.map((rules) => evaluateRuleSet(rules, soil, silo.climate, dea.vegetation));
  const rulesStatus: ProviderStatus = {
    provider: 'RULES',
    status: productRuleSets.every((rules) => rules.approved) ? 'ok' : 'not-configured',
    message: productRuleSets.every((rules) => rules.approved)
      ? 'Approved Activate and Energise rules are in use.'
      : 'Rate recommendations are locked until Happy Soils approves the versioned product rule tables.',
  };
  const fullResponse: PaddockIntelligenceResponse = {
    generatedAt: new Date().toISOString(),
    centroid: polygonCentroid(request.polygon),
    providers: [dea.status, tern.status, silo.status, soilTestStatus, rulesStatus],
    vegetation: dea.vegetation,
    climate: silo.climate,
    soil,
    recommendations,
    overlays: {
      ndvi: dea.overlay,
      soilSamples: tern.samples,
      climatePoint: silo.climate ? {
        coordinate: polygonCentroid(request.polygon),
        startDate: silo.climate.startDate,
        endDate: silo.climate.endDate,
        rainfallMm: silo.climate.rainfallMm,
        recent30DayRainfallMm: silo.climate.recent30DayRainfallMm,
        rainDays: silo.climate.rainDays,
      } : null,
    },
    publicSummary: {
      vegetationObservationCount: dea.vegetation?.observations.length ?? 0,
      climateDataDays: silo.climate?.dataDays ?? 0,
      soilPriorCount: tern.values.length,
      measuredSoilCount: measured.length,
    },
  };

  return request.view === 'public'
    ? { ...fullResponse, soil: [], recommendations: [], overlays: { ...fullResponse.overlays, soilSamples: [] } }
    : fullResponse;
}
