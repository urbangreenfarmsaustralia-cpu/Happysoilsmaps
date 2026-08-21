import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import {
  calculateApplication,
  formatQuantity,
  isAustralianPostcode,
  polygonAreaHectares,
  type ApplicationResult,
  type RateUnit,
} from './calculations';
import { createPlanCsv } from './export';
import { loadPlans, storePlans, type SavedPlan } from './storage';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application root was not found.');

app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="Happy Soils Maps home">
      <span class="brand-mark" aria-hidden="true"><span></span></span>
      <span><strong>Happy Soils</strong><small>Maps & application planner</small></span>
    </a>
    <div class="topbar-actions">
      <span class="privacy-pill"><i></i> Stored on this device</span>
      <button class="button button-ghost" id="new-plan" type="button">New plan</button>
      <button class="button button-primary" id="save-plan" type="button">Save plan</button>
    </div>
  </header>

  <main class="workspace">
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
          <p class="address-note"><span aria-hidden="true">⌂</span><span>The address is saved with this plan on your device. Use Locate or move the map to position the paddock.</span></p>
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
        <div class="result-actions">
          <button type="button" class="button button-light" id="export-csv">Export summary</button>
          <button type="button" class="button button-outline-light" id="export-json">Export full plan</button>
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
      <div class="map-tip" id="map-tip"><strong>Start here</strong><span>Select “Draw paddock”, then click each corner of the boundary.</span></div>
      <div class="area-badge">
        <span>MAPPED AREA</span>
        <strong id="mapped-area">0.00 <small>ha</small></strong>
        <em id="point-count">No boundary drawn</em>
      </div>
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
const form = get<HTMLFormElement>('#plan-form');
const drawButton = get<HTMLButtonElement>('#draw');
const undoButton = get<HTMLButtonElement>('#undo-point');
const finishButton = get<HTMLButtonElement>('#finish-drawing');
const mapTip = get<HTMLDivElement>('#map-tip');
const toast = get<HTMLDivElement>('#toast');

const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([-27.5, 134], 4);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20,
  subdomains: 'abc',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let drawing = false;
let vertices: L.LatLng[] = [];
let pointMarkers: L.CircleMarker[] = [];
let boundary: L.Polygon | null = null;
let guideLine: L.Polyline | null = null;
let activePlanId: string | null = null;
let currentResult: ApplicationResult | null = null;

const numberValue = (input: HTMLInputElement): number => {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : 0;
};

const showToast = (message: string): void => {
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 2600);
};

const updateDrawingControls = (): void => {
  drawButton.classList.toggle('active', drawing);
  const label = drawButton.querySelector('span:last-child');
  if (label) label.textContent = drawing ? 'Adding corners…' : 'Draw paddock';
  undoButton.disabled = vertices.length === 0;
  finishButton.disabled = vertices.length < 3;
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
get<HTMLButtonElement>('#clear-map').addEventListener('click', () => clearBoundary());

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
  } catch {
    currentResult = null;
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

const escapeHtml = (value: string): string => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[character] ?? character);

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
        <span><strong>${escapeHtml(plan.paddockName)}</strong><small>${escapeHtml(plan.productName)} · ${formatQuantity(plan.areaHa)} ha</small></span>
        <span aria-hidden="true">→</span>
      </button>
      <button class="delete-plan" type="button" data-delete="${plan.id}" aria-label="Delete ${escapeHtml(plan.paddockName)}">×</button>
    </article>
  `).join('');
};

const loadPlanIntoForm = (plan: SavedPlan): void => {
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
  get<HTMLTextAreaElement>('#notes').value = plan.notes;
  clearBoundary(false);
  plan.coordinates.forEach((point) => addVertex(L.latLng(point.lat, point.lng)));
  if (vertices.length >= 3) {
    finishDrawing();
    map.fitBounds(L.latLngBounds(vertices), { padding: [48, 48] });
  }
  areaInput.value = String(plan.areaHa);
  updateCalculation();
  showToast(`Loaded ${plan.paddockName}.`);
};

get<HTMLDivElement>('#saved-plans').addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const loadButton = target.closest<HTMLButtonElement>('[data-load]');
  const deleteButton = target.closest<HTMLButtonElement>('[data-delete]');
  if (loadButton) {
    const plan = loadPlans().find((item) => item.id === loadButton.dataset.load);
    if (plan) loadPlanIntoForm(plan);
  }
  if (deleteButton) {
    const updated = loadPlans().filter((item) => item.id !== deleteButton.dataset.delete);
    storePlans(updated);
    if (activePlanId === deleteButton.dataset.delete) activePlanId = null;
    renderSavedPlans();
    showToast('Saved plan deleted.');
  }
});

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
  showToast('Plan saved on this device.');
});

const resetPlan = (): void => {
  activePlanId = null;
  form.reset();
  applicationsInput.value = '1';
  allowanceInput.value = '3';
  clearBoundary();
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
  download(JSON.stringify({ plan, estimate: currentResult }, null, 2), filenameFor(plan, 'json'), 'application/json');
  showToast('Full plan exported.');
});

get<HTMLButtonElement>('#export-csv').addEventListener('click', () => {
  const plan = buildPlan();
  if (!validatePlan(plan) || !currentResult) return;
  const csv = createPlanCsv(plan, currentResult);
  download(csv, filenameFor(plan, 'csv'), 'text/csv;charset=utf-8');
  showToast('Plan summary exported.');
});

renderSavedPlans();
updateCalculation();
updateDrawingControls();
