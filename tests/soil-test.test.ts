import { describe, expect, it } from 'vitest';
import { extractSoilTestText, mergeSoilValues } from '../src/soil-test';
import type { SoilValue } from '../src/intelligence-types';

describe('soil-test extraction', () => {
  it('extracts requested analytes and calculates a Ca:Mg ratio', () => {
    const extraction = extractSoilTestText(`
      pH (CaCl2) 5.6
      Organic Carbon 2.3 %
      CEC 14.2 cmol(+)/kg
      EC 0.18 dS/m
      ESP 3.1 %
      Calcium 8.0 cmol(+)/kg
      Magnesium 2.0 cmol(+)/kg
      Phosphorus 24 mg/kg
      Sulfur 9 mg/kg
      Zinc 1.2 mg/kg
    `, 'sample.txt');

    expect(extraction.values.find((value) => value.key === 'ph')?.value).toBe(5.6);
    expect(extraction.values.find((value) => value.key === 'organicCarbon')?.value).toBe(2.3);
    expect(extraction.values.find((value) => value.key === 'caMgRatio')?.value).toBe(4);
    expect(extraction.values.every((value) => value.source === 'measured')).toBe(true);
  });

  it('lets measured values replace matching modelled priors', () => {
    const modelled: SoilValue[] = [{ key: 'ph', label: 'pH', value: 6.4, unit: 'pH', source: 'tern-modelled', confidence: 0.5 }];
    const measured: SoilValue[] = [{ key: 'ph', label: 'pH', value: 5.8, unit: 'pH', source: 'measured', confidence: 0.95 }];
    expect(mergeSoilValues(modelled, measured)).toEqual(measured);
  });

  it('parses Nutrient Advantage tables without mistaking narrative rates for results', () => {
    const extraction = extractSoilTestText(`
      Sample Depth (cm): 0 To 10
      Current pH (CaCl2) and Cation Exc. Cap. (CEC) indicate 2.8t/ha of lime is needed.
      Organic Carbon (W&B) % 4.30 2.3 - 5.3
      pH (1:5 Water) 5.2 6.0 - 7.5
      pH (1:5 CaCl2) 4.5 5.5 - 8.0
      Electrical Conductivity (1:5 water) dS/m 0.09 < 0.29
      Sodium (Amm-acet.) cmol(+)/kg 0.27 < 0.7
      Sodium % of Cations (ESP) % 4.7 < 6.0
      Calcium/Magnesium Ratio 4.1 > 2.0
      Phosphorus (Olsen) mg/kg 10.1
      Phosphorus (Colwell) mg/kg 24 30 - 38
      Sulphur (KCl40) mg/kg 6.7 6.0 - 7.5
      Cation Exch. Cap. (CEC) cmol(+)/kg 5.81
    `, 'nutrient-advantage.pdf');

    expect(extraction.values.find((value) => value.key === 'ph')).toMatchObject({ value: 4.5, method: 'CaCl2', depth: '0–10 cm' });
    expect(extraction.values.find((value) => value.key === 'phosphorus')).toMatchObject({ value: 24, method: 'Colwell' });
    expect(extraction.values.find((value) => value.key === 'cec')?.value).toBe(5.81);
    expect(extraction.values.find((value) => value.key === 'esp')?.value).toBe(4.7);
  });

  it('takes the final result column from EAL rows and joins split parameters', () => {
    const extraction = extractSoilTestText(`
      Environmental Analysis Laboratory
      Sample Depth: 0-15
      Parameter Unit Method Reference LOR Result
      Phosphorus - Colwell mg/kg Rayment & Lyons 2011 -
      9B2 <1 94
      pH (H2O) units Rayment & Lyons 2011 - 4A1 --- 6.37
      Electrical Conductivity dS/m Rayment & Lyons 2011 - 3A1 <0.005 0.124
      Sodium - Exchangeable cmol+/kg Rayment & Lyons 2011 - 15D3 <0.065 0.35
      Sodium - Base Saturation (ESP) % Calculation <0.1 3.6
      Calcium - Exchangeable cmol+/kg Rayment & Lyons 2011 - 15D3 <0.05 6.22
      Magnesium - Exchangeable cmol+/kg Rayment & Lyons 2011 - 15D3 <0.01 1.70
      Calcium/Magnesium Ratio --- Calculation <0.1 3.7
      Effective Cation Exchange
      Capacity cmol+/kg Calculation --- 9.6
      Zinc - DTPA mg/kg Rayment & Lyons 2011 - 12A1 <0.5 3.2
      Carbon - Total % Inhouse S4a <0.03 0.78
    `, 'eal.pdf');

    expect(extraction.values.find((value) => value.key === 'phosphorus')?.value).toBe(94);
    expect(extraction.values.find((value) => value.key === 'ph')?.value).toBe(6.37);
    expect(extraction.values.find((value) => value.key === 'cec')?.value).toBe(9.6);
    expect(extraction.values.find((value) => value.key === 'sodium')).toMatchObject({ value: 0.35, unit: 'cmol(+)/kg' });
    expect(extraction.values.find((value) => value.key === 'zinc')?.value).toBe(3.2);
  });

  it('supports SWEP next-line values and prefix-value professional reports', () => {
    const swep = extractSoilTestText(`
      DEPTH OF SAMPLE (cm): 0 to 15
      pH(1:5 Water)
      5.64 5.5-7.5
      pH(1:5 0.01M CaCl2)
      †
      5.14
      TOTAL ORGANIC CARBON
      OC % 1.58 3 - 5
      Electrical Conductivity EC µS/cm 75.2 < 300
      CATION EXCHANGE CAPACITY CEC 20.5
      EXCH. SODIUM PERCENTAGE ESP 3.37 < 5
      CALCIUM / MAGNESIUM RATIO Ca/Mg 1.81 4-4.7
    `, 'swep.pdf');
    const professional = extractSoilTestText(`
      5.23 pH of Soil
      4.90 Organic Carbon, Percent
      0.22 Salinity 1:2EC (dS/M)
      1.48 Boron p.p.m.
      73.87 Iron p.p.m
      38.77 Manganese p.p.m.
      3.38 Copper p.p.m.
      8.35 Zinc p.p.m.
      2.62 Molybdenum p.p.m
    `, 'professional.pdf');

    expect(swep.values.find((value) => value.key === 'ph')).toMatchObject({ value: 5.14, depth: '0–15 cm' });
    expect(swep.values.find((value) => value.key === 'organicCarbon')?.value).toBe(1.58);
    expect(swep.values.find((value) => value.key === 'ec')).toMatchObject({ value: 0.0752, unit: 'dS/m' });
    expect(swep.values.find((value) => value.key === 'cec')?.value).toBe(20.5);
    expect(professional.values.find((value) => value.key === 'ph')?.value).toBe(5.23);
    expect(professional.values.find((value) => value.key === 'boron')).toMatchObject({ value: 1.48, unit: 'mg/kg' });
  });

  it('parses AgVita and APAL aliases with unit normalisation', () => {
    const extraction = extractSoilTestText(`
      Sample Depth: 0-10
      ECEC cmol/kg 13.5
      Organic Carbon (W&B) % (40°C) 1.92
      pH 1:5 water pH units 6.37
      pH CaCl2 (following 4A1) pH units 5.65
      Colwell Phosphorus mg/kg 56
      KCl Sulfur (S) mg/kg 9.7
      Calcium (Ca) - AmmAc mg/kg 1660 8.28
      Sodium (Na) - AmmAc mg/kg 61.8 0.269
      Ca:Mg Ratio 2.2
      Salinity, EC 1:5 dS/m 0.12
    `, 'apal.pdf');

    expect(extraction.values.find((value) => value.key === 'cec')?.value).toBe(13.5);
    expect(extraction.values.find((value) => value.key === 'ph')).toMatchObject({ value: 5.65, method: 'CaCl2' });
    expect(extraction.values.find((value) => value.key === 'phosphorus')?.value).toBe(56);
    expect(extraction.values.find((value) => value.key === 'ec')).toMatchObject({ value: 0.12, unit: 'dS/m' });
  });
});
