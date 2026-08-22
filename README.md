# Happy Soils Maps

Happy Soils Maps is a paddock planning and intelligence tool for Australian farms. It links a mapped paddock to location-specific satellite, soil-grid and climate evidence, accepts measured laboratory results, and records treatment outcomes over time.

The application is deliberately a planning aid rather than agronomic advice. It does not recommend product rates or make efficacy claims.

## Features

- Draw a paddock on an interactive OpenStreetMap map
- Calculate mapped area in hectares
- Record a structured Australian property or rural address
- Plan liquid or solid applications using `L/ha`, `mL/ha`, `kg/ha`, or `g/ha`
- Include multiple applications and an optional operational allowance
- Estimate whole packs required
- Estimate input cost from a user-entered pack price
- Estimate carrier volume and tank loads from user-entered equipment values
- Schedule jobs and track draft, ready and completed status
- Save plans locally in the browser
- Search and filter saved work in a plan-library dashboard
- Duplicate or import a plan for repeat jobs
- Export a plan as JSON or a concise CSV summary, or print it
- Prepare and download a private Farm Input Review brief
- Query Digital Earth Australia for cloud-masked paddock NDVI history
- Sample TERN Soil and Landscape Grid priors across the paddock polygon
- Query SILO for location-specific rainfall, temperature and evaporation context
- Pin an Australian address on the map using a deliberate, click-triggered lookup
- Upload PDF, CSV or text soil reports and extract core soil analytes
- Give measured soil values precedence over matching modelled priors
- Run versioned Activate/Energise rules with rate caps, split-application fields, exception flags and evidence confidence
- Keep treatment, yield, soil, NDVI and ROI outcome records in a local learning register
- Separate public regional intelligence from full adviser evidence and recommendations

## Run locally

```bash
pnpm install
cp .env.example .env
pnpm dev:full
```

Set `SILO_API_USERNAME` in `.env` to the contact email the SILO service requires. Vite prints the local address. Open it in a browser.

Address lookup defaults to the public OpenStreetMap Nominatim search endpoint. The implementation is click-triggered, Australian-only, cached, attributed and rate-limited. Do not submit confidential addresses. Before serving a larger commercial audience, set `GEOCODER_SEARCH_URL` to a managed or self-hosted compatible service and set an identifying `GEOCODER_USER_AGENT`.

## Quality checks

```bash
pnpm check
```

This runs TypeScript validation, unit tests, and a production build. GitHub Actions runs the same checks for pushes and pull requests.

## Safety and privacy

All application rates must come from the current product label and/or a qualified adviser. Before application, confirm calibration, PPE, weather, withholding requirements, waterways and sensitive-area buffers, and all applicable Australian regulations.

Addresses and plans are stored in browser `localStorage`. OpenStreetMap tiles are requested from the tile provider while the map is in use. Address-to-map geocoding is intentionally not enabled.

The real paddock pipeline is opt-in: selecting “Run real paddock pipeline” sends the mapped geometry to the configured Australian data providers. Uploaded soil tests and full recommendation responses are handled by the adviser service and are omitted from the public response. Local outcome records are stored in `.local-data` and are excluded from Git.

Farm Input Review contact details are not automatically submitted or stored. The user chooses whether to download and share the generated brief.

Production Activate/Energise rates remain locked until Happy Soils provides and approves the authoritative rules tables. See [the rules approval requirements](docs/recommendation-rules.md) and [the data-pipeline design](docs/data-pipeline.md).

## Technology

- TypeScript and Vite
- Leaflet with OpenStreetMap tiles
- Turf for geodesic polygon area
- GeoTIFF and Proj4 for paddock-level DEA raster sampling
- PDF.js for laboratory report text extraction
- A small TypeScript adviser data service
- Vitest for calculation tests
