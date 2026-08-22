import type {
  ClimateSummary,
  ExceptionRule,
  ProductRuleSet,
  RecommendationBand,
  RecommendationResult,
  RuleCondition,
  SoilAnalyteKey,
  SoilValue,
  VegetationHistory,
} from './intelligence-types';

type NumericFacts = Partial<Record<SoilAnalyteKey | 'rainfall30DayMm' | 'ndviTrend', number>>;

function compare(actual: number | undefined, condition: RuleCondition): boolean {
  if (actual === undefined) return false;
  if (condition.operator === 'between' && Array.isArray(condition.value)) {
    return actual >= condition.value[0] && actual <= condition.value[1];
  }
  if (Array.isArray(condition.value)) return false;
  if (condition.operator === 'lt') return actual < condition.value;
  if (condition.operator === 'lte') return actual <= condition.value;
  if (condition.operator === 'gt') return actual > condition.value;
  return actual >= condition.value;
}

function matches(conditions: RuleCondition[], facts: NumericFacts): boolean {
  return conditions.length > 0 && conditions.every((condition) => compare(facts[condition.field], condition));
}

function factsFrom(soil: SoilValue[], climate: ClimateSummary | null, vegetation: VegetationHistory | null): NumericFacts {
  const facts: NumericFacts = {};
  soil.forEach((value) => { facts[value.key] = value.value; });
  if (climate) facts.rainfall30DayMm = climate.recent30DayRainfallMm;
  if (vegetation?.trend !== null && vegetation?.trend !== undefined) facts.ndviTrend = vegetation.trend;
  return facts;
}

function confidenceFor(soil: SoilValue[], climate: ClimateSummary | null, vegetation: VegetationHistory | null): { score: number; reasons: string[] } {
  const measured = soil.filter((value) => value.source === 'measured');
  const modelled = soil.filter((value) => value.source === 'tern-modelled');
  let score = 20;
  const reasons: string[] = [];
  if (modelled.length) { score += 20; reasons.push('TERN soil-grid priors are available.'); }
  if (measured.length) { score += Math.min(35, measured.length * 5); reasons.push(`${measured.length} measured soil value${measured.length === 1 ? '' : 's'} override modelled priors.`); }
  if (climate && climate.dataDays > 0) { score += 12; reasons.push('Location-specific SILO climate context is available.'); }
  if (vegetation && vegetation.observations.length >= 3) { score += 13; reasons.push('DEA vegetation history has at least three usable observations.'); }
  if (!measured.length) reasons.push('No measured soil test is attached.');
  return { score: Math.min(100, score), reasons };
}

export function evaluateRuleSet(
  rules: ProductRuleSet,
  soil: SoilValue[],
  climate: ClimateSummary | null,
  vegetation: VegetationHistory | null,
): RecommendationResult {
  const confidence = confidenceFor(soil, climate, vegetation);
  if (!rules.approved || rules.bands.length === 0) {
    return {
      product: rules.product,
      status: 'not-configured',
      band: null,
      exceptionFlags: [],
      confidenceScore: confidence.score,
      confidenceReasons: [...confidence.reasons, 'The Happy Soils rate table has not yet been approved for production use.'],
      rulesVersion: rules.version,
    };
  }

  const facts = factsFrom(soil, climate, vegetation);
  const band: RecommendationBand | null = rules.bands.find((candidate) => matches(candidate.when, facts)) ?? null;
  const exceptionFlags = rules.exceptionRules
    .filter((rule: ExceptionRule) => matches(rule.when, facts))
    .map(({ id, severity, message }) => ({ id, severity, message }));
  const stopped = exceptionFlags.some((flag) => flag.severity === 'stop');

  return {
    product: rules.product,
    status: !band || stopped || confidence.score < 70 ? 'adviser-review' : 'recommended',
    band,
    exceptionFlags,
    confidenceScore: confidence.score,
    confidenceReasons: confidence.reasons,
    rulesVersion: rules.version,
  };
}
