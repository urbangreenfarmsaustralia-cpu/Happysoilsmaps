import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import {
  calculateApplication,
  calculateOperations,
  formatQuantity,
  isAustralianPostcode,
  polygonAreaHectares,
  type ApplicationResult,
  type OperationalResult,
  type RateUnit,
} from './calculations';
import { filterPlans, summarisePlans } from './dashboard';
import { createPlanCsv } from './export';
import {
  loadPlans,
  normalisePlan,
  storePlans,
  type PlanStatus,
  type SavedPlan,
} from './storage';
import {
  createReviewCsv,
  validateFarmInputReview,
  type FarmInputReview,
} from './review';
import { ensureClosedPolygon } from './geometry';
import { mountIntelligenceUi } from './intelligence-ui';
import type { MapOverlayData, PaddockIntelligenceResponse, PaddockPolygon, SoilAnalyteKey, SoilValue } from './intelligence-types';
import { ndviColour, type NdviDisplayMode } from './ndvi';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root was not found.');

const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character] ?? character);

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Happy Soils Maps home">
      <span class="brand-mark" aria-hidden="true"><span></span></span>
      <span><strong>Happy Soils</strong><small>Maps & paddock intelligence</small></span>
    </a>
    <nav class="workspace-nav" aria-label="Workspace views">
      <button class="nav-button active" type="button" data-view="planner">Field planner</button>
      <button class="nav-button" type="button" data-view="intelligence">Paddock intelligence</button>
      <button class="nav-button" type="button" data-view="library">Plan library</button>
      <button class="nav-button" type="button" data-view="review">Input review</button>
    </nav>
    <div class="topbar-actions">
      <span class="privacy-pill"><i></i> Private workspace</span>
      <button class="button button-ghost" id="import-button" type="button">Import</button>
      <button class="button button-ghost" id="new-plan" type="button">New plan</button>
      <button class="button button-primary" id="save-plan" type="button">Save plan</button>
    </div>
  </header>

  <input id="import-plan" type="file" accept="application/json,.json" hidden />

  <main class="workspace" id="planner-view" data-view-panel="planner">
    <aside class="planner" aria-label="Application plan">
      <section class="intro">
        <p class="eyebrow">FIELD PLANNER</p>
        <h1>Turn a paddock into a practical application plan.</h1>
        <p>Sketch the boundary, enter an approved rate and get a clear quantity and pack estimate.</p>
      </section>

      <form id="plan-form" novalidate>
        <section class="form-section">
          <div class="section-heading"><span>1</span><div><h2>Paddock details</h2><p>Name the job and confirm the area.</p></div></div>
          <label>Paddock name<input id="paddock-name" name="paddockName" placeholder="e.g. North flats" autocomplete="off" /></label>
          <label>Property or farm name<input id="property-name" name="propertyName" placeholder="e.g. Gumtree Farm" autocomplete="organization" /></label>
          <label>Street or rural address<input id="street-address" name="streetAddress" placeholder="e.g. 125 Example Road" autocomplete="street-address" /></label>
          <div class="address-row">
            <label>Locality or town<input id="locality" name="locality" placeholder="e.g. Griffith" autocomplete="address-level2" /></label>
            <label>State
              <select id="state" name="state" autocomplete="address-level1">
                <option value="">Select</option>
                <option>ACT</option>
                <option>NSW</option>
                <option>NT</option>
                <option>QLD</option>
                <option>SA</option>
                <option>TAS</option>
                <option>VIC</option>
                <option>WA</option>
              </select>
            </label>
            <label>Postcode<input id="postcode" name="postcode" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="0000" autocomplete="postal-code" /></label>
          </div>
          <div class="address-map-actions">
            <button id="find-address" class="button button-ghost" type="button"><span aria-hidden="true">⌖</span> Find address on map</button>
            <span id="address-map-status" role="status">Enter an Australian address, locality or postcode.</span>
          </div>
          <div id="address-search-results" class="address-search-results hidden"></div>
          <p class="address-note"><span aria-hidden="true">⌂</span><span>The address stays on this device until you choose “Find address on map”. That lookup is sent to OpenStreetMap’s address service. Do not search confidential addresses.</span></p>
          <div class="field-row">
            <label>Agricultural region<input id="region" name="region" placeholder="e.g. Riverina" autocomplete="off" /></label>
            <label>Farming system
              <select id="farming-system" name="farmingSystem">
                <option>Pasture & livestock</option>
                <option>Broadacre</option>
                <option>Horticulture</option>
                <option>Mixed farming</option>
                <option>Other</option>
              </select>
            </label>
          </div>
          <div class="field-row">
            <label>Job status
              <select id="plan-status" name="planStatus">
                <option value="draft">Draft</option>
                <option value="ready">Ready to apply</option>
                <option value="completed">Completed</option>
              </select>
            </label>
            <label>Scheduled date<input id="scheduled-date" name="scheduledDate" type="date" /></label>
          </div>
          <label>Area
            <div class="input-unit"><input id="area" name="area" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0.00" /><span>ha</span></div>
            <small class="field-help" id="area-help">Draw the paddock or enter a known area.</small>
          </label>
        </section>

        <section class="form-section">
          <div class="section-heading"><span>2</span><div><h2>Application details</h2><p>Use the current label or adviser-approved rate.</p></div></div>
          <label>Product or input<input id="product-name" name="productName" placeholder="Product name" autocomplete="off" /></label>
          <div class="field-row rate-row">
            <label>Approved rate<input id="rate" name="rate" type="number" min="0" step="any" inputmode="decimal" placeholder="0" /></label>
            <label>Unit
              <select id="rate-unit" name="rateUnit">
                <option value="L/ha">L/ha</option>
                <option value="mL/ha">mL/ha</option>
                <option value="kg/ha">kg/ha</option>
                <option value="g/ha">g/ha</option>
              </select>
            </label>
          </div>
          <div class="field-row">
            <label>Applications<input id="applications" name="applications" type="number" min="1" step="1" value="1" inputmode="numeric" /></label>
            <label>Operational allowance
              <div class="input-unit"><input id="allowance" name="allowance" type="number" min="0" max="25" step="0.5" value="3" inputmode="decimal" /><span>%</span></div>
            </label>
          </div>
          <label>Pack size
            <div class="input-unit"><input id="pack-size" name="packSize" type="number" min="0" step="any" inputmode="decimal" placeholder="Optional" /><span id="pack-unit">L</span></div>
          </label>
          <div class="field-row">
            <label>Cost per pack
              <div class="input-unit input-unit-prefix"><input id="cost-per-pack" name="costPerPack" type="number" min="0" step="0.01" inputmode="decimal" placeholder="Optional" /><span>$</span></div>
            </label>
            <label>Water or carrier rate
              <div class="input-unit"><input id="water-rate" name="waterRate" type="number" min="0" step="any" inputmode="decimal" placeholder="Optional" /><span>L/ha</span></div>
            </label>
          </div>
          <label>Tank capacity
            <div class="input-unit"><input id="tank-capacity" name="tankCapacity" type="number" min="0" step="any" inputmode="decimal" placeholder="Optional" /><span>L</span></div>
            <small class="field-help">Operational estimates are indicative only. Confirm equipment capacity and calibration.</small>
          </label>
          <label>Job notes<textarea id="notes" name="notes" rows="3" placeholder="Timing, equipment, access or weather notes"></textarea></label>
        </section>
      </form>

      <section class="result-card" aria-live="polite">
        <div class="result-title"><span>PLAN ESTIMATE</span><span id="result-status">Waiting for details</span></div>
        <div class="result-main"><strong id="total-quantity">—</strong><span id="total-unit">total product</span></div>
        <div class="result-grid">
          <div><span>Per application</span><strong id="per-application">—</strong></div>
          <div><span>Allowance</span><strong id="allowance-quantity">—</strong></div>
          <div><span>Whole packs</span><strong id="packs-required">—</strong></div>
        </div>
        <div class="operations-grid">
          <div><span>Estimated input cost</span><strong id="estimated-cost">—</strong></div>
          <div><span>Total carrier</span><strong id="total-carrier">—</strong></div>
          <div><span>Total tank loads</span><strong id="tank-loads">—</strong></div>
        </div>
        <div class="result-actions">
          <button type="button" class="button button-light" id="export-csv">Export summary</button>
          <button type="button" class="button button-outline-light" id="export-json">Export full plan</button>
          <button type="button" class="button button-outline-light" id="print-plan">Print</button>
        </div>
      </section>

      <section class="safety-card">
        <div class="safety-icon" aria-hidden="true">!</div>
        <div><h2>Before you apply</h2><p>This is a planning estimate, not a rate recommendation. Confirm the current label, calibration, PPE, weather, withholding requirements and sensitive-area buffers.</p></div>
      </section>

      <section class="saved-section">
        <div class="saved-heading"><h2>Saved plans</h2><span id="saved-count">0</span></div>
        <div id="saved-plans" class="saved-plans"><p class="empty-state">Your saved plans will appear here.</p></div>
      </section>
    </aside>

    <section class="map-shell" aria-label="Paddock map">
      <div id="map"></div>
      <div class="map-toolbar" role="toolbar" aria-label="Map drawing tools">
        <button id="locate" class="map-button" type="button" title="Use my location"><span aria-hidden="true">⌖</span><span>Locate</span></button>
        <button id="draw" class="map-button map-button-accent" type="button"><span aria-hidden="true">◇</span><span>Draw paddock</span></button>
        <button id="undo-point" class="map-button" type="button" disabled><span aria-hidden="true">↶</span><span>Undo point</span></button>
        <button id="finish-drawing" class="map-button" type="button" disabled><span aria-hidden="true">✓</span><span>Finish</span></button>
        <button id="clear-map" class="map-button map-button-danger" type="button"><span aria-hidden="true">×</span><span>Clear</span></button>
      </div>
      <section class="data-layer-panel" aria-label="Paddock data layers">
        <div class="data-layer-heading"><div><span>LIVE PADDOCK DATA</span><strong>Field overlays</strong></div><button class="layer-open-button" type="button" data-view="intelligence">Details</button></div>
        <button id="run-real-paddock" class="layer-run-button" type="button" disabled><span aria-hidden="true">▶</span> Run real paddock</button>
        <small class="layer-run-disclosure">Runs here without changing pages. The boundary is sent to Australian data services.</small>
        <label class="layer-toggle"><input id="layer-ndvi" type="checkbox" checked disabled /><span class="layer-swatch layer-swatch-ndvi"></span><span><strong>DEA vegetation</strong><small>Sentinel‑2 NDVI · 10 m source</small></span></label>
        <select id="layer-ndvi-style" aria-label="NDVI colour scale" disabled>
          <option value="contrast">Field contrast — reveal variation</option>
          <option value="absolute">Absolute NDVI — compare fields</option>
        </select>
        <label class="layer-toggle"><input id="layer-soil" type="checkbox" checked disabled /><span class="layer-swatch layer-swatch-soil"></span><span><strong>TERN soil grid</strong><small>Sampled topsoil priors</small></span></label>
        <select id="layer-soil-analyte" aria-label="Soil grid analyte" disabled>
          <option value="ph">pH (CaCl₂)</option>
          <option value="organicCarbon">Organic carbon</option>
          <option value="cec">CEC</option>
          <option value="phosphorus">Total phosphorus</option>
        </select>
        <label class="layer-toggle"><input id="layer-climate" type="checkbox" checked disabled /><span class="layer-swatch layer-swatch-climate"></span><span><strong>SILO climate</strong><small>Paddock-centroid rainfall</small></span></label>
        <div id="layer-legend" class="layer-legend hidden"></div>
        <p id="layer-status">Draw and finish a boundary, then select Run real paddock.</p>
      </section>
      <div class="map-tip" id="map-tip"><strong>Start here</strong><span>Select “Draw paddock”, then click each corner of the boundary.</span></div>
      <div class="area-badge">
        <span>MAPPED AREA</span>
        <strong id="mapped-area">0.00 <small>ha</small></strong>
        <em id="point-count">No boundary drawn</em>
      </div>
    </section>
  </main>

  <main class="page-view hidden" id="intelligence-view" data-view-panel="intelligence"></main>

  <main class="page-view hidden" id="library-view" data-view-panel="library">
    <section class="page-hero">
      <div><p class="eyebrow">PLAN LIBRARY</p><h1>See every paddock job in one place.</h1><p>Track draft, ready and completed plans without sending farm data off this device.</p></div>
      <button class="button button-primary" type="button" data-view="planner">Create a plan</button>
    </section>
    <section class="summary-grid" aria-label="Plan summary">
      <article><span>Saved plans</span><strong id="summary-total-plans">0</strong><small>All paddock jobs</small></article>
      <article><span>Planned area</span><strong id="summary-total-area">0 ha</strong><small>Across saved plans</small></article>
      <article><span>Ready</span><strong id="summary-ready">0</strong><small>Prepared for review</small></article>
      <article><span>Scheduled</span><strong id="summary-scheduled">0</strong><small>Open scheduled jobs</small></article>
      <article><span>Completed</span><strong id="summary-completed">0</strong><small>Finished records</small></article>
    </section>
    <section class="library-card">
      <div class="library-toolbar">
        <label>Search plans<input id="plan-search" type="search" placeholder="Paddock, property, region or product" /></label>
        <label>Status
          <select id="plan-status-filter">
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="ready">Ready</option>
            <option value="completed">Completed</option>
          </select>
        </label>
      </div>
      <div id="library-list" class="library-list"><p class="empty-state">No saved plans yet.</p></div>
    </section>
  </main>

  <main class="page-view hidden" id="review-view" data-view-panel="review">
    <section class="review-layout">
      <div class="review-form-card">
        <div class="page-hero page-hero-compact">
          <div><p class="eyebrow">FARM INPUT REVIEW</p><h1>Prepare a useful farm brief.</h1><p>Capture the essentials for a focused conversation with Happy Soils or an adviser.</p></div>
        </div>
        <form id="review-form" novalidate>
          <div class="field-row">
            <label>Contact name<input id="review-contact" autocomplete="name" placeholder="Full name" /></label>
            <label>Property or business<input id="review-property" autocomplete="organization" placeholder="Farm or business name" /></label>
          </div>
          <div class="field-row">
            <label>Email<input id="review-email" type="email" autocomplete="email" placeholder="name@example.com" /></label>
            <label>Phone<input id="review-phone" type="tel" autocomplete="tel" placeholder="04xx xxx xxx" /></label>
          </div>
          <div class="address-row">
            <label>Region<input id="review-region" placeholder="e.g. Riverina" /></label>
            <label>State
              <select id="review-state">
                <option value="">Select</option><option>ACT</option><option>NSW</option><option>NT</option><option>QLD</option><option>SA</option><option>TAS</option><option>VIC</option><option>WA</option>
              </select>
            </label>
            <label>Postcode<input id="review-postcode" inputmode="numeric" maxlength="4" placeholder="0000" /></label>
          </div>
          <div class="field-row">
            <label>Farming system
              <select id="review-farming-system">
                <option>Pasture & livestock</option><option>Broadacre</option><option>Horticulture</option><option>Mixed farming</option><option>Other</option>
              </select>
            </label>
            <label>Hectares under review<input id="review-hectares" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0" /></label>
          </div>
          <label>Current inputs or program<textarea id="review-inputs" rows="3" placeholder="What is currently used, how often, and where?"></textarea></label>
          <label>Main soil or input constraint<textarea id="review-constraint" rows="3" placeholder="What outcome or constraint should the review focus on?"></textarea></label>
          <div class="field-row">
            <label>Soil test availability
              <select id="review-soil-test"><option value="available">Available</option><option value="not-available">Not available</option><option value="unsure">Unsure</option></select>
            </label>
            <label>Preferred contact
              <select id="review-preferred-contact"><option value="phone">Phone</option><option value="email">Email</option></select>
            </label>
          </div>
          <label>Additional notes<textarea id="review-notes" rows="3" placeholder="Timing, recent changes or other context"></textarea></label>
          <div class="review-actions">
            <button class="button button-primary" id="download-review-json" type="button">Download full brief</button>
            <button class="button button-ghost" id="download-review-csv" type="button">Download summary</button>
            <button class="button button-ghost" id="clear-review" type="button">Clear</button>
          </div>
        </form>
      </div>
      <aside class="review-guidance">
        <span class="privacy-pill"><i></i> Private by default</span>
        <h2>A review brief, not an agronomic diagnosis.</h2>
        <p>This form organises the information needed for a productive first conversation. It does not recommend rates, products or treatment programs.</p>
        <ul>
          <li>Region, farming system and hectares</li>
          <li>Current inputs and the main constraint</li>
          <li>Whether soil-test information is available</li>
          <li>Preferred contact method</li>
        </ul>
        <div class="guidance-note"><strong>No automatic submission</strong><span>Download the brief and choose when and how to share it. Contact details remain in this form only until exported.</span></div>
      </aside>
    </section>
  </main>

  <div class="toast" id="toast" role="status" aria-live="polite"></div>
