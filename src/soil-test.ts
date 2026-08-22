import type { SoilAnalyteKey, SoilTestExtraction, SoilValue } from './intelligence-types';

interface AnalyteDefinition {
  key: SoilAnalyteKey;
  label: string;
  aliases: RegExp[];
  defaultUnit: string;
}

interface ExtractionCandidate {
  value: SoilValue;
  score: number;
  lineIndex: number;
}

const analytes: AnalyteDefinition[] = [
  { key: 'ph', label: 'pH', aliases: [/\bpH\b(?:\s*\([^)]*\))?/i, /\bpH\s*CaCl[₂2]\b/i], defaultUnit: 'pH' },
  { key: 'organicCarbon', label: 'Organic carbon', aliases: [/organic\s+carbon/i, /carbon\s*-\s*total/i, /total\s+carbon/i, /\bSOC\b/i, /\bOC\b/i], defaultUnit: '%' },
  { key: 'cec', label: 'Cation exchange capacity', aliases: [/cation\s+(?:exchange|exch\.?)\s+(?:capacity|cap\.?)/i, /effective\s+cation\s+exchange/i, /\b(?:eCEC|CECe|adj\.?\s*CEC|CEC)\b/i], defaultUnit: 'cmol(+)/kg' },
  { key: 'ec', label: 'Electrical conductivity', aliases: [/electrical\s+conductivity/i, /salinity\s*,?\s*EC/i, /\bEC(?:e)?\b/i], defaultUnit: 'dS/m' },
  { key: 'esp', label: 'Exchangeable sodium percentage', aliases: [/(?:exchangeable|exch\.?)\s+sodium\s+percentage/i, /sodium\s*%\s*(?:of\s+)?cations?/i, /\bESP\b/i], defaultUnit: '%' },
  { key: 'sodium', label: 'Sodium', aliases: [/\bsodium\b/i, /(?:^|\s)Na(?=\s|:|=)/i], defaultUnit: 'mg/kg' },
  { key: 'calcium', label: 'Calcium', aliases: [/\bcalcium\b/i, /(?:^|\s)Ca(?=\s|:|=)/i], defaultUnit: 'cmol(+)/kg' },
  { key: 'magnesium', label: 'Magnesium', aliases: [/\bmagnesium\b/i, /(?:^|\s)Mg(?=\s|:|=)/i], defaultUnit: 'cmol(+)/kg' },
  { key: 'caMgRatio', label: 'Calcium to magnesium ratio', aliases: [/Ca\s*[:/]\s*Mg\s*(?:ratio)?/i, /calcium\s*[/]\s*magnesium\s+ratio/i, /calcium\s+to\s+magnesium/i], defaultUnit: 'ratio' },
  { key: 'phosphorus', label: 'Phosphorus', aliases: [/\b(?:colwell|olsen|mehlich)\s+phosphorus\b/i, /\bphosphorus\b/i, /\bP\s*\((?:Colwell|Olsen|Bray)\)/i], defaultUnit: 'mg/kg' },
  { key: 'sulfur', label: 'Sulfur', aliases: [/\bsulphur\b/i, /\bsulfur\b/i, /\bS\s*\((?:KCl|MCP)\)/i], defaultUnit: 'mg/kg' },
  { key: 'boron', label: 'Boron', aliases: [/\bboron\b/i, /\bB\s*\((?:hot\s+water|CaCl2)\)/i], defaultUnit: 'mg/kg' },
  { key: 'copper', label: 'Copper', aliases: [/\bcopper\b/i, /(?:^|\s)Cu(?=\s|:|=)/i], defaultUnit: 'mg/kg' },
  { key: 'zinc', label: 'Zinc', aliases: [/\bzinc\b/i, /(?:^|\s)Zn(?=\s|:|=)/i], defaultUnit: 'mg/kg' },
  { key: 'iron', label: 'Iron', aliases: [/\biron\b/i, /(?:^|\s)Fe(?=\s|:|=)/i], defaultUnit: 'mg/kg' },
  { key: 'manganese', label: 'Manganese', aliases: [/\bmanganese\b/i, /(?:^|\s)Mn(?=\s|:|=)/i], defaultUnit: 'mg/kg' },
  { key: 'molybdenum', label: 'Molybdenum', aliases: [/\bmolybdenum\b/i, /(?:^|\s)Mo(?=\s|:|=)/i], defaultUnit: 'mg/kg' },
];

const numberSource = '([<>≤≥])?\\s*(-?\\d[\\d,]*(?:\\.\\d+)?)';

function numberMatches(text: string): RegExpMatchArray[] {
  return [...text.matchAll(new RegExp(numberSource, 'g'))];
}

