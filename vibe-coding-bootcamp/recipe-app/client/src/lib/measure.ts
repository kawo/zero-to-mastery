/**
 * Recipe measures: parsing TheMealDB's free-text amounts and converting them
 * between metric and imperial.
 *
 * Measures are free text ("175g", "1 ½ cups", "3 cloves minced", "juice of 1",
 * "pinch", "200g/7oz"). Each is parsed into an amount, a unit and a note.
 *
 * The factors between units come from the `convert` library. This file decides
 * which units a cook expects and how to write them:
 *   - spoons (tsp, tbsp) are used in both systems, so they are never converted
 *   - imperial volumes use spoons for small amounts and cups above ¼ cup
 *   - imperial amounts are written as fractions ("1 ½ cups"), metric ones as
 *     round numbers ("240 ml", "1.25 kg")
 *   - counted things ("2 cloves", "3 large") have no system and stay as they are
 * Nothing here touches the DOM, so it can be tested on its own.
 */
import { convert } from 'convert';

export type Dimension = 'mass' | 'volume' | 'count';

/** How to show measures: as the recipe wrote them, or all in one system. */
export type UnitSystem = 'original' | 'metric' | 'imperial';

/** "both" for spoons and counted units, which every cook uses. */
type UnitFamily = 'metric' | 'imperial' | 'both';

interface UnitInfo {
  unit: string;
  dimension: Dimension;
  family: UnitFamily;
  /** To grams (mass) or millilitres (volume); 1 for counted units */
  factor: number;
}

// TheMealDB is mostly British, so a pint is an imperial (UK) pint. Cups are
// US cups, the size American recipes and measuring cups use.
const MEASURED: Record<string, Omit<UnitInfo, 'unit'>> = {
  g: { dimension: 'mass', family: 'metric', factor: convert(1, 'g').to('g') },
  kg: { dimension: 'mass', family: 'metric', factor: convert(1, 'kg').to('g') },
  oz: { dimension: 'mass', family: 'imperial', factor: convert(1, 'oz').to('g') },
  lb: { dimension: 'mass', family: 'imperial', factor: convert(1, 'lb').to('g') },
  ml: { dimension: 'volume', family: 'metric', factor: convert(1, 'mL').to('mL') },
  l: { dimension: 'volume', family: 'metric', factor: convert(1, 'L').to('mL') },
  tsp: { dimension: 'volume', family: 'both', factor: convert(1, 'tsp').to('mL') },
  tbsp: { dimension: 'volume', family: 'both', factor: convert(1, 'tbsp').to('mL') },
  cup: { dimension: 'volume', family: 'imperial', factor: convert(1, 'cup').to('mL') },
  'fl oz': { dimension: 'volume', family: 'imperial', factor: convert(1, 'fl oz').to('mL') },
  pint: { dimension: 'volume', family: 'imperial', factor: convert(1, 'imperial pint').to('mL') }
};

const unitInfo = (unit: string): UnitInfo => ({ unit, ...MEASURED[unit] });

const UNIT_ALIASES: [string[], UnitInfo][] = [
  [['g', 'gr', 'gm', 'gms', 'gram', 'grams', 'gramme', 'grammes'], unitInfo('g')],
  [['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'], unitInfo('kg')],
  [['oz', 'ounce', 'ounces'], unitInfo('oz')],
  [['lb', 'lbs', 'pound', 'pounds'], unitInfo('lb')],
  [['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters'], unitInfo('ml')],
  [['l', 'ltr', 'litre', 'litres', 'liter', 'liters'], unitInfo('l')],
  [['tsp', 'tsps', 'tspn', 'teaspoon', 'teaspoons'], unitInfo('tsp')],
  [['tbsp', 'tbsps', 'tbs', 'tbls', 'tblsp', 'tblspn', 'tbl', 'tablespoon', 'tablespoons'], unitInfo('tbsp')],
  [['cup', 'cups'], unitInfo('cup')],
  [['fl oz', 'fl. oz', 'fl.oz', 'fluid ounce', 'fluid ounces'], unitInfo('fl oz')],
  [['pint', 'pints', 'pt'], unitInfo('pint')],
  // Counted units: added up only with the same unit
  ...([
    ['clove', ['clove', 'cloves']], ['can', ['can', 'cans', 'tin', 'tins']], ['slice', ['slice', 'slices']],
    ['piece', ['piece', 'pieces', 'pcs']], ['bunch', ['bunch', 'bunches']], ['handful', ['handful', 'handfuls']],
    ['sprig', ['sprig', 'sprigs']], ['stick', ['stick', 'sticks']], ['leaf', ['leaf', 'leaves']],
    ['pinch', ['pinch', 'pinches']], ['dash', ['dash', 'dashes']], ['packet', ['packet', 'packets', 'pack', 'packs', 'package', 'packages', 'sachet', 'sachets']],
    ['jar', ['jar', 'jars']], ['bottle', ['bottle', 'bottles']], ['head', ['head', 'heads']], ['stalk', ['stalk', 'stalks']],
    ['fillet', ['fillet', 'fillets']], ['sheet', ['sheet', 'sheets']], ['cube', ['cube', 'cubes']], ['knob', ['knob', 'knobs']],
    ['rasher', ['rasher', 'rashers']], ['bag', ['bag', 'bags']], ['block', ['block', 'blocks']], ['stem', ['stem', 'stems']]
  ] as [string, string[]][]).map(([unit, aliases]) => [aliases, { unit, dimension: 'count' as const, family: 'both' as const, factor: 1 }] as [string[], UnitInfo])
];

