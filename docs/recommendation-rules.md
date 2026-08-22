# Activate and Energise recommendation rules

The recommendation engine is implemented, versioned and testable. Production rates remain locked until Happy Soils supplies and approves the authoritative product tables. This prevents prototype thresholds from being presented as agronomic advice.

Each approved product ruleset must contain:

- a unique version, approver and approval date;
- mutually exclusive rate bands with explicit input conditions;
- rate unit, maximum rate per application and maximum seasonal rate;
- number of split applications and minimum days between them;
- notes that must accompany the band;
- review or stop exceptions for unsafe, contradictory or insufficient evidence.

Supported rule inputs are measured or modelled soil properties, recent rainfall and the DEA NDVI trend. A measured laboratory value always replaces the matching TERN prior before the rules run.

Confidence is reported separately from the selected band. It increases when measured soil values, SILO climate and multiple DEA observations are available. A low-confidence or stop-flagged result is routed to adviser review even when a band matches.

## Historical report evidence

A read-only review of private Happy Soils farmer reports found historical, crop-specific programs expressed with different product names, formulations, growth stages and dilution-versus-area conventions. Those reports are useful outcome evidence, but they are not a single current product ruleset. No historical rate has been copied into the application.

Before any historical program can inform production rules, Happy Soils must identify the current formulation, convert product rate and carrier-water volume into separate canonical fields, state the applicable crop and soil conditions, define caps and split timing, and approve the rule version. Farmer-specific recommendations remain private evidence and cannot become public defaults automatically.

## Approval checklist

Before setting a ruleset to `approved: true`:

1. Product management confirms the current Australian label, intended use and units.
2. An appropriately qualified agronomic reviewer confirms every threshold, cap and exception.
3. Boundary tests cover the value immediately below, at and above every threshold.
4. Split-application and seasonal-cap tests are signed off.
5. Public responses are verified to contain no paddock rate or private soil-test result.
6. The approved rules version is retained with every generated recommendation and outcome record.