function parsedNumber(match: RegExpMatchArray): { value: number; lowerBound?: number; upperBound?: number } | null {
  const value = Number(match[2]?.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const qualifier = match[1];
  if (qualifier === '<' || qualifier === '≤') return { value, upperBound: value };
  if (qualifier === '>' || qualifier === '≥') return { value, lowerBound: value };
  return { value };
}

function unitMatch(text: string): RegExpExecArray | null {
  return /(mg\/?kg|ppm|p\.?p\.?m\.?|cmol\(\+\)\/?kg|cmol\+\/?kg|cmol\/?kg|meq\/?100g(?:\s+of\s+soil)?|dS\/?m|mS\/?cm|µS\/?cm|uS\/?cm|pH\s*units?|units?|ratio|percent|%)/i.exec(text);
}

function normaliseUnit(unit: string | undefined, fallback: string): string {
  if (!unit) return fallback;
  const compact = unit.replace(/\s+/g, '').toLowerCase();
  if (/^(?:ppm|p\.?p\.?m\.?)$/.test(compact)) return 'mg/kg';
  if (/^(?:cmol(?:\(\+\)|\+)?\/?kg|meq\/?100g(?:ofsoil)?)$/.test(compact)) return 'cmol(+)/kg';
  if (/^[uµ]s\/?cm$/.test(compact)) return 'µS/cm';
  if (/^ms\/?cm$/.test(compact)) return 'mS/cm';
  if (/^ds\/?m$/.test(compact)) return 'dS/m';
  if (/^mg\/?kg$/.test(compact)) return 'mg/kg';
  if (compact === 'percent') return '%';
  if (/^phunits?$/.test(compact) || compact === 'units') return fallback;
  return unit;
}

function detectedMethod(line: string, aliasText: string): string | undefined {
  const known = /(CaCl[₂2]|H[₂2]O|1\s*:\s*5\s*(?:water|H[₂2]O)|Walkley\s*(?:&|and)\s*Black|W\s*&\s*B|Colwell|Olsen|Bray\s*[12]|Mehlich|KCl(?:-?40)?|DTPA|Amm(?:onium)?[-\s]?acet\.?|Morgan\s*1)/i.exec(line)?.[0];
  if (known) return known.replace('₂', '2');
  return /\(([^)]+)\)/.exec(aliasText)?.[1];
}

function methodScore(key: SoilAnalyteKey, line: string): number {
  const normalised = line.replaceAll('₂', '2').toLowerCase();
  if (key === 'ph') {
    if (normalised.includes('cacl2')) return 35;
    if (normalised.includes('water') || normalised.includes('h2o')) return 15;
  }
  if (key === 'organicCarbon') {
    if (normalised.includes('organic carbon')) return 30;
    if (normalised.includes('carbon - total') || normalised.includes('total carbon')) return 20;
  }
  if (key === 'cec') {
    if (/\becec\b|effective cation/.test(normalised)) return 30;
    if (/\bcec\b|cation exch/.test(normalised)) return 20;
  }
  if (key === 'ec') {
    if (normalised.includes('1:5') || normalised.includes('1 : 5')) return 20;
    if (normalised.includes('sat. ext')) return 10;
  }
  if (key === 'sodium' || key === 'calcium' || key === 'magnesium') {
    if (normalised.includes('exchangeable') || normalised.includes('amm-acet')) return 35;
    if (/meq\/?100g|cmol/.test(normalised)) return 30;
    if (normalised.includes('soluble')) return 10;
  }
  if (key === 'caMgRatio') return 35;
  if (key === 'phosphorus') {
    if (normalised.includes('colwell')) return 35;
    if (normalised.includes('olsen')) return 30;
    if (normalised.includes('bray 1')) return 25;
    if (normalised.includes('mehlich')) return 20;
    if (normalised.includes('soluble')) return 10;
  }
  if (key === 'sulfur' && normalised.includes('kcl')) return 25;
  if (['boron', 'copper', 'zinc', 'iron', 'manganese'].includes(key) && /(dtpa|cacl2|hot)/.test(normalised)) return 20;
  return 0;
}

function unsuitableLine(key: SoilAnalyteKey, line: string): boolean {
  const lower = line.toLowerCase();
  if (/(?:kg|g|l|ml|t)\s*\/\s*ha|\bapplication\b|\bsplit\b/.test(lower)) return true;
  if (key === 'phosphorus' && /(buffer index|environmental risk|fertiliser|desired level|recommend)/.test(lower)) return true;
  if (key === 'sodium' && /(%\s*(?:of\s+)?cations?|base saturation|percentage|\besp\b|sodium\s*:\s*potassium)/.test(lower)) return true;
  if ((key === 'calcium' || key === 'magnesium') && /(%\s*(?:of\s+)?cations?|base saturation|percentage)/.test(lower)) return true;
  if (key === 'organicCarbon' && /water extractable/.test(lower)) return true;
  return false;
}

