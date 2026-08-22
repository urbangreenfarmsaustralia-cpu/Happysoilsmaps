import { polygonCentroid } from '../../src/geometry';
import type { ClimateSummary, PaddockPolygon, ProviderStatus } from '../../src/intelligence-types';

const SILO_ENDPOINT = 'https://www.longpaddock.qld.gov.au/cgi-bin/silo/DataDrillDataset.php';

interface SiloVariable { variable_code: string; value: number | null }
interface SiloDay { date: string; variables: SiloVariable[] }
interface SiloResponse { data?: SiloDay[] }

function yyyymmdd(date: string): string {
  return date.replaceAll('-', '');
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

export async function fetchSiloClimate(
  polygon: PaddockPolygon,
  startDate: string,
  endDate: string,
  usernameInput?: string,
): Promise<{ climate: ClimateSummary | null; status: ProviderStatus }> {
  const username = usernameInput?.trim();
  if (!username) {
    return {
      climate: null,
      status: {
        provider: 'SILO',
        status: 'not-configured',
        message: 'Set SILO_API_USERNAME to the contact email required by the SILO service.',
        sourceUrl: SILO_ENDPOINT,
      },
    };
  }

  try {
    const [longitude, latitude] = polygonCentroid(polygon);
    const url = new URL(SILO_ENDPOINT);
    url.searchParams.set('lat', latitude.toFixed(5));
    url.searchParams.set('lon', longitude.toFixed(5));
    url.searchParams.set('start', yyyymmdd(startDate));
    url.searchParams.set('finish', yyyymmdd(endDate));
    url.searchParams.set('format', 'json');
    url.searchParams.set('username', username);
    url.searchParams.set('password', 'apirequest');
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`SILO returned HTTP ${response.status}.`);
    const payload = await response.json() as SiloResponse;
    const days = payload.data ?? [];
    const variables = (day: SiloDay): Map<string, number> => new Map(
      day.variables
        .filter((variable): variable is { variable_code: string; value: number } => Number.isFinite(variable.value))
        .map((variable) => [variable.variable_code, variable.value]),
    );
    const codes = days.map(variables);
    const rainfall = codes.map((day) => day.get('daily_rain')).filter((value): value is number => value !== undefined);
    const recentStart = new Date(`${endDate}T00:00:00Z`);
    recentStart.setUTCDate(recentStart.getUTCDate() - 29);
    const recentRainfall = days
      .filter((day) => new Date(`${day.date}T00:00:00Z`) >= recentStart)
      .map(variables)
      .map((day) => day.get('daily_rain'))
      .filter((value): value is number => value !== undefined);
    const maximums = codes.map((day) => day.get('max_temp')).filter((value): value is number => value !== undefined);
    const minimums = codes.map((day) => day.get('min_temp')).filter((value): value is number => value !== undefined);
    const evaporation = codes
      .map((day) => day.get('evap_comb') ?? day.get('evap_pan'))
      .filter((value): value is number => value !== undefined);
    const climate: ClimateSummary = {
      provider: 'SILO',
      startDate,
      endDate,
      rainfallMm: rainfall.reduce((total, value) => total + value, 0),
      recent30DayRainfallMm: recentRainfall.reduce((total, value) => total + value, 0),
      rainDays: rainfall.filter((value) => value >= 1).length,
      meanMaximumTemperatureC: mean(maximums),
      meanMinimumTemperatureC: mean(minimums),
      meanEvaporationMm: mean(evaporation),
      dataDays: days.length,
    };
    return {
      climate,
      status: {
        provider: 'SILO',
        status: days.length ? 'ok' : 'partial',
        message: `${days.length} daily climate records returned for the paddock centroid.`,
        sourceUrl: SILO_ENDPOINT,
        retrievedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      climate: null,
      status: {
        provider: 'SILO',
        status: 'unavailable',
        message: error instanceof Error ? error.message : 'SILO climate lookup failed.',
        sourceUrl: SILO_ENDPOINT,
      },
    };
  }
}
