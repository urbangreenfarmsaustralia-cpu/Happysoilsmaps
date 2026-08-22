import { calculateRoiPercent } from './outcomes';
import type {
  OutcomeRecord,
  PaddockIntelligenceResponse,
  PaddockPolygon,
  SoilTestExtraction,
  SoilValue,
} from './intelligence-types';

interface IntelligenceUiOptions {
  root: HTMLElement;
  getPolygon: () => PaddockPolygon | null;
  getPaddockName: () => string;
  notify: (message: string) => void;
  onOverlaysReady?: (result: PaddockIntelligenceResponse) => void;
}

export interface IntelligenceUiController {
  run: (viewOverride?: 'adviser' | 'public') => Promise<PaddockIntelligenceResponse | null>;
}

const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character] ?? character);

const formatNumber = (value: number, digits = 2): string => new Intl.NumberFormat('en-AU', {
  maximumFractionDigits: digits,
}).format(value);

const isoDate = (date: Date): string => date.toISOString().slice(0, 10);

function analyteTable(values: SoilValue[]): string {
  if (!values.length) return '<p class="empty-state">No soil values are available in this view.</p>';
  return `
    <div class="data-table-wrap">
      <table class="data-table">
        <thead><tr><th>Analyte</th><th>Value</th><th>Source</th><th>Confidence</th></tr></thead>
        <tbody>${values.map((value) => `
          <tr>
            <td><strong>${escapeHtml(value.label)}</strong><small>${escapeHtml(value.depth ?? value.method ?? '')}</small></td>
            <td>${formatNumber(value.value, 3)} ${escapeHtml(value.unit)}</td>
            <td><span class="source-chip source-${value.source}">${value.source === 'measured' ? 'Measured' : 'TERN prior'}</span></td>
            <td>${Math.round(value.confidence * 100)}%</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function renderResult(result: PaddockIntelligenceResponse): string {
  const vegetation = result.vegetation;
  const climate = result.climate;
  const recommendations = result.recommendations;
  const overlayCount = (result.overlays.ndvi?.cells.length ?? 0)
    + result.overlays.soilSamples.length
    + (result.overlays.climatePoint ? 1 : 0);
  return `
    <section class="pipeline-results">
      <div class="provider-grid">
        ${result.providers.map((provider) => `
          <article class="provider-card provider-${provider.status}">
            <div><strong>${provider.provider.replace('_', ' ')}</strong><span>${provider.status.replace('-', ' ')}</span></div>
            <p>${escapeHtml(provider.message)}</p>
          </article>`).join('')}
      </div>

      ${overlayCount ? `<div class="overlay-ready-callout"><div><strong>Map layers are ready</strong><span>${result.overlays.ndvi?.cells.length ?? 0} NDVI cells · ${result.overlays.soilSamples.length} soil samples · ${result.overlays.climatePoint ? 'climate point ready' : 'no climate point'}</span></div><button class="button button-primary" type="button" data-view="planner">View overlays on map</button></div>` : ''}

      <div class="intelligence-summary-grid">
        <article><span>DEA observations</span><strong>${result.publicSummary.vegetationObservationCount}</strong><small>${vegetation?.trend === null || vegetation?.trend === undefined ? 'Trend unavailable' : `NDVI change ${vegetation.trend >= 0 ? '+' : ''}${formatNumber(vegetation.trend, 3)}`}</small></article>
        <article><span>Rainfall context</span><strong>${climate ? `${formatNumber(climate.rainfallMm, 0)} mm` : '—'}</strong><small>${climate ? `${climate.rainDays} rain days · ${climate.dataDays} records` : 'SILO configuration required'}</small></article>
        <article><span>Modelled soil priors</span><strong>${result.publicSummary.soilPriorCount}</strong><small>TERN fields available</small></article>
        <article><span>Measured overrides</span><strong>${result.publicSummary.measuredSoilCount}</strong><small>Lab values take precedence</small></article>
      </div>

      ${vegetation?.observations.length ? `
        <section class="data-panel">
          <div class="panel-heading"><div><p class="eyebrow">VEGETATION HISTORY</p><h2>DEA Sentinel‑2 paddock NDVI</h2></div><small>Derived from 10 m NBART red and near-infrared pixels after the DEA quality mask.</small></div>
          <div class="ndvi-series">${vegetation.observations.map((observation) => `
            <div class="ndvi-point"><span>${escapeHtml(observation.date)}</span><i style="--ndvi:${Math.max(0, Math.min(1, observation.meanNdvi))}"></i><strong>${formatNumber(observation.meanNdvi, 3)}</strong></div>`).join('')}</div>
        </section>` : ''}

      ${result.soil.length ? `
        <section class="data-panel">
          <div class="panel-heading"><div><p class="eyebrow">SOIL EVIDENCE</p><h2>Measured values and modelled priors</h2></div><small>Measured values replace matching priors before rules run.</small></div>
          ${analyteTable(result.soil)}
        </section>` : ''}

      ${recommendations.length ? `
        <section class="data-panel">
          <div class="panel-heading"><div><p class="eyebrow">DECISION ENGINE</p><h2>Activate and Energise</h2></div><small>Versioned rules, caps, split logic, exceptions and confidence.</small></div>
          <div class="recommendation-grid">${recommendations.map((recommendation) => `
            <article>
              <div class="recommendation-title"><h3>${recommendation.product}</h3><span class="status-chip ${recommendation.status === 'not-configured' ? 'status-draft' : 'status-ready'}">${recommendation.status.replace('-', ' ')}</span></div>
              <strong>${recommendation.band ? `${recommendation.band.ratePerHa} ${recommendation.band.rateUnit}` : 'Rate locked'}</strong>
              <p>${recommendation.confidenceScore}% evidence confidence</p>
              <ul>${recommendation.confidenceReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>
              ${recommendation.exceptionFlags.map((flag) => `<p class="exception exception-${flag.severity}">${escapeHtml(flag.message)}</p>`).join('')}
              <small>Rules version: ${escapeHtml(recommendation.rulesVersion)}</small>
            </article>`).join('')}</div>
        </section>` : `
        <section class="data-panel public-boundary-note"><strong>Public intelligence view</strong><p>Paddock soil results and treatment recommendations are intentionally withheld. Switch to adviser view in an authorised session for the complete result.</p></section>`}
    </section>`;
}

export function mountIntelligenceUi({ root, getPolygon, getPaddockName, notify, onOverlaysReady }: IntelligenceUiOptions): IntelligenceUiController {
  const today = new Date();
  const oneYearAgo = new Date(today);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  root.innerHTML = `
    <section class="page-hero intelligence-hero">
      <div><p class="eyebrow">PADDOCK INTELLIGENCE</p><h1>Turn a boundary into evidence.</h1><p>Run the paddock through satellite history, soil-grid priors, climate context, measured soil data and the controlled recommendation engine.</p></div>
      <button class="button button-ghost" type="button" data-view="planner">Edit paddock boundary</button>
    </section>

    <section class="pipeline-layout">
      <div class="pipeline-main">
        <section class="pipeline-card pipeline-controls">
          <div class="panel-heading"><div><p class="eyebrow">1 · REQUEST</p><h2>Build paddock context</h2></div><span id="api-health" class="status-chip status-draft">Checking service</span></div>
          <div class="boundary-callout"><span>Current boundary</span><strong id="intelligence-boundary-status">Return to the planner and draw a paddock.</strong></div>
          <div class="field-row">
            <label>History starts<input id="intelligence-start-date" type="date" value="${isoDate(oneYearAgo)}" /></label>
            <label>History ends<input id="intelligence-end-date" type="date" value="${isoDate(today)}" /></label>
          </div>
          <label>Response view
            <select id="intelligence-view-mode"><option value="adviser">Internal / adviser — full paddock evidence</option><option value="public">Public — regional intelligence only</option></select>
          </label>
          <p class="data-disclosure">Running the pipeline sends the paddock geometry to the selected Australian data services. Uploaded lab reports stay in the adviser service and are not included in the public response.</p>
        </section>

        <section class="pipeline-card">
          <div class="panel-heading"><div><p class="eyebrow">2 · MEASURED SOIL</p><h2>Attach a laboratory report</h2></div><span class="precedence-pill">Measured overrides modelled</span></div>
          <label class="file-drop" for="soil-test-upload"><strong>Upload PDF, CSV or text</strong><span>Maximum 15 MB. Extraction must be checked against the original report.</span><input id="soil-test-upload" type="file" accept="application/pdf,text/plain,text/csv,.pdf,.txt,.csv" /></label>
          <div id="soil-test-results"><p class="empty-state">No measured soil test attached.</p></div>
        </section>

        <button class="button button-primary pipeline-run" id="run-intelligence" type="button">Run real paddock pipeline</button>
        <div id="intelligence-results"></div>

        <section class="pipeline-card outcome-card">
          <div class="panel-heading"><div><p class="eyebrow">LEARNING LOOP</p><h2>Record the treatment outcome</h2></div><span id="outcome-count" class="status-chip status-draft">Loading records</span></div>
          <form id="outcome-form">
            <div class="field-row">
              <label>Paddock name<input id="outcome-paddock" placeholder="e.g. North flats" /></label>
              <label>Crop or pasture<input id="outcome-crop" placeholder="e.g. Wheat" /></label>
            </div>
            <div class="field-row">
              <label>Treatment<select id="outcome-product"><option>Activate</option><option>Energise</option><option>Other</option></select></label>
              <label>Treatment date<input id="outcome-date" type="date" /></label>
            </div>
            <div class="field-row">
              <label>Rate<input id="outcome-rate" type="number" min="0" step="any" /></label>
              <label>Rate unit<input id="outcome-rate-unit" value="L/ha" /></label>
            </div>
            <div class="field-row">
              <label>Yield<input id="outcome-yield" type="number" step="any" placeholder="Optional" /></label>
              <label>Yield unit<input id="outcome-yield-unit" value="t/ha" /></label>
            </div>
            <div class="field-row">
              <label>NDVI before<input id="outcome-ndvi-before" type="number" min="-1" max="1" step="0.001" placeholder="Optional" /></label>
              <label>NDVI after<input id="outcome-ndvi-after" type="number" min="-1" max="1" step="0.001" placeholder="Optional" /></label>
            </div>
            <div class="field-row">
              <label>Input cost (AUD)<input id="outcome-cost" type="number" min="0" step="0.01" placeholder="Optional" /></label>
              <label>Revenue change (AUD)<input id="outcome-revenue" type="number" step="0.01" placeholder="Optional" /></label>
            </div>
            <label>Outcome notes<textarea id="outcome-notes" rows="3" placeholder="Timing, rainfall, observations, comparison area or other context"></textarea></label>
            <button class="button button-primary" id="save-outcome" type="submit">Save outcome record</button>
          </form>
        </section>
      </div>

      <aside class="pipeline-sidebar">
        <section class="pipeline-card sticky-card">
          <p class="eyebrow">LIVE SOURCES</p>
          <h2>Transparent by design</h2>
          <ol class="pipeline-steps">
            <li><span>1</span><div><strong>Polygon</strong><small>The mapped paddock boundary.</small></div></li>
            <li><span>2</span><div><strong>TERN soil grid</strong><small>Topsoil priors sampled across the polygon.</small></div></li>
            <li><span>3</span><div><strong>DEA satellite history</strong><small>Paddock NDVI derived from Sentinel‑2 10 m red and NIR.</small></div></li>
            <li><span>4</span><div><strong>SILO climate</strong><small>Rainfall and temperature for the centroid.</small></div></li>
            <li><span>5</span><div><strong>Measured soil test</strong><small>Lab data takes precedence by analyte.</small></div></li>
            <li><span>6</span><div><strong>Controlled rules</strong><small>Rates remain locked until approved.</small></div></li>
          </ol>
        </section>
      </aside>
    </section>`;

  const query = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing intelligence element: ${selector}`);
    return element;
  };
  let soilTest: SoilTestExtraction | undefined;

  const refreshBoundaryStatus = (): void => {
    const polygon = getPolygon();
    query<HTMLElement>('#intelligence-boundary-status').textContent = polygon
      ? `${Math.max(0, (polygon.coordinates[0]?.length ?? 1) - 1)} boundary points ready for analysis.`
      : 'Return to the planner and draw a paddock.';
    query<HTMLInputElement>('#outcome-paddock').value ||= getPaddockName();
  };
  root.addEventListener('viewshown', refreshBoundaryStatus);
  refreshBoundaryStatus();

  void fetch('/api/health').then(async (response) => {
    if (!response.ok) throw new Error('Data service unavailable');
    const health = await response.json() as { providers: { silo: string } };
    const badge = query<HTMLElement>('#api-health');
    badge.textContent = health.providers.silo === 'configured' ? 'Data service ready' : 'Ready · SILO needs email';
    badge.className = `status-chip ${health.providers.silo === 'configured' ? 'status-ready' : 'status-draft'}`;
  }).catch(() => {
    query<HTMLElement>('#api-health').textContent = 'Start data service';
  });

  query<HTMLInputElement>('#soil-test-upload').addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const container = query<HTMLElement>('#soil-test-results');
    container.innerHTML = '<p class="loading-state">Extracting laboratory values…</p>';
    try {
      const response = await fetch('/api/soil-tests/extract', {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream', 'x-file-name': encodeURIComponent(file.name) },
        body: file,
      });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Extraction failed.');
      soilTest = await response.json() as SoilTestExtraction;
      container.innerHTML = `
        <div class="soil-upload-summary"><strong>${escapeHtml(soilTest.filename)}</strong><span>${soilTest.values.length} values extracted</span></div>
        ${analyteTable(soilTest.values)}
        <ul class="warning-list">${soilTest.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>`;
      notify('Soil report extracted. Check every value before use.');
    } catch (error) {
      container.innerHTML = `<p class="error-state">${escapeHtml(error instanceof Error ? error.message : 'Soil-test extraction failed.')}</p>`;
    }
  });

  const runPipeline = async (viewOverride?: 'adviser' | 'public'): Promise<PaddockIntelligenceResponse | null> => {
    const polygon = getPolygon();
    if (!polygon) {
      notify('Draw a paddock boundary before running the data pipeline.');
      return null;
    }
    const button = query<HTMLButtonElement>('#run-intelligence');
    const results = query<HTMLElement>('#intelligence-results');
    button.disabled = true;
    button.textContent = 'Sampling Australian datasets…';
    results.innerHTML = '<section class="pipeline-card loading-state">DEA raster sampling and TERN grid queries can take a minute for a new paddock.</section>';
    try {
      const response = await fetch('/api/intelligence/paddock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          polygon,
          startDate: query<HTMLInputElement>('#intelligence-start-date').value,
          endDate: query<HTMLInputElement>('#intelligence-end-date').value,
          view: viewOverride ?? query<HTMLSelectElement>('#intelligence-view-mode').value,
          ...(soilTest ? { soilTest } : {}),
        }),
      });
      if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? 'Pipeline failed.');
      const result = await response.json() as PaddockIntelligenceResponse;
      results.innerHTML = renderResult(result);
      onOverlaysReady?.(result);
      const first = result.vegetation?.observations[0];
      const last = result.vegetation?.observations.at(-1);
      if (first) query<HTMLInputElement>('#outcome-ndvi-before').value = first.meanNdvi.toFixed(3);
      if (last) query<HTMLInputElement>('#outcome-ndvi-after').value = last.meanNdvi.toFixed(3);
      notify('Paddock intelligence refreshed from the available live sources.');
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Paddock pipeline failed.';
      results.innerHTML = `<section class="pipeline-card error-state">${escapeHtml(message)}</section>`;
      notify(message);
      return null;
    } finally {
      button.disabled = false;
      button.textContent = 'Run real paddock pipeline';
    }
  };

  query<HTMLButtonElement>('#run-intelligence').addEventListener('click', () => {
    void runPipeline();
  });

  const refreshOutcomeCount = (): void => {
    void fetch('/api/outcomes').then(async (response) => {
      if (!response.ok) throw new Error('Unavailable');
      const payload = await response.json() as { count: number };
      query<HTMLElement>('#outcome-count').textContent = `${payload.count} stored outcome${payload.count === 1 ? '' : 's'}`;
    }).catch(() => {
      query<HTMLElement>('#outcome-count').textContent = 'Local service required';
    });
  };
  refreshOutcomeCount();

  query<HTMLFormElement>('#outcome-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const polygon = getPolygon();
    if (!polygon) {
      notify('Draw or load the paddock boundary before recording an outcome.');
      return;
    }
    const numberOrNull = (selector: string): number | null => {
      const value = query<HTMLInputElement>(selector).value.trim();
      return value === '' ? null : Number(value);
    };
    const inputCostAud = numberOrNull('#outcome-cost');
    const revenueChangeAud = numberOrNull('#outcome-revenue');
    const outcome: OutcomeRecord = {
      id: crypto.randomUUID(),
      paddockName: query<HTMLInputElement>('#outcome-paddock').value.trim(),
      polygon,
      treatmentProduct: query<HTMLSelectElement>('#outcome-product').value as OutcomeRecord['treatmentProduct'],
      treatmentRate: Number(query<HTMLInputElement>('#outcome-rate').value),
      treatmentRateUnit: query<HTMLInputElement>('#outcome-rate-unit').value.trim(),
      treatmentDate: query<HTMLInputElement>('#outcome-date').value,
      crop: query<HTMLInputElement>('#outcome-crop').value.trim(),
      yieldValue: numberOrNull('#outcome-yield'),
      yieldUnit: query<HTMLInputElement>('#outcome-yield-unit').value.trim(),
      followUpSoilTest: soilTest ?? null,
      ndviBefore: numberOrNull('#outcome-ndvi-before'),
      ndviAfter: numberOrNull('#outcome-ndvi-after'),
      inputCostAud,
      revenueChangeAud,
      roiPercent: calculateRoiPercent(inputCostAud, revenueChangeAud),
      notes: query<HTMLTextAreaElement>('#outcome-notes').value.trim(),
      recordedAt: new Date().toISOString(),
    };
    try {
      const response = await fetch('/api/outcomes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(outcome),
      });
      const payload = await response.json() as { error?: string; errors?: string[] };
      if (!response.ok) throw new Error(payload.errors?.join(' ') ?? payload.error ?? 'Outcome could not be saved.');
      query<HTMLFormElement>('#outcome-form').reset();
      query<HTMLInputElement>('#outcome-paddock').value = getPaddockName();
      refreshOutcomeCount();
      notify('Outcome saved to the local proprietary learning register.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Outcome could not be saved.');
    }
  });

  return { run: runPipeline };
}