function candidateValue(
  definition: AnalyteDefinition,
  line: string,
  lineIndex: number,
  isEalReport: boolean,
  isAgVitaReport: boolean,
  followingLines: string[],
): ExtractionCandidate | null {
  const alias = definition.aliases.find((candidate) => candidate.test(line));
  if (!alias || unsuitableLine(definition.key, line)) return null;
  const match = alias.exec(line);
  if (!match) return null;

  const beforeLabel = line.slice(0, match.index);
  const afterLabel = line.slice(match.index + match[0].length);
  const startsStructurally = match.index <= 28;
  const prefixNumbers = numberMatches(beforeLabel);
  const prefix = prefixNumbers.at(-1);
  const prefixIsOnlyValue = Boolean(prefix && beforeLabel.slice(0, prefix.index).trim() === '' && beforeLabel.slice((prefix.index ?? 0) + prefix[0].length).trim() === '');
  if (!startsStructurally && !prefixIsOnlyValue) return null;

  const currentUnit = unitMatch(afterLabel);
  const ealNeedsContinuation = isEalReport && (!currentUnit || /[-–—]\s*$/.test(line) || /^(?:ICPMS|ICPOES)\b/i.test(followingLines[0] ?? ''));
  const analysedLine = ealNeedsContinuation ? `${line} ${followingLines[0] ?? ''}` : line;
  const analysedAfterLabel = ealNeedsContinuation ? `${afterLabel} ${followingLines[0] ?? ''}` : afterLabel;
  const unit = unitMatch(analysedAfterLabel);
  let numeric: RegExpMatchArray | undefined;
  let confidence = 0.84;
  let structureScore = 0;
  let usedPrefix = false;

  if (prefixIsOnlyValue && prefix) {
    numeric = prefix;
    confidence = 0.78;
    structureScore = 60;
    usedPrefix = true;
  }

  if (!numeric && isEalReport && unit) {
    numeric = numberMatches(analysedLine).at(-1);
    confidence = 0.94;
    structureScore = 45;
  } else if (!numeric && unit) {
    numeric = numberMatches(afterLabel.slice((unit.index ?? 0) + unit[0].length))[0];
    confidence = 0.96;
    structureScore = 50;
  }

  if (!numeric) {
    const direct = afterLabel
      .replace(/^[\s:*†=\-]+/, '')
      .replace(/^(?:\([^)]*\)\s*){0,2}/, '')
      .replace(/^(?:Adj\.?\s*)?(?:e?CEC|ESP|OC|Ca\s*[:/]\s*Mg)\b\s*/i, '');
    const directNumbers = numberMatches(direct);
    const ambiguousAgVitaRow = isAgVitaReport && !unit && directNumbers.length > 1
      && ['sulfur', 'boron', 'copper', 'zinc', 'iron', 'manganese', 'molybdenum'].includes(definition.key);
    numeric = ambiguousAgVitaRow ? undefined : (new RegExp(`^${numberSource}(?=\\s|$)`).exec(direct) ?? undefined);
    if (numeric) {
      confidence = 0.92;
      structureScore = 40;
    }
  }

  if (!numeric && /^[\s*†:=\-]*$/.test(afterLabel)) {
    for (const continuation of followingLines.slice(0, 2)) {
      const clean = continuation.replace(/^[\s*†:]+/, '');
      const next = new RegExp(`^${numberSource}(?:\s|$)`).exec(clean);
      if (next) {
        numeric = next;
        confidence = 0.86;
        structureScore = 30;
        break;
      }
      if (clean.length > 8) break;
    }
  }

  const parsed = numeric ? parsedNumber(numeric) : null;
  if (!parsed || (definition.key === 'caMgRatio' && parsed.value <= 0)) return null;
  const prefixUnit = usedPrefix && unit && (
    /ppm|p\.?p\.?m\.?/i.test(unit[0])
    || (definition.key === 'organicCarbon' && /%|percent/i.test(unit[0]))
  ) ? unit[0] : undefined;
  let reportedUnit = usedPrefix
    ? normaliseUnit(prefixUnit, definition.key === 'ph' ? 'pH' : 'not stated')
    : normaliseUnit(unit?.[0], definition.defaultUnit);
  let reported = parsed;
  if (reportedUnit === 'µS/cm') {
    reported = {
      value: parsed.value / 1000,
      ...(parsed.lowerBound !== undefined ? { lowerBound: parsed.lowerBound / 1000 } : {}),
      ...(parsed.upperBound !== undefined ? { upperBound: parsed.upperBound / 1000 } : {}),
    };
    reportedUnit = 'dS/m';
  } else if (reportedUnit === 'mS/cm') {
    reportedUnit = 'dS/m';
  }
  const method = detectedMethod(line, match[0]);
  return {
    value: {
      key: definition.key,
      label: definition.label,
      value: reported.value,
      unit: reportedUnit,
      source: 'measured',
      confidence,
      ...(reported.lowerBound !== undefined ? { lowerBound: reported.lowerBound } : {}),
      ...(reported.upperBound !== undefined ? { upperBound: reported.upperBound } : {}),
      ...(method ? { method } : {}),
    },
    score: structureScore + methodScore(definition.key, line),
    lineIndex,
  };
}