// Longest alias first, so "fl oz" wins over "oz" and "tbsp" over "tbs"
const ALIASES = UNIT_ALIASES.flatMap(([aliases, info]) => aliases.map(alias => ({ alias, info }))).sort((a, b) => b.alias.length - a.alias.length);

// ---------------------------------------------------------------------------
// Parsing a measure

export interface ParsedMeasure {
  /** For a range ("2-3") the upper amount, which is what to buy */
  amount: number | null;
  /** The lower amount of a range, otherwise null */
  low: number | null;
  /** 2 for "2 x 400g": the amounts above are totals for all of them */
  multiplier: number;
  unit: string;
  dimension: Dimension;
  family: UnitFamily;
  factor: number;
  /** Anything that isn't an amount: "chopped", "to taste", "pinch" */
  note: string;
}

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const QTY = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?(?:\s*[½¼¾⅓⅔⅛])?|[½¼¾⅓⅔⅛])`;
const LEADING_QTY = new RegExp(`^(${QTY})(?:\\s*(?:-|–|to)\\s*(${QTY}))?`);

function quantityValue(text: string): number {
  const t = text.trim();
  const mixed = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = /^(\d+)\/(\d+)$/.exec(t);
  if (fraction) return Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : NaN;
  const unicode = /^(\d+(?:[.,]\d+)?)?\s*([½¼¾⅓⅔⅛])$/.exec(t);
  if (unicode) return Number((unicode[1] ?? '0').replace(',', '.')) + FRACTIONS[unicode[2]];
  return Number(t.replace(',', '.'));
}

const tidyNote = (text: string) => text.replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, '').replace(/\s+/g, ' ');

export function parseMeasure(raw: string): ParsedMeasure {
  let text = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  const empty = { low: null, multiplier: 1, unit: '', dimension: 'count' as Dimension, family: 'both' as UnitFamily, factor: 1 };

  // "juice of 1", "zest and juice of 2" -> 1 or 2 of the ingredient
  const of = /^(juice|zest|grated zest|zest and juice|juice and zest) of (.+)$/.exec(text);
  if (of) {
    const amount = LEADING_QTY.exec(of[2]);
    if (amount) return { ...empty, amount: quantityValue(amount[2] ?? amount[1]), note: of[1] };
  }

  // "2 x 400g" -> 800 g
  let multiplier = 1;
  const times = /^(\d+)\s*x\s*/.exec(text);
  if (times) {
    multiplier = Number(times[1]);
    text = text.slice(times[0].length);
  }

  const qty = LEADING_QTY.exec(text);
  if (!qty) return { ...empty, amount: null, note: tidyNote(raw) };

  const amount = quantityValue(qty[2] ?? qty[1]) * multiplier;
  if (!Number.isFinite(amount) || amount <= 0) return { ...empty, amount: null, note: tidyNote(raw) };
  const lowValue = qty[2] ? quantityValue(qty[1]) * multiplier : NaN;
  const low = Number.isFinite(lowValue) && lowValue > 0 && lowValue < amount ? lowValue : null;
  let rest = text.slice(qty[0].length).trim();

  const match = ALIASES.find(({ alias }) => rest.startsWith(alias) && !/[a-z]/.test(rest.charAt(alias.length)));
  if (match) {
    rest = rest.slice(match.alias.length);
    // "200g/7oz": the second unit is the same amount again
    rest = rest.replace(/^\s*\/\s*\S+/, '');
    return { amount, low, multiplier, ...match.info, note: tidyNote(rest.replace(/^\s*of\b/, '')) };
  }

  // "2 large", "1 whole": a plain count; the size stays as a note
  return { ...empty, amount, low, multiplier, note: tidyNote(rest) };
}

// ---------------------------------------------------------------------------
// Choosing units

/** Whether a unit already suits the system, so it's kept as written. */
export function keepsUnit(unit: string, system: UnitSystem): boolean {
  const family = MEASURED[unit]?.family ?? 'both';
  if (system === 'original') return family !== 'metric';
  return family === 'both' || family === system;
}

/** The unit a cook would use for this many grams or millilitres. */
export function pickUnit(base: number, dimension: 'mass' | 'volume', system: 'metric' | 'imperial'): string {
  if (dimension === 'mass') {
    if (system === 'metric') return base >= 1000 ? 'kg' : 'g';
    return base >= MEASURED.lb.factor * 0.99 ? 'lb' : 'oz';
  }
  if (system === 'metric') return base >= 1000 ? 'l' : 'ml';
  // Small amounts are measured with spoons, not fractions of a cup
  if (base < MEASURED.tbsp.factor * 0.99) return 'tsp';
  if (base < (MEASURED.cup.factor / 4) * 0.99) return 'tbsp';
  return 'cup';
}

/** Grams or millilitres in one of this unit. */
export const unitFactor = (unit: string) => MEASURED[unit]?.factor ?? 1;

// ---------------------------------------------------------------------------
// Writing amounts

/** "nearest" for showing a recipe; "up" for a shopping list (buy enough). */
export type Rounding = 'nearest' | 'up';

const FRACTION_GLYPHS: [number, string][] = [[0, ''], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];

/** 1.5 -> "1 ½", 0.3 -> "⅓"; whole numbers from 10 up. Never "0". */
function fractionText(value: number, rounding: Rounding): string {
  if (value >= 10) return String(rounding === 'up' ? Math.ceil(value - 0.01) : Math.round(value));
  let whole = Math.floor(value);
  const rest = value - whole;
  const [fraction, glyph] = rounding === 'up'
    ? FRACTION_GLYPHS.find(([f]) => f >= rest - 0.01)!
    : FRACTION_GLYPHS.reduce((best, candidate) => (Math.abs(candidate[0] - rest) < Math.abs(best[0] - rest) ? candidate : best));
  if (fraction === 1) whole += 1;
  const text = [whole || '', glyph].filter(Boolean).join(' ');
  return text || '⅛';
}

/** Round to a step that suits the size: 7 g, 85 g, 240 ml, 1.25 kg. */
function metricNumber(value: number, unit: string, rounding: Rounding): string {
  const round = rounding === 'up' ? Math.ceil : Math.round;
  if (unit === 'kg' || unit === 'l') return String(Number((round(value * 100 - 0.001) / 100).toFixed(2)));
  const step = value < 20 ? 1 : value < 100 ? 5 : 10;
  return String(Math.max(1, round(value / step - 0.001) * step));
}

const PLURALS: Record<string, string> = { leaf: 'leaves', bunch: 'bunches', pinch: 'pinches', dash: 'dashes' };
/** Units written the same for any amount: "2 lb", "3 tbsp", "500 g". */
const INVARIANT = new Set(['g', 'kg', 'ml', 'l', 'oz', 'lb', 'tsp', 'tbsp', 'fl oz']);

export function pluralUnit(unit: string, amount: number): string {
  if (amount <= 1 || INVARIANT.has(unit)) return unit;
  return PLURALS[unit] ?? `${unit}s`;
}

/** The number alone, rounded the way this unit is usually written. */
export function formatNumber(amount: number, unit: string, rounding: Rounding = 'nearest'): string {
  return MEASURED[unit]?.family === 'metric' ? metricNumber(amount, unit, rounding) : fractionText(amount, rounding);
}

/** "1 ½ cups", "450 g", "3 cloves", or just "2" for a plain count. */
export function formatAmount(amount: number, unit: string, rounding: Rounding = 'nearest'): string {
  const number = formatNumber(amount, unit, rounding);
  // Plural from what's shown: "1 cup" even when the exact amount is 1.04
  const shownMoreThanOne = /^\d/.test(number) && number !== '1';
  return unit ? `${number} ${pluralUnit(unit, shownMoreThanOne ? 2 : 1)}` : number;
}

// ---------------------------------------------------------------------------
// Converting a measure for display

// "200g/7oz", "1 cup / 240ml": the left side ends in a unit, the right starts
// with a number. ("1/2 cup" doesn't match: its left side is just "1".)
const DUAL_MEASURE = /^(.*[a-z.])\s*\/\s*(\d.*)$/i;

/**
 * A recipe's measure in the chosen system: "8 oz" -> "230 g" (metric),
 * "250ml" -> "1 cup" (imperial). Measures that already suit the system,
 * counts, spoons and notes ("pinch") come back unchanged.
 */
export function convertMeasure(raw: string, system: UnitSystem): string {
  if (system === 'original') return raw;

  // The recipe already gives both: use the one that was asked for
  const dual = DUAL_MEASURE.exec(raw);
  if (dual) {
    const [left, right] = [parseMeasure(dual[1]), parseMeasure(dual[2])];
    if (right.amount !== null && right.dimension !== 'count' && right.family === system) return dual[2].trim();
    if (left.amount !== null && left.dimension !== 'count' && left.family === system) {
      return [dual[1].trim(), right.note].filter(Boolean).join(' ');
    }
  }

  const parsed = parseMeasure(raw);
  if (parsed.amount === null || parsed.dimension === 'count' || keepsUnit(parsed.unit, system)) return raw;

  // "2 x 400g tins" -> "2 x 14 oz tins": convert one of them, not the total
  const each = parsed.multiplier;
  const unit = pickUnit((parsed.amount / each) * parsed.factor, parsed.dimension, system);
  const toUnit = (amount: number) => ((amount / each) * parsed.factor) / unitFactor(unit);
  const high = formatAmount(toUnit(parsed.amount), unit);
  const text = parsed.low === null ? high : `${formatNumber(toUnit(parsed.low), unit)}–${high}`;
  return [each > 1 ? `${each} x ${text}` : text, parsed.note].filter(Boolean).join(' ');
}