`;

const get = <T extends HTMLElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
};

const areaInput = get<HTMLInputElement>('#area');
const rateInput = get<HTMLInputElement>('#rate');
const rateUnitInput = get<HTMLSelectElement>('#rate-unit');
const applicationsInput = get<HTMLInputElement>('#applications');
const allowanceInput = get<HTMLInputElement>('#allowance');
const packSizeInput = get<HTMLInputElement>('#pack-size');
const costPerPackInput = get<HTMLInputElement>('#cost-per-pack');
const waterRateInput = get<HTMLInputElement>('#water-rate');
const tankCapacityInput = get<HTMLInputElement>('#tank-capacity');
const planStatusInput = get<HTMLSelectElement>('#plan-status');
const scheduledDateInput = get<HTMLInputElement>('#scheduled-date');
const form = get<HTMLFormElement>('#plan-form');
const drawButton = get<HTMLButtonElement>('#draw');
const undoButton = get<HTMLButtonElement>('#undo-point');
const finishButton = get<HTMLButtonElement>('#finish-drawing');
const mapTip = get<HTMLDivElement>('#map-tip');
const toast = get<HTMLDivElement>('#toast');
const runRealPaddockButton = get<HTMLButtonElement>('#run-real-paddock');

const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([-27.5, 134], 4);
const ndviRenderer = L.canvas({ padding: 0.2 });
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20,
  subdomains: 'abc',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

const ndviLayer = L.layerGroup().addTo(map);
const soilLayer = L.layerGroup().addTo(map);
const climateLayer = L.layerGroup().addTo(map);
const addressLayer = L.layerGroup().addTo(map);
const ndviToggle = get<HTMLInputElement>('#layer-ndvi');
const ndviStyle = get<HTMLSelectElement>('#layer-ndvi-style');
const soilToggle = get<HTMLInputElement>('#layer-soil');
const climateToggle = get<HTMLInputElement>('#layer-climate');
const soilAnalyte = get<HTMLSelectElement>('#layer-soil-analyte');
const layerLegend = get<HTMLElement>('#layer-legend');
const layerStatus = get<HTMLElement>('#layer-status');
const findAddressButton = get<HTMLButtonElement>('#find-address');
const addressMapStatus = get<HTMLElement>('#address-map-status');
const addressSearchResults = get<HTMLElement>('#address-search-results');

interface AddressCandidate {
  label: string;
  latitude: number;
  longitude: number;
  boundingBox: [number, number, number, number] | null;
}

let drawing = false;
let vertices: L.LatLng[] = [];
let pointMarkers: L.CircleMarker[] = [];
let boundary: L.Polygon | null = null;
let guideLine: L.Polyline | null = null;
let activePlanId: string | null = null;
let currentResult: ApplicationResult | null = null;
let currentOperations: OperationalResult | null = null;
let latestOverlays: MapOverlayData | null = null;
let addressCandidates: AddressCandidate[] = [];
const overlayStorageKey = 'happy-soils-latest-map-overlay-v1';

interface CachedMapOverlay {
  version: 1;
  generatedAt: string;
  polygon: PaddockPolygon;
  overlays: MapOverlayData;
}

const soilColour = (value: number, minimum: number, maximum: number): string => {
  const range = Math.max(0.0001, maximum - minimum);
  const ratio = Math.max(0, Math.min(1, (value - minimum) / range));
  return `hsl(${35 + ratio * 92} 58% ${48 - ratio * 10}%)`;
};

const resetMapOverlays = (): void => {
  latestOverlays = null;
  localStorage.removeItem(overlayStorageKey);
  ndviLayer.clearLayers();
  soilLayer.clearLayers();
  climateLayer.clearLayers();
  ndviToggle.disabled = true;
  ndviStyle.disabled = true;
  soilToggle.disabled = true;
  climateToggle.disabled = true;
  soilAnalyte.disabled = true;
  layerLegend.classList.add('hidden');
  layerStatus.textContent = 'Select Run real paddock to load overlays for this boundary.';
};

const renderMapOverlays = (): void => {
  ndviLayer.clearLayers();
  soilLayer.clearLayers();
  climateLayer.clearLayers();
  const overlays = latestOverlays;
  if (!overlays) return;
  const ndvi = overlays.ndvi;
  const soilSamples = overlays.soilSamples;
  const climate = overlays.climatePoint;
  ndviToggle.disabled = !ndvi?.cells.length;
  ndviStyle.disabled = !ndvi?.cells.length || !ndviToggle.checked;
  soilToggle.disabled = soilSamples.length === 0;
  climateToggle.disabled = !climate;
  soilAnalyte.disabled = soilSamples.length === 0 || !soilToggle.checked;

  if (ndvi && ndviToggle.checked) {
    const displayMode = ndviStyle.value as NdviDisplayMode;
    for (const cell of ndvi.cells) {
      L.polygon(cell.coordinates.map(([longitude, latitude]) => [latitude, longitude]), {
        renderer: ndviRenderer,
        stroke: false,
        fillColor: ndviColour(cell.value, displayMode, ndvi.minimum, ndvi.maximum),
        fillOpacity: 0.78,
        interactive: true,
      }).bindTooltip(`<strong>NDVI ${cell.value.toFixed(3)}</strong><br>${ndvi.date} · ${ndvi.platform ?? 'Sentinel-2'}<br>${(ndvi.nativeResolutionMetres ?? 10).toFixed(0)} m source · ${(ndvi.validClearPercent ?? 0).toFixed(0)}% clear`, { sticky: true }).addTo(ndviLayer);
    }
  }

  const selectedAnalyte = soilAnalyte.value as SoilAnalyteKey;
  const selectedValues = soilSamples
    .map((sample) => sample.values.find((value) => value.key === selectedAnalyte))
    .filter((value): value is SoilValue => Boolean(value));
  if (soilToggle.checked && selectedValues.length) {
    const minimum = Math.min(...selectedValues.map((value) => value.value));
    const maximum = Math.max(...selectedValues.map((value) => value.value));
    for (const sample of soilSamples) {
      const value = sample.values.find((candidate) => candidate.key === selectedAnalyte);
      if (!value) continue;
      L.circleMarker([sample.coordinate[1], sample.coordinate[0]], {
        radius: 9,
        color: '#ffffff',
        weight: 2,
        fillColor: soilColour(value.value, minimum, maximum),
        fillOpacity: 0.95,
      }).bindTooltip(`<strong>${value.label}</strong><br>${value.value.toFixed(2)} ${value.unit}<br>${value.depth ?? 'TERN modelled prior'}`, { direction: 'top' }).addTo(soilLayer);
    }
  }

  if (climate && climateToggle.checked) {
    L.circleMarker([climate.coordinate[1], climate.coordinate[0]], {
      radius: 11,
      color: '#ffffff',
      weight: 3,
      fillColor: '#3479ad',
      fillOpacity: 1,
    }).bindTooltip(`<strong>SILO rainfall</strong><br>${climate.rainfallMm.toFixed(0)} mm total<br>${climate.recent30DayRainfallMm.toFixed(0)} mm in the last 30 days<br>${climate.rainDays} rain days`, { direction: 'top' }).addTo(climateLayer);
  }

  const active: string[] = [];
  if (ndvi?.cells.length) {
    const nativeResolution = ndvi.nativeResolutionMetres ?? 10;
    const displayResolution = ndvi.displayResolutionMetres ?? nativeResolution;
    const displayNote = displayResolution > nativeResolution + 1 ? ` · ${displayResolution.toFixed(0)} m display` : '';
    active.push(`${ndvi.cells.length} NDVI cells from ${ndvi.date} · ${nativeResolution} m source${displayNote}`);
  }
  if (soilSamples.length) active.push(`${soilSamples.length} soil samples`);
  if (climate) active.push('SILO rainfall point');
  layerStatus.textContent = active.length ? active.join(' · ') : 'No spatial overlay data was available for this run.';
  if (ndvi && ndviToggle.checked) {
    const contrast = ndviStyle.value === 'contrast';
    layerLegend.innerHTML = `<span>${contrast ? 'Field contrast' : 'Absolute NDVI'}</span><i class="ndvi-ramp"></i><small>${contrast ? ndvi.minimum.toFixed(2) : '-0.10'}</small><small>${contrast ? ndvi.maximum.toFixed(2) : '0.80+'}</small>`;
    layerLegend.classList.remove('hidden');
  } else if (soilToggle.checked && selectedValues.length) {
    const minimum = Math.min(...selectedValues.map((value) => value.value));
    const maximum = Math.max(...selectedValues.map((value) => value.value));
    layerLegend.innerHTML = `<span>${selectedValues[0]?.label ?? 'Soil'}</span><i class="soil-ramp"></i><small>${minimum.toFixed(2)}</small><small>${maximum.toFixed(2)}</small>`;
    layerLegend.classList.remove('hidden');
  } else {
    layerLegend.classList.add('hidden');
  }
  boundary?.bringToFront();
  pointMarkers.forEach((marker) => marker.bringToFront());
};

const cacheMapOverlays = (result: PaddockIntelligenceResponse): void => {
  if (vertices.length < 3) return;
  const hasSpatialData = Boolean(result.overlays.ndvi?.cells.length)
    || result.overlays.soilSamples.length > 0
    || Boolean(result.overlays.climatePoint);
  if (!hasSpatialData) return;
  const cached: CachedMapOverlay = {
    version: 1,
    generatedAt: result.generatedAt,
    polygon: ensureClosedPolygon(vertices.map((point) => [point.lng, point.lat])),
    overlays: result.overlays,
  };
  try {
    localStorage.setItem(overlayStorageKey, JSON.stringify(cached));
  } catch {
    showToast('Layers are visible, but this browser could not retain them for the next visit.');
  }
};

const restoreCachedMapOverlays = (): void => {
  try {
    const stored = localStorage.getItem(overlayStorageKey);
    if (!stored) return;
    const cached = JSON.parse(stored) as CachedMapOverlay;
    const ring = cached.polygon?.coordinates?.[0];
    if (cached.version !== 1 || !ring || ring.length < 4 || !cached.overlays) throw new Error('Invalid overlay cache');
    const openRing = ring[0]?.[0] === ring.at(-1)?.[0] && ring[0]?.[1] === ring.at(-1)?.[1]
      ? ring.slice(0, -1)
      : ring;
    openRing.forEach(([longitude, latitude]) => addVertex(L.latLng(latitude, longitude)));
    finishDrawing();
    latestOverlays = cached.overlays;
    renderMapOverlays();
    map.fitBounds(L.latLngBounds(vertices), { padding: [60, 60] });
    const restoredDate = new Date(cached.generatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
    layerStatus.textContent = `${layerStatus.textContent} · restored ${restoredDate}`;
  } catch {
    localStorage.removeItem(overlayStorageKey);
  }
};

[ndviToggle, soilToggle, climateToggle].forEach((toggle) => toggle.addEventListener('change', renderMapOverlays));
ndviStyle.addEventListener('change', renderMapOverlays);
soilAnalyte.addEventListener('change', renderMapOverlays);

const pinpointAddress = (candidate: AddressCandidate): void => {
  addressLayer.clearLayers();
  const point = L.latLng(candidate.latitude, candidate.longitude);
  L.circle(point, {
    radius: 55,
    color: '#f5c85a',
    weight: 2,
    fillColor: '#f5c85a',
    fillOpacity: 0.18,
  }).addTo(addressLayer);
  L.circleMarker(point, {
    radius: 9,
    color: '#ffffff',
    weight: 3,
    fillColor: '#193f32',
    fillOpacity: 1,
  }).bindTooltip(`<strong>Address location</strong><br>${escapeHtml(candidate.label)}`, {
    permanent: true,
    direction: 'top',
    offset: [0, -8],
  }).addTo(addressLayer);
  map.setView(point, 17);
  addressMapStatus.textContent = 'Address located. Draw or adjust the paddock boundary nearby.';
  addressSearchResults.querySelectorAll<HTMLButtonElement>('button').forEach((button, index) => {
    button.classList.toggle('selected', addressCandidates[index] === candidate);
  });
};

const resetAddressLookup = (): void => {
  addressCandidates = [];
  addressLayer.clearLayers();
  addressSearchResults.innerHTML = '';
  addressSearchResults.classList.add('hidden');
  addressMapStatus.textContent = 'Enter an Australian address, locality or postcode.';
};

findAddressButton.addEventListener('click', async () => {
  const addressParts = [
    get<HTMLInputElement>('#street-address').value.trim(),
    get<HTMLInputElement>('#locality').value.trim(),
    get<HTMLSelectElement>('#state').value,
    get<HTMLInputElement>('#postcode').value.trim(),
    'Australia',
  ].filter(Boolean);
  if (addressParts.length <= 1) {
    addressMapStatus.textContent = 'Enter a street, locality or postcode first.';
    get<HTMLInputElement>('#street-address').focus();
    return;
  }
  findAddressButton.disabled = true;
  findAddressButton.textContent = 'Finding address…';
  addressMapStatus.textContent = 'Searching Australian addresses…';
  addressSearchResults.classList.add('hidden');
  try {
    const response = await fetch(`/api/geocode/address?q=${encodeURIComponent(addressParts.join(', '))}`);
    const payload = await response.json() as { results?: AddressCandidate[]; attribution?: string; error?: string };
    if (!response.ok) throw new Error(payload.error ?? 'Address lookup failed.');
    addressCandidates = payload.results ?? [];
    if (!addressCandidates.length) {
      addressLayer.clearLayers();
      addressMapStatus.textContent = 'No Australian match was found. Check the street, town, state and postcode.';
      return;
    }
    addressSearchResults.innerHTML = `
      <strong>${addressCandidates.length === 1 ? 'Address match' : 'Choose the correct match'}</strong>
      ${addressCandidates.map((candidate, index) => `<button type="button" data-address-result="${index}">${escapeHtml(candidate.label)}</button>`).join('')}
      <small>${escapeHtml(payload.attribution ?? 'Search results © OpenStreetMap contributors')}</small>`;
    addressSearchResults.classList.remove('hidden');
    pinpointAddress(addressCandidates[0]!);
  } catch (error) {
    addressMapStatus.textContent = error instanceof Error ? error.message : 'Address lookup failed.';
  } finally {
    findAddressButton.disabled = false;
    findAddressButton.innerHTML = '<span aria-hidden="true">⌖</span> Find address on map';
  }
});

addressSearchResults.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-address-result]');
  if (!button) return;
  const candidate = addressCandidates[Number(button.dataset.addressResult)];
  if (candidate) pinpointAddress(candidate);
});

['#street-address', '#locality', '#state', '#postcode'].forEach((selector) => {
  get<HTMLInputElement | HTMLSelectElement>(selector).addEventListener('change', resetAddressLookup);
});

const numberValue = (input: HTMLInputElement): number => {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : 0;
};

const formatCurrency = (value: number): string => new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 2,
}).format(value);

const showToast = (message: string): void => {
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 2600);
};

type ViewName = 'planner' | 'intelligence' | 'library' | 'review';

const setView = (view: ViewName): void => {
  document.querySelectorAll<HTMLElement>('[data-view-panel]').forEach((panel) => {
    panel.classList.toggle('hidden', panel.dataset.viewPanel !== view);
  });
  document.querySelectorAll<HTMLButtonElement>('.workspace-nav [data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === view);
  });
  get<HTMLButtonElement>('#new-plan').classList.toggle('hidden', view !== 'planner');
  get<HTMLButtonElement>('#save-plan').classList.toggle('hidden', view !== 'planner');
  get<HTMLButtonElement>('#import-button').classList.toggle('hidden', view === 'review' || view === 'intelligence');
  if (view === 'library') renderLibrary();
  if (view === 'intelligence') get<HTMLElement>('#intelligence-view').dispatchEvent(new Event('viewshown'));
  if (view === 'planner') window.setTimeout(() => {
    map.invalidateSize();
    if (vertices.length >= 3) map.fitBounds(L.latLngBounds(vertices), { padding: [70, 70] });
  }, 0);
  window.location.hash = view === 'planner' ? '' : view;
};

document.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-view]');
  if (!button) return;
  const view = button.dataset.view;
  if (view === 'planner' || view === 'intelligence' || view === 'library' || view === 'review') setView(view);
});

const updateDrawingControls = (): void => {
  drawButton.classList.toggle('active', drawing);
  const label = drawButton.querySelector('span:last-child');
  if (label) label.textContent = drawing ? 'Adding corners…' : 'Draw paddock';
  undoButton.disabled = vertices.length === 0;
  finishButton.disabled = vertices.length < 3;
  runRealPaddockButton.disabled = drawing || vertices.length < 3;
  map.getContainer().classList.toggle('drawing', drawing);
};

const updateBoundaryDisplay = (): void => {
  guideLine?.remove();
  if (vertices.length > 1) {
    guideLine = L.polyline(vertices, { color: '#f5c85a', weight: 3, dashArray: '7 8' }).addTo(map);
  } else {
    guideLine = null;
  }

  const coordinates = vertices.map((point): [number, number] => [point.lng, point.lat]);
  const hectares = polygonAreaHectares(coordinates);
  get<HTMLElement>('#mapped-area').innerHTML = `${formatQuantity(hectares, 2)} <small>ha</small>`;
  get<HTMLElement>('#point-count').textContent = vertices.length
    ? `${vertices.length} boundary point${vertices.length === 1 ? '' : 's'}`
    : 'No boundary drawn';

  if (vertices.length >= 3) {
    areaInput.value = hectares.toFixed(2);
    get<HTMLElement>('#area-help').textContent = 'Calculated from the mapped boundary. You can adjust it.';
  }
  updateCalculation();
  updateDrawingControls();
};

const addVertex = (latlng: L.LatLng): void => {
  vertices.push(latlng);
  const marker = L.circleMarker(latlng, {
    radius: 6,
    color: '#ffffff',
    weight: 2,
    fillColor: '#f5c85a',
    fillOpacity: 1,
  }).addTo(map);
  pointMarkers.push(marker);
  updateBoundaryDisplay();
};

const clearBoundary = (clearArea = true): void => {
  resetMapOverlays();
  boundary?.remove();
  guideLine?.remove();
  pointMarkers.forEach((marker) => marker.remove());
  boundary = null;
  guideLine = null;
  pointMarkers = [];
  vertices = [];
  drawing = false;
  if (clearArea) areaInput.value = '';
  get<HTMLElement>('#area-help').textContent = 'Draw the paddock or enter a known area.';
  mapTip.innerHTML = '<strong>Start here</strong><span>Select “Draw paddock”, then click each corner of the boundary.</span>';
  updateBoundaryDisplay();
};

const finishDrawing = (): void => {
  if (vertices.length < 3) return;
  guideLine?.remove();
  guideLine = null;
  boundary?.remove();
  boundary = L.polygon(vertices, {
    color: '#f5c85a',
    weight: 3,
    fillColor: '#dce75c',
    fillOpacity: 0.25,
  }).addTo(map);
  pointMarkers.forEach((marker) => marker.bringToFront());
  drawing = false;
  mapTip.innerHTML = '<strong>Boundary ready</strong><span>Review the area, then enter the approved application rate.</span>';
  updateDrawingControls();
};

map.on('click', (event: L.LeafletMouseEvent) => {
  if (drawing) addVertex(event.latlng);
});

drawButton.addEventListener('click', () => {
  if (boundary) clearBoundary();
  drawing = !drawing;
  mapTip.innerHTML = drawing
    ? '<strong>Drawing mode</strong><span>Click each paddock corner, then select “Finish”.</span>'
    : '<strong>Drawing paused</strong><span>Select “Draw paddock” to continue.</span>';
  updateDrawingControls();
});

undoButton.addEventListener('click', () => {
  vertices.pop();
  pointMarkers.pop()?.remove();
  updateBoundaryDisplay();
});

finishButton.addEventListener('click', finishDrawing);
get<HTMLButtonElement>('#clear-map').addEventListener('click', () => {
  clearBoundary();
  resetAddressLookup();
});

get<HTMLButtonElement>('#locate').addEventListener('click', () => {
  if (!navigator.geolocation) {
    showToast('Location is not available in this browser.');
    return;
  }
  showToast('Finding your location…');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      map.flyTo([coords.latitude, coords.longitude], 15);
      showToast('Map centred on your location.');
    },
    () => showToast('Location access was unavailable. You can move the map manually.'),
    { enableHighAccuracy: true, timeout: 10_000 },
  );
});

const updateCalculation = (): void => {
  const rateUnit = rateUnitInput.value as RateUnit;
  get<HTMLElement>('#pack-unit').textContent = rateUnit.startsWith('L') || rateUnit.startsWith('mL') ? 'L' : 'kg';

  try {
    const result = calculateApplication({
      areaHa: numberValue(areaInput),
      ratePerHa: numberValue(rateInput),
      rateUnit,
      applications: Math.max(1, Math.trunc(numberValue(applicationsInput) || 1)),
      allowancePercent: numberValue(allowanceInput),
      packSize: numberValue(packSizeInput),
    });
    currentResult = result;
    const ready = result.totalQuantity > 0;
    get<HTMLElement>('#result-status').textContent = ready ? 'Ready to review' : 'Waiting for details';
    get<HTMLElement>('#total-quantity').textContent = ready ? formatQuantity(result.totalQuantity, 2) : '—';
    get<HTMLElement>('#total-unit').textContent = ready ? `${result.baseUnit} total product` : 'total product';
    get<HTMLElement>('#per-application').textContent = ready
      ? `${formatQuantity(result.quantityPerApplication, 2)} ${result.baseUnit}`
      : '—';
    get<HTMLElement>('#allowance-quantity').textContent = ready
      ? `${formatQuantity(result.allowanceQuantity, 2)} ${result.baseUnit}`
      : '—';
    get<HTMLElement>('#packs-required').textContent = ready && result.packsRequired !== null
      ? String(result.packsRequired)
      : '—';
    currentOperations = calculateOperations({
      areaHa: numberValue(areaInput),
      applications: Math.max(1, Math.trunc(numberValue(applicationsInput) || 1)),
      waterRateLHa: numberValue(waterRateInput),
      tankCapacityL: numberValue(tankCapacityInput),
      packsRequired: result.packsRequired,
      costPerPack: numberValue(costPerPackInput),
    });
    get<HTMLElement>('#estimated-cost').textContent = currentOperations.estimatedInputCost === null
      ? '—'
      : formatCurrency(currentOperations.estimatedInputCost);
    get<HTMLElement>('#total-carrier').textContent = currentOperations.totalCarrierVolumeL > 0
      ? `${formatQuantity(currentOperations.totalCarrierVolumeL, 0)} L`
      : '—';
    get<HTMLElement>('#tank-loads').textContent = currentOperations.totalTankLoads === null
      ? '—'
      : String(currentOperations.totalTankLoads);
  } catch {
    currentResult = null;
    currentOperations = null;
    get<HTMLElement>('#estimated-cost').textContent = '—';
    get<HTMLElement>('#total-carrier').textContent = '—';
    get<HTMLElement>('#tank-loads').textContent = '—';
  }
};

form.addEventListener('input', updateCalculation);

const buildPlan = (): SavedPlan => {
  const now = new Date().toISOString();
  const existing = loadPlans().find((plan) => plan.id === activePlanId);
  return {
    id: activePlanId ?? crypto.randomUUID(),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    paddockName: get<HTMLInputElement>('#paddock-name').value.trim(),
    propertyName: get<HTMLInputElement>('#property-name').value.trim(),
    streetAddress: get<HTMLInputElement>('#street-address').value.trim(),
    locality: get<HTMLInputElement>('#locality').value.trim(),
    state: get<HTMLSelectElement>('#state').value,
    postcode: get<HTMLInputElement>('#postcode').value.trim(),
    region: get<HTMLInputElement>('#region').value.trim(),
    farmingSystem: get<HTMLSelectElement>('#farming-system').value,
    productName: get<HTMLInputElement>('#product-name').value.trim(),
    areaHa: numberValue(areaInput),
    ratePerHa: numberValue(rateInput),
    rateUnit: rateUnitInput.value as RateUnit,
    applications: Math.max(1, Math.trunc(numberValue(applicationsInput) || 1)),
    allowancePercent: numberValue(allowanceInput),
    packSize: numberValue(packSizeInput),
    costPerPack: numberValue(costPerPackInput),
    waterRateLHa: numberValue(waterRateInput),
    tankCapacityL: numberValue(tankCapacityInput),
    scheduledDate: scheduledDateInput.value,
    status: planStatusInput.value as PlanStatus,
    notes: get<HTMLTextAreaElement>('#notes').value.trim(),
    coordinates: vertices.map((point) => ({ lat: point.lat, lng: point.lng })),
  };
};

const validatePlan = (plan: SavedPlan): boolean => {
  if (!plan.paddockName) {
    get<HTMLInputElement>('#paddock-name').focus();
    showToast('Add a paddock name before saving.');
    return false;
  }
  if (plan.areaHa <= 0) {
    areaInput.focus();
    showToast('Draw a paddock or enter an area greater than zero.');
    return false;
  }
  if (!isAustralianPostcode(plan.postcode)) {
    get<HTMLInputElement>('#postcode').focus();
    showToast('Enter the postcode as four digits.');
    return false;
  }
  if (!plan.productName || plan.ratePerHa <= 0) {
    get<HTMLInputElement>('#product-name').focus();
    showToast('Add the product and approved application rate.');
    return false;
  }
  return true;
};

const statusLabel = (status: PlanStatus): string => ({
  draft: 'Draft',
  ready: 'Ready',
  completed: 'Completed',
})[status];

const formatPlanDate = (value: string): string => {
  if (!value) return 'Not scheduled';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf())
    ? 'Not scheduled'
    : new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
};

const renderSavedPlans = (): void => {
  const plans = loadPlans().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  get<HTMLElement>('#saved-count').textContent = String(plans.length);
  const container = get<HTMLDivElement>('#saved-plans');
  if (!plans.length) {
    container.innerHTML = '<p class="empty-state">Your saved plans will appear here.</p>';
    return;
  }
  container.innerHTML = plans.map((plan) => `
    <article class="saved-plan">
      <button type="button" data-load="${plan.id}">
        <span><strong>${escapeHtml(plan.paddockName)}</strong><small>${escapeHtml(plan.productName)} · ${formatQuantity(plan.areaHa)} ha · ${formatPlanDate(plan.scheduledDate)}</small></span>
        <span aria-hidden="true">→</span>
      </button>
      <span class="status-chip status-${plan.status}">${statusLabel(plan.status)}</span>
      <button class="duplicate-plan" type="button" data-duplicate="${plan.id}" aria-label="Duplicate ${escapeHtml(plan.paddockName)}">⧉</button>
      <button class="delete-plan" type="button" data-delete="${plan.id}" aria-label="Delete ${escapeHtml(plan.paddockName)}">×</button>
    </article>
  `).join('');
};

const renderLibrary = (): void => {
  const plans = loadPlans().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const summary = summarisePlans(plans);
  get<HTMLElement>('#summary-total-plans').textContent = String(summary.totalPlans);
  get<HTMLElement>('#summary-total-area').textContent = `${formatQuantity(summary.totalAreaHa, 1)} ha`;
  get<HTMLElement>('#summary-ready').textContent = String(summary.readyPlans);
  get<HTMLElement>('#summary-scheduled').textContent = String(summary.scheduledPlans);
  get<HTMLElement>('#summary-completed').textContent = String(summary.completedPlans);

  const query = get<HTMLInputElement>('#plan-search').value;
  const status = get<HTMLSelectElement>('#plan-status-filter').value as PlanStatus | 'all';
  const filtered = filterPlans(plans, query, status);
  const container = get<HTMLDivElement>('#library-list');
  if (!filtered.length) {
    container.innerHTML = '<p class="empty-state empty-state-large">No plans match this view.</p>';
    return;
  }

  container.innerHTML = filtered.map((plan) => `
    <article class="library-plan">
      <div class="library-plan-main">
        <div class="library-plan-title"><span class="status-chip status-${plan.status}">${statusLabel(plan.status)}</span><h2>${escapeHtml(plan.paddockName)}</h2></div>
        <p>${escapeHtml(plan.propertyName || 'Property not entered')} · ${escapeHtml(plan.region || plan.locality || 'Region not entered')}</p>
        <div class="library-plan-meta"><span>${formatQuantity(plan.areaHa)} ha</span><span>${escapeHtml(plan.productName)}</span><span>${formatPlanDate(plan.scheduledDate)}</span></div>
      </div>
      <div class="library-plan-actions">
        <button class="button button-primary" type="button" data-load="${plan.id}">Open</button>
        <button class="button button-ghost" type="button" data-duplicate="${plan.id}">Duplicate</button>
        <button class="button button-text-danger" type="button" data-delete="${plan.id}">Delete</button>
      </div>
    </article>
  `).join('');
};

const loadPlanIntoForm = (plan: SavedPlan): void => {
  resetAddressLookup();
  activePlanId = plan.id;
  get<HTMLInputElement>('#paddock-name').value = plan.paddockName;
  get<HTMLInputElement>('#property-name').value = plan.propertyName;
  get<HTMLInputElement>('#street-address').value = plan.streetAddress;
  get<HTMLInputElement>('#locality').value = plan.locality;
  get<HTMLSelectElement>('#state').value = plan.state;
  get<HTMLInputElement>('#postcode').value = plan.postcode;
  get<HTMLInputElement>('#region').value = plan.region;
  get<HTMLSelectElement>('#farming-system').value = plan.farmingSystem;
  areaInput.value = String(plan.areaHa);
  get<HTMLInputElement>('#product-name').value = plan.productName;
  rateInput.value = String(plan.ratePerHa);
  rateUnitInput.value = plan.rateUnit;
  applicationsInput.value = String(plan.applications);
  allowanceInput.value = String(plan.allowancePercent);
  packSizeInput.value = plan.packSize ? String(plan.packSize) : '';
  costPerPackInput.value = plan.costPerPack ? String(plan.costPerPack) : '';
  waterRateInput.value = plan.waterRateLHa ? String(plan.waterRateLHa) : '';
  tankCapacityInput.value = plan.tankCapacityL ? String(plan.tankCapacityL) : '';
  scheduledDateInput.value = plan.scheduledDate;
  planStatusInput.value = plan.status;
  get<HTMLTextAreaElement>('#notes').value = plan.notes;
  clearBoundary(false);
  plan.coordinates.forEach((point) => addVertex(L.latLng(point.lat, point.lng)));
  if (vertices.length >= 3) {
    finishDrawing();
    map.fitBounds(L.latLngBounds(vertices), { padding: [48, 48] });
  }
  areaInput.value = String(plan.areaHa);
  updateCalculation();
  setView('planner');
  showToast(`Loaded ${plan.paddockName}.`);
};

const handlePlanAction = (event: Event): void => {
  const target = event.target as HTMLElement;
  const loadButton = target.closest<HTMLButtonElement>('[data-load]');
  const duplicateButton = target.closest<HTMLButtonElement>('[data-duplicate]');
  const deleteButton = target.closest<HTMLButtonElement>('[data-delete]');
  if (loadButton) {
    const plan = loadPlans().find((item) => item.id === loadButton.dataset.load);
    if (plan) loadPlanIntoForm(plan);
  }
  if (duplicateButton) {
    const plan = loadPlans().find((item) => item.id === duplicateButton.dataset.duplicate);
    if (plan) {
      const now = new Date().toISOString();
      const duplicate: SavedPlan = {
        ...plan,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        paddockName: `${plan.paddockName} copy`,
        status: 'draft',
        scheduledDate: '',
      };
      const plans = loadPlans();
      plans.push(duplicate);
      storePlans(plans);
      renderSavedPlans();
      renderLibrary();
      showToast('Plan duplicated as a new draft.');
    }
  }
  if (deleteButton) {
    const updated = loadPlans().filter((item) => item.id !== deleteButton.dataset.delete);
    storePlans(updated);
    if (activePlanId === deleteButton.dataset.delete) activePlanId = null;
    renderSavedPlans();
    renderLibrary();
    showToast('Saved plan deleted.');
  }
};

get<HTMLDivElement>('#saved-plans').addEventListener('click', handlePlanAction);
get<HTMLDivElement>('#library-list').addEventListener('click', handlePlanAction);
get<HTMLInputElement>('#plan-search').addEventListener('input', renderLibrary);
get<HTMLSelectElement>('#plan-status-filter').addEventListener('change', renderLibrary);

get<HTMLButtonElement>('#save-plan').addEventListener('click', () => {
  const plan = buildPlan();
  if (!validatePlan(plan)) return;
  const plans = loadPlans();
  const index = plans.findIndex((item) => item.id === plan.id);
  if (index >= 0) plans[index] = plan;
  else plans.push(plan);
  storePlans(plans);
  activePlanId = plan.id;
  renderSavedPlans();
  renderLibrary();
  showToast('Plan saved on this device.');
});

const resetPlan = (): void => {
  activePlanId = null;
  form.reset();
  applicationsInput.value = '1';
  allowanceInput.value = '3';
  planStatusInput.value = 'draft';
  clearBoundary();
  resetAddressLookup();
  updateCalculation();
  showToast('New plan ready.');
};

get<HTMLButtonElement>('#new-plan').addEventListener('click', resetPlan);

const download = (content: string, filename: string, type: string): void => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const filenameFor = (plan: SavedPlan, extension: string): string => {
  const base = plan.paddockName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'application-plan';
  return `${base}.${extension}`;
};

get<HTMLButtonElement>('#export-json').addEventListener('click', () => {
  const plan = buildPlan();
  if (!validatePlan(plan)) return;
  download(
    JSON.stringify({ plan, estimate: currentResult, operations: currentOperations }, null, 2),
    filenameFor(plan, 'json'),
    'application/json',
  );
  showToast('Full plan exported.');
});

get<HTMLButtonElement>('#export-csv').addEventListener('click', () => {
  const plan = buildPlan();
  if (!validatePlan(plan) || !currentResult) return;
  const csv = createPlanCsv(plan, currentResult, currentOperations);
  download(csv, filenameFor(plan, 'csv'), 'text/csv;charset=utf-8');
  showToast('Plan summary exported.');
});

get<HTMLButtonElement>('#print-plan').addEventListener('click', () => {
  const plan = buildPlan();
  if (!validatePlan(plan)) return;
  document.body.dataset.printTitle = plan.paddockName;
  window.print();
});

const importInput = get<HTMLInputElement>('#import-plan');
get<HTMLButtonElement>('#import-button').addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const file = importInput.files?.[0];
  importInput.value = '';
  if (!file) return;
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const candidate = parsed !== null && typeof parsed === 'object' && 'plan' in parsed
      ? (parsed as { plan: unknown }).plan
      : parsed;
    const imported = normalisePlan(candidate);
    if (!imported || !imported.paddockName) throw new Error('Invalid plan');
    const plans = loadPlans();
    const duplicateId = plans.some((plan) => plan.id === imported.id);
    const now = new Date().toISOString();
    const restored: SavedPlan = {
      ...imported,
      id: duplicateId ? crypto.randomUUID() : imported.id,
      createdAt: duplicateId ? now : imported.createdAt,
      updatedAt: now,
      paddockName: duplicateId ? `${imported.paddockName} imported` : imported.paddockName,
    };
    plans.push(restored);
    storePlans(plans);
    renderSavedPlans();
    renderLibrary();
    loadPlanIntoForm(restored);
    showToast('Plan imported and saved on this device.');
  } catch {
    showToast('That file is not a valid Happy Soils plan.');
  }
});

const reviewForm = get<HTMLFormElement>('#review-form');

const buildReview = (): FarmInputReview => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  contactName: get<HTMLInputElement>('#review-contact').value.trim(),
  email: get<HTMLInputElement>('#review-email').value.trim(),
  phone: get<HTMLInputElement>('#review-phone').value.trim(),
  propertyName: get<HTMLInputElement>('#review-property').value.trim(),
  region: get<HTMLInputElement>('#review-region').value.trim(),
  state: get<HTMLSelectElement>('#review-state').value,
  postcode: get<HTMLInputElement>('#review-postcode').value.trim(),
  farmingSystem: get<HTMLSelectElement>('#review-farming-system').value,
  totalHectares: numberValue(get<HTMLInputElement>('#review-hectares')),
  currentInputs: get<HTMLTextAreaElement>('#review-inputs').value.trim(),
  mainConstraint: get<HTMLTextAreaElement>('#review-constraint').value.trim(),
  soilTestAvailability: get<HTMLSelectElement>('#review-soil-test').value as FarmInputReview['soilTestAvailability'],
  preferredContact: get<HTMLSelectElement>('#review-preferred-contact').value as FarmInputReview['preferredContact'],
  notes: get<HTMLTextAreaElement>('#review-notes').value.trim(),
});

const exportReview = (format: 'json' | 'csv'): void => {
  const review = buildReview();
  const errors = validateFarmInputReview(review);
  if (errors[0]) {
    showToast(errors[0]);
    return;
  }
  const propertySlug = review.propertyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'farm';
  if (format === 'json') {
    download(JSON.stringify({ review }, null, 2), `${propertySlug}-input-review.json`, 'application/json');
  } else {
    download(createReviewCsv(review), `${propertySlug}-input-review.csv`, 'text/csv;charset=utf-8');
  }
  showToast('Farm Input Review brief downloaded.');
};

get<HTMLButtonElement>('#download-review-json').addEventListener('click', () => exportReview('json'));
get<HTMLButtonElement>('#download-review-csv').addEventListener('click', () => exportReview('csv'));
get<HTMLButtonElement>('#clear-review').addEventListener('click', () => {
  reviewForm.reset();
  showToast('Review brief cleared.');
});

const intelligenceUi = mountIntelligenceUi({
  root: get<HTMLElement>('#intelligence-view'),
  getPolygon: () => vertices.length >= 3
    ? ensureClosedPolygon(vertices.map((point) => [point.lng, point.lat]))
    : null,
  getPaddockName: () => get<HTMLInputElement>('#paddock-name').value.trim(),
  notify: showToast,
  onOverlaysReady: (result) => {
    latestOverlays = result.overlays;
    cacheMapOverlays(result);
    renderMapOverlays();
  },
});

runRealPaddockButton.addEventListener('click', async () => {
  if (vertices.length < 3) {
    showToast('Draw and finish the paddock boundary first.');
    return;
  }
  runRealPaddockButton.disabled = true;
  runRealPaddockButton.classList.add('loading');
  runRealPaddockButton.innerHTML = '<span aria-hidden="true">◌</span> Sampling paddock…';
  layerStatus.textContent = 'Sampling DEA Sentinel‑2 and TERN for this boundary…';
  try {
    const result = await intelligenceUi.run('public');
    if (!result) {
      layerStatus.textContent = 'The paddock run did not complete. Select Details to review the error.';
      return;
    }
    ndviToggle.checked = true;
    renderMapOverlays();
    if (result.overlays.ndvi?.cells.length) {
      mapTip.innerHTML = '<strong>NDVI ready</strong><span>The latest clear Sentinel‑2 layer is now visible. Choose a colour scale in Field overlays.</span>';
    } else {
      mapTip.innerHTML = '<strong>No clear NDVI scene</strong><span>Soil overlays may still be available. Select Details to review the source results.</span>';
    }
  } finally {
    runRealPaddockButton.classList.remove('loading');
    runRealPaddockButton.innerHTML = '<span aria-hidden="true">▶</span> Run real paddock';
    updateDrawingControls();
  }
});

restoreCachedMapOverlays();

renderSavedPlans();
renderLibrary();
updateCalculation();
updateDrawingControls();
const initialView = window.location.hash === '#library' || window.location.hash === '#review' || window.location.hash === '#intelligence'
  ? window.location.hash.slice(1) as ViewName
  : 'planner';
setView(initialView);