function extractDepth(text: string): string | undefined {
  const match = /(?:sample\s+depth|depth\s+of\s+sample|profile\s+sampled)\s*(?:\(cm\))?\s*:?\s*(\d+(?:\.\d+)?)\s*(?:to|[-–—])\s*(\d+(?:\.\d+)?)/i.exec(text);
  return match ? `${match[1]}–${match[2]} cm` : undefined;
}

function extractReportedEsp(text: string, depth: string | undefined): SoilValue | null {
  const match = /^Sodium\b[^\n]*\(\s*(\d+(?:\.\d+)?)\s*%\s*CEC\s*\)/im.exec(text);
  if (!match?.[1]) return null;
  return {
    key: 'esp',
    label: 'Exchangeable sodium percentage',
    value: Number(match[1]),
    unit: '%',
    source: 'measured',
    confidence: 0.9,
    method: 'Reported sodium percentage of CEC',
    ...(depth ? { depth } : {}),
  };
}

export function extractSoilTestText(text: string, filename = 'soil-test.txt'): SoilTestExtraction {
  const compactLines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const isEalReport = /Environmental Analysis Laboratory|\bEAL Sample ID\b/i.test(text);
  const isAgVitaReport = /AgVita|expressSoil/i.test(text);
  const depth = extractDepth(text);
  const values = new Map<SoilAnalyteKey, SoilValue>();

  for (const definition of analytes) {
    const candidates = compactLines.flatMap((line, lineIndex) => {
      const candidate = candidateValue(definition, line, lineIndex, isEalReport, isAgVitaReport, compactLines.slice(lineIndex + 1, lineIndex + 3));
      return candidate ? [candidate] : [];
    });
    const selected = candidates.sort((a, b) => b.score - a.score || a.lineIndex - b.lineIndex)[0];
    if (selected) values.set(definition.key, depth ? { ...selected.value, depth } : selected.value);
  }

  if (!values.has('esp')) {
    const reportedEsp = extractReportedEsp(text, depth);
    if (reportedEsp) values.set('esp', reportedEsp);
  }

  if (!values.has('caMgRatio')) {
    const calcium = values.get('calcium');
    const magnesium = values.get('magnesium');
    if (calcium && magnesium && magnesium.value !== 0 && calcium.unit !== 'not stated' && calcium.unit.toLowerCase() === magnesium.unit.toLowerCase()) {
      values.set('caMgRatio', {
        key: 'caMgRatio',
        label: 'Calcium to magnesium ratio',
        value: calcium.value / magnesium.value,
        unit: 'ratio',
        source: 'measured',
        confidence: Math.min(calcium.confidence, magnesium.confidence) * 0.95,
        method: 'Calculated from measured calcium and magnesium',
        ...(depth ? { depth } : {}),
      });
    }
  }

  const warnings: string[] = [];
  if (values.size === 0) warnings.push('No recognised soil analytes were found. Check the report text or enter values manually.');
  if (!values.has('ph')) warnings.push('No pH result was recognised.');
  if (!values.has('organicCarbon')) warnings.push('No organic carbon result was recognised.');
  warnings.push('Confirm every extracted value, unit, method and sampling depth against the original laboratory report before use.');

  return {
    filename,
    extractedAt: new Date().toISOString(),
    values: [...values.values()],
    warnings,
    rawTextLength: text.length,
  };
}

export function mergeSoilValues(modelled: SoilValue[], measured: SoilValue[]): SoilValue[] {
  const merged = new Map<SoilAnalyteKey, SoilValue>();
  modelled.forEach((value) => merged.set(value.key, value));
  measured.forEach((value) => merged.set(value.key, value));
  return [...merged.values()].sort((a, b) => a.label.localeCompare(b.label));
}
