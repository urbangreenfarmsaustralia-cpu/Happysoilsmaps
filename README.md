# Happy Soils Maps

Happy Soils Maps is a browser-based paddock planning tool for Australian farms. It helps a user sketch a paddock, estimate its area in hectares, and calculate the total quantity and number of packs required from a user-supplied application rate.

The application is deliberately a planning aid rather than agronomic advice. It does not recommend product rates or make efficacy claims.

## Features

- Draw a paddock on an interactive OpenStreetMap map
- Calculate mapped area in hectares
- Record a structured Australian property or rural address
- Plan liquid or solid applications using `L/ha`, `mL/ha`, `kg/ha`, or `g/ha`
- Include multiple applications and an optional operational allowance
- Estimate whole packs required
- Save plans locally in the browser
- Export a plan as JSON or a concise CSV summary
- Keep coordinates on the device unless the user explicitly exports them

## Run locally

```bash
pnpm install
pnpm dev
```

Vite prints the local address. Open it in a browser.

## Quality checks

```bash
pnpm check
```

This runs TypeScript validation, unit tests, and a production build. GitHub Actions runs the same checks for pushes and pull requests.

## Safety and privacy

All application rates must come from the current product label and/or a qualified adviser. Before application, confirm calibration, PPE, weather, withholding requirements, waterways and sensitive-area buffers, and all applicable Australian regulations.

Addresses and plans are stored in browser `localStorage`. No coordinates, addresses or farm data are sent to Happy Soils by this application. OpenStreetMap tiles are requested from the tile provider while the map is in use. Address-to-map geocoding is intentionally not enabled, so an entered farm address is not submitted to a third-party lookup service.

## Technology

- TypeScript and Vite
- Leaflet with OpenStreetMap tiles
- Turf for geodesic polygon area
- Vitest for calculation tests
