export type Coordinate = [longitude: number, latitude: number];

export interface PaddockPolygon {
  type: 'Polygon';
  coordinates: Coordinate[][];
}

export type SoilAnalyteKey =
  | 'ph'
  | 'organicCarbon'
  | 'cec'
  | 'ec'
  | 'sodium'
  | 'esp'
  | 'calcium'
  | 'magnesium'
  | 'caMgRatio'
  | 'phosphorus'
  | 'sulfur'
  | 'boron'
  | 'copper'
  | 'zinc'
  | 'iron'
  | 'manganese'
  | 'molybdenum';

export type SoilValueSource = 'measured' | 'tern-modelled';

export interface SoilValue {
  key: SoilAnalyteKey;
  label: string;
  value: number;
  unit: string;
  source: SoilValueSource;
  confidence: number;
  depth?: string;
  lowerBound?: number;
  upperBound?: number;
  method?: string;
}

export interface SoilTestExtraction {
  filename: string;
  extractedAt: string;
  values: SoilValue[];
  warnings: string[];
  rawTextLength: number;
}

export interface ProviderStatus {
  provider: 'DEA' | 'TERN' | 'SILO' | 'SOIL_TEST' | 'RULES';
  status: 'ok' | 'partial' | 'not-configured' | 'unavailable';
  message: string;
  sourceUrl?: string;
  retrievedAt?: string;
}

export interface VegetationObservation {
  date: string;
  meanNdvi: number;
  sampleCount: number;
  sceneCloudPercent: number | null;
  sceneId: string;
  validClearPercent: number;
  nativeResolutionMetres: number;
  platform: string;
}

export interface VegetationHistory {
  provider: 'DEA';
  observations: VegetationObservation[];
  trend: number | null;
  sourceProduct: string;
}

export interface NdviOverlayCell {
  coordinates: Coordinate[];
  value: number;
}

export interface NdviOverlay {
  date: string;
  sceneId: string;
  cells: NdviOverlayCell[];
  minimum: number;
  maximum: number;
  validClearPercent: number;
  nativeResolutionMetres: number;
  displayResolutionMetres: number;
  platform: string;
}

export interface SoilGridSample {
  coordinate: Coordinate;
  values: SoilValue[];
}

export interface ClimateMapPoint {
  coordinate: Coordinate;
  startDate: string;
  endDate: string;
  rainfallMm: number;
  recent30DayRainfallMm: number;
  rainDays: number;
}

export interface MapOverlayData {
  ndvi: NdviOverlay | null;
  soilSamples: SoilGridSample[];
  climatePoint: ClimateMapPoint | null;
}

export interface ClimateSummary {
  provider: 'SILO';
  startDate: string;
  endDate: string;
  rainfallMm: number;
  recent30DayRainfallMm: number;
  rainDays: number;
  meanMaximumTemperatureC: number | null;
  meanMinimumTemperatureC: number | null;
  meanEvaporationMm: number | null;
  dataDays: number;
}

export interface RecommendationBand {
  id: string;
  label: string;
  when: RuleCondition[];
  ratePerHa: number;
  rateUnit: 'L/ha' | 'mL/ha' | 'kg/ha' | 'g/ha';
  maximumPerApplication: number;
  maximumPerSeason: number;
  splitApplications: number;
  minimumDaysBetweenApplications: number;
  notes: string[];
}

export interface RuleCondition {
  field: SoilAnalyteKey | 'rainfall30DayMm' | 'ndviTrend';
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'between';
  value: number | [number, number];
}

export interface ProductRuleSet {
  product: 'Activate' | 'Energise';
  version: string;
  approved: boolean;
  approvedBy: string | null;
  approvedAt: string | null;
  bands: RecommendationBand[];
  exceptionRules: ExceptionRule[];
}

export interface ExceptionRule {
  id: string;
  severity: 'review' | 'stop';
  message: string;
  when: RuleCondition[];
}

export interface RecommendationResult {
  product: 'Activate' | 'Energise';
  status: 'recommended' | 'adviser-review' | 'not-configured';
  band: RecommendationBand | null;
  exceptionFlags: Array<{ id: string; severity: 'review' | 'stop'; message: string }>;
  confidenceScore: number;
  confidenceReasons: string[];
  rulesVersion: string;
}

export interface PaddockIntelligenceRequest {
  polygon: PaddockPolygon;
  startDate: string;
  endDate: string;
  soilTest?: SoilTestExtraction;
  view: 'public' | 'adviser';
}

export interface PaddockIntelligenceResponse {
  generatedAt: string;
  centroid: Coordinate;
  providers: ProviderStatus[];
  vegetation: VegetationHistory | null;
  climate: ClimateSummary | null;
  soil: SoilValue[];
  recommendations: RecommendationResult[];
  overlays: MapOverlayData;
  publicSummary: {
    vegetationObservationCount: number;
    climateDataDays: number;
    soilPriorCount: number;
    measuredSoilCount: number;
  };
}

export interface OutcomeRecord {
  id: string;
  paddockName: string;
  polygon: PaddockPolygon;
  treatmentProduct: 'Activate' | 'Energise' | 'Other';
  treatmentRate: number;
  treatmentRateUnit: string;
  treatmentDate: string;
  crop: string;
  yieldValue: number | null;
  yieldUnit: string;
  followUpSoilTest: SoilTestExtraction | null;
  ndviBefore: number | null;
  ndviAfter: number | null;
  inputCostAud: number | null;
  revenueChangeAud: number | null;
  roiPercent: number | null;
  notes: string;
  recordedAt: string;
}
