# Paddock data pipeline

## Flow

`polygon → TERN soil priors → DEA NDVI history → SILO climate → soil-test override → controlled recommendation → outcome record`

The web interface calls a same-origin adviser service. That service, rather than the browser, communicates with the national data providers, extracts uploaded reports and protects full recommendation responses.

## Provider behaviour

### Digital Earth Australia

- Queries the official DEA STAC catalogue for Landsat 8 and 9 Analysis Ready Data scenes intersecting the paddock and date range.
- Selects up to eight observations distributed across the period.
- Streams cloud-optimised red, near-infrared and Fmask rasters.
- Keeps only paddock pixels classified as clear by Fmask.
- Calculates mean paddock NDVI for each usable scene.

### TERN Soil and Landscape Grid of Australia

- Creates up to nine sample points inside the paddock polygon.
- Queries every point through the official SLGA drill endpoint.
- Calculates a thickness-weighted 0–15 cm prior from the 0–5 cm and 5–15 cm layers.
- Currently maps pH (CaCl2), organic carbon, effective CEC and total phosphorus because those are the recommendation-relevant fields available in the returned grid product.
- Retains the modelled uncertainty bounds and identifies every value as a prior.

### SILO

- Queries Data Drill at the paddock centroid for the requested period.
- Summarises total rainfall, recent 30-day rainfall, rain days, temperature and evaporation.
- Requires `SILO_API_USERNAME` because SILO requires a contact email with data requests.

## Soil-test precedence

PDF, CSV and text reports are converted to text and matched against explicit analyte aliases. The parser extracts pH, organic carbon, CEC, EC, sodium, ESP, calcium, magnesium, Ca:Mg, phosphorus, sulfur and common trace elements. Extracted results must be checked against the original report. A measured value replaces only the matching modelled analyte; other priors remain present and labelled.

### Report-format validation

The parser has been tested against sanitised structures derived from the private Happy Soils farmer-report library. No farmer report, name, address, sample identifier or recommendation has been copied into this repository.

Supported text-bearing layouts include Nutrient Advantage, Environmental Analysis Laboratory (EAL), SWEP, AgVita expressSoil, Eurofins/APAL-style tables, SoilMate and legacy professional soil reports. Format handling includes:

- preserving PDF row breaks before parsing;
- taking the result column rather than method codes, detection limits, desired ranges or recommendation rates;
- preferring pH (CaCl2), Colwell phosphorus, exchangeable cations and KCl sulfur when more than one method is reported;
- normalising `ppm` to `mg/kg`, `meq/100g` to `cmol(+)/kg`, and conductivity to `dS/m`;
- retaining sample depth and less-than/greater-than reporting limits;
- assigning lower confidence and `not stated` units when a legacy layout puts the value before the analyte without a reliable unit;
- declining ambiguous values rather than guessing from a displaced table column.

Image-only scans and screenshots are not OCR-processed in this version. They require a text-bearing original PDF or manual adviser entry. Multi-sample reports should be split or reviewed sample-by-sample before a result is allowed to override a paddock prior.

## Public and adviser boundary

Public responses contain provider status, vegetation history, climate context and evidence counts. They omit individual soil values and all treatment recommendations. Full adviser responses are allowed from localhost during development and require `ADVISER_API_TOKEN` when deployed remotely.

## Outcome learning register

Outcome records include the paddock polygon, treatment, rate, date, crop, yield, attached follow-up soil test, before/after NDVI, costs, revenue change, ROI and notes. Local development stores append-only JSON lines in `.local-data/outcomes.jsonl`. Production deployment should replace this file adapter with an authenticated database and row-level farm access controls.
