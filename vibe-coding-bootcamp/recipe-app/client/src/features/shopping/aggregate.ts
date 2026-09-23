/**
 * Turns the ingredients of several recipes into one shopping list.
 *
 * TheMealDB measures are free text ("175g", "1 ½ cups", "3 cloves minced",
 * "juice of 1", "pinch", "200g/7oz"). Each is parsed into an amount, a unit
 * and a note; amounts of the same ingredient are then added up:
 *   - mass (g, kg, oz, lb) and volume (ml, l, tsp, tbsp, cup, fl oz, pint)
 *     convert within their kind. If every entry used the same unit, the total
 *     stays in that unit ("1 ½ cups"); mixed units are totalled in metric.
 *   - counted things add up per unit: "2" + "3 large" eggs = 5; "2 cloves" +
 *     "3 cloves" = 5 cloves. Different units stay side by side ("1 can + 200 g").
 *   - measures without a number ("pinch", "to taste") are kept as notes.
 * Nothing here touches the DOM, so it can be tested on its own.
 */
import type { Meal } from '@/lib/meal';

// ---------------------------------------------------------------------------
// Units

type Dimension = 'mass' | 'volume' | 'count';

interface UnitInfo {
  unit: string;
  dimension: Dimension;
  /** To grams (mass) or millilitres (volume); 1 for counted units */
  factor: number;
}

const UNIT_ALIASES: [string[], UnitInfo][] = [
  [['g', 'gr', 'gm', 'gms', 'gram', 'grams', 'gramme', 'grammes'], { unit: 'g', dimension: 'mass', factor: 1 }],
  [['kg', 'kgs', 'kilo', 'kilos', 'kilogram', 'kilograms'], { unit: 'kg', dimension: 'mass', factor: 1000 }],
  [['oz', 'ounce', 'ounces'], { unit: 'oz', dimension: 'mass', factor: 28.35 }],
  [['lb', 'lbs', 'pound', 'pounds'], { unit: 'lb', dimension: 'mass', factor: 453.6 }],
  [['ml', 'mls', 'millilitre', 'millilitres', 'milliliter', 'milliliters'], { unit: 'ml', dimension: 'volume', factor: 1 }],
  [['l', 'ltr', 'litre', 'litres', 'liter', 'liters'], { unit: 'l', dimension: 'volume', factor: 1000 }],
  [['tsp', 'tsps', 'tspn', 'teaspoon', 'teaspoons'], { unit: 'tsp', dimension: 'volume', factor: 4.93 }],
  [['tbsp', 'tbsps', 'tbs', 'tbls', 'tblsp', 'tblspn', 'tbl', 'tablespoon', 'tablespoons'], { unit: 'tbsp', dimension: 'volume', factor: 14.79 }],
  [['cup', 'cups'], { unit: 'cup', dimension: 'volume', factor: 240 }],
  [['fl oz', 'fl. oz', 'fl.oz', 'fluid ounce', 'fluid ounces'], { unit: 'fl oz', dimension: 'volume', factor: 29.57 }],
  [['pint', 'pints', 'pt'], { unit: 'pint', dimension: 'volume', factor: 568 }],
  // Counted units: added up only with the same unit
  ...([
    ['clove', ['clove', 'cloves']], ['can', ['can', 'cans', 'tin', 'tins']], ['slice', ['slice', 'slices']],
    ['piece', ['piece', 'pieces', 'pcs']], ['bunch', ['bunch', 'bunches']], ['handful', ['handful', 'handfuls']],
    ['sprig', ['sprig', 'sprigs']], ['stick', ['stick', 'sticks']], ['leaf', ['leaf', 'leaves']],
    ['pinch', ['pinch', 'pinches']], ['dash', ['dash', 'dashes']], ['packet', ['packet', 'packets', 'pack', 'packs', 'package', 'packages', 'sachet', 'sachets']],
    ['jar', ['jar', 'jars']], ['bottle', ['bottle', 'bottles']], ['head', ['head', 'heads']], ['stalk', ['stalk', 'stalks']],
    ['fillet', ['fillet', 'fillets']], ['sheet', ['sheet', 'sheets']], ['cube', ['cube', 'cubes']], ['knob', ['knob', 'knobs']],
    ['rasher', ['rasher', 'rashers']], ['bag', ['bag', 'bags']], ['block', ['block', 'blocks']], ['stem', ['stem', 'stems']]
  ] as [string, string[]][]).map(([unit, aliases]) => [aliases, { unit, dimension: 'count' as const, factor: 1 }] as [string[], UnitInfo])
];

// Longest alias first, so "fl oz" wins over "oz" and "tbsp" over "tbs"
const ALIASES = UNIT_ALIASES.flatMap(([aliases, info]) => aliases.map(alias => ({ alias, info }))).sort((a, b) => b.alias.length - a.alias.length);

const SIZE_WORDS = ['large', 'medium', 'small', 'whole', 'big', 'extra large'];

// ---------------------------------------------------------------------------
// Parsing a measure

export interface ParsedMeasure {
  amount: number | null;
  unit: string;
  dimension: Dimension;
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
  const empty = { unit: '', dimension: 'count' as Dimension, factor: 1 };

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

  // For a range ("2-3") buy the upper amount
  const amount = quantityValue(qty[2] ?? qty[1]) * multiplier;
  if (!Number.isFinite(amount) || amount <= 0) return { ...empty, amount: null, note: tidyNote(raw) };
  let rest = text.slice(qty[0].length).trim();

  const match = ALIASES.find(({ alias }) => rest.startsWith(alias) && !/[a-z]/.test(rest.charAt(alias.length)));
  if (match) {
    rest = rest.slice(match.alias.length);
    // "200g/7oz": the second unit is the same amount again
    rest = rest.replace(/^\s*\/\s*\S+/, '');
    return { amount, ...match.info, note: tidyNote(rest.replace(/^\s*of\b/, '')) };
  }

  // "2 large", "1 whole": a plain count; the size stays as a note
  const size = SIZE_WORDS.find(word => rest.startsWith(word));
  return { ...empty, amount, note: tidyNote(size ? rest : rest) };
}

// ---------------------------------------------------------------------------
// Names and aisles

/** Key for "the same ingredient": lower case, no "fresh", last word singular. */
export function ingredientKey(name: string): string {
  const words = name.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().replace(/^fresh /, '').split(' ');
  const last = words.pop() ?? '';
  const singular = /ies$/.test(last) ? last.replace(/ies$/, 'y')
    : /(oes|ches|shes|xes)$/.test(last) ? last.replace(/es$/, '')
    : /[^su]s$/.test(last) && last.length > 3 ? last.slice(0, -1)
    : last;
  return [...words, singular].join(' ');
}

export const AISLES = ['Produce', 'Meat & fish', 'Dairy & eggs', 'Bakery', 'Pantry', 'Spices & seasonings', 'Other'] as const;
export type Aisle = (typeof AISLES)[number];

// First match wins, so the order matters: "black pepper" is a spice before
// "pepper" is produce; "chicken stock" is pantry before "chicken" is meat;
// "coconut milk" is pantry before "milk" is dairy.
const AISLE_RULES: [Aisle, RegExp][] = [
  // "cloves" alone is the spice; "garlic cloves" is produce. "ground beef" is meat.
  ['Spices & seasonings', /\b(salt|black pepper|white pepper|peppercorns?|cayenne|paprika|cumin|cinnamon|turmeric|nutmeg|garam masala|curry powder|chil+i powder|chil+i flakes|red pepper flakes|oregano|dried (herbs|mixed herbs|thyme|rosemary|basil|parsley|mint|dill|sage|tarragon|chil+ies?)|bay lea(f|ves)|(?<!garlic )cloves?|allspice|carda?mom|cardomom|star anise|marjoram|caraway( seeds?)?|harissa|fennel seeds?|mustard seeds?|saffron|vanilla|mixed spice|five spice|za'?atar|sumac|seasoning|ground (cumin|coriander|cinnamon|ginger|nutmeg|cloves|allspice|cardamom|turmeric|black pepper|white pepper|paprika|fenugreek|mace))\b/],
  ['Pantry', /\b(stock|broth|bouillon|gravy|sauce|paste|puree|passata|oil|vinegar|coconut|peanut butter|noodles|almond milk|condensed milk|evaporated milk|hot ?sauce|dried (apricots?|fruit|cranberries|figs)|prunes|chopped tomatoes|tinned|canned|(butter|kidney|black|cannellini|borlotti|pinto|haricot|baked) beans?)\b/],
  ['Meat & fish', /\b(chicken|beef|pork|lamb|bacon|sausages?|chorizo|ham|mince|turkey|duck|veal|steak|fish|salmon|tuna|cod|haddock|prawns?|shrimp|crab|lobster|mussels?|clams?|squid|anchov(y|ies)|sardines?|mackerel|trout|scallops?|oysters?|venison|goat|rabbit|pancetta|prosciutto|salami|kidneys?|liver|oxtail|brisket|pork belly|codfish|saltfish|black pudding)\b/],
  ['Dairy & eggs', /\b(milk|butter|cream|cheese|yog(h)?urt|eggs?|egg (yolks?|whites?)|parmesan|mozzarella|cheddar|feta|ricotta|mascarpone|cr[eè]me fra[iî]che|ghee|paneer|halloumi|brie|gruy[eè]re|buttermilk|quark|custard)\b/],
  // No bare "roll": "kitchen roll" isn't bakery ("bread rolls" still matches "bread")
  ['Bakery', /\b(bread|baguette|tortillas?|pitt?a|buns?|naan|croissants?|brioche|breadcrumbs|puff pastry|shortcrust|filo|pastry|crumpets?|bagels?)\b/],
  ['Produce', /\b(\w*berr(y|ies)|scotch bonnets?|swede|celeriac|galangal|breadfruit|apricots?|challots?|onions?|garlic|shallots?|leeks?|tomato(es)?|potato(es)?|carrots?|celery|peppers?|chil+ies?|chil+i|jalape(n|ñ)os?|lettuce|spinach|kale|cabbage|broccoli|cauliflower|courgettes?|zucchini|aubergines?|eggplants?|cucumbers?|mushrooms?|squash|pumpkin|beetroot|radish(es)?|peas|bean sprouts|green beans|asparagus|sweetcorn|corn|avocados?|lemons?|limes?|oranges?|apples?|bananas?|berr(y|ies)|grapes?|mangoe?s?|pineapple|peach(es)?|pears?|plums?|cherr(y|ies)|melon|kiwi|ginger|basil|parsley|coriander|cilantro|mint|dill|chives|rosemary|thyme|sage|tarragon|spring onions?|scallions?|herbs|salad|rocket|watercress|fennel|okra|plantains?|yams?|cassava|rhubarb|figs?|dates|lemongrass|pak choi|bok choy|sweet potato(es)?)\b/],
  ['Pantry', /\b(flour|sugar|rice|pasta|spaghetti|penne|linguine|fettuccine|macaroni|lasagne|noodles|honey|syrup|oats?|lentils|chickpeas|beans|yeast|baking|bicarbonate|cocoa|chocolate|nuts?|almonds?|walnuts?|peanuts?|cashews?|pecans?|pistachios?|hazelnuts?|seeds?|lard|shortening|suet|treacle|molasses|starch|semolina|cornmeal|tapioca|sauerkraut|rose water|soya|sake|dulce de leche|raisins|sultanas|currants|ketchup|mayonnaise|mustard|soy|worcestershire|tahini|jam|couscous|quinoa|bulgur|polenta|cornflour|cornstarch|gelatine?|wine|beer|rum|brandy|sherry|breadcrumbs|crackers|biscuits|capers|olives|tomato)\b/]
];

export function aisleOf(name: string): Aisle {
  const text = name.toLowerCase();
  return AISLE_RULES.find(([, pattern]) => pattern.test(text))?.[0] ?? 'Other';
}

/** Water from the tap isn't shopping. */
const NOT_BOUGHT = /^(cold |hot |boiling |warm |iced )?water$|^ice( cubes)?$/;

// ---------------------------------------------------------------------------
// Aggregating

export interface ListRecipe {
  meal: Meal;
  /** How many times to make it: amounts are multiplied by this */
  batches: number;
}

export interface ListExtra {
  id: string;
  name: string;
}

export interface ShoppingItem {
  /** Stable id for ticking off: the ingredient key, or "extra:<id>" */
  key: string;
  name: string;
  aisle: Aisle;
  /** "450 g + 2 cans", or "" when only notes */
  quantity: string;
  /** Amounts by unit, for export: [{ amount: 450, unit: "g" }] */
  amounts: { amount: number; unit: string }[];
  /** Measures without a number, and preparation hints: "pinch", "to taste" */
  notes: string[];
  /** Names of the recipes that need it */
  recipes: string[];
  extra?: boolean;
}

interface Bucket {
  dimension: Dimension;
  units: Set<string>;
  /** Total in grams / millilitres (mass, volume) or in the unit (count) */
  base: number;
  /** Total in the original unit, used when only one unit was seen */
  inUnit: number;
  unit: string;
}

const SPOON_UNITS = new Set(['tsp', 'tbsp', 'cup', 'oz', 'lb', 'fl oz', 'pint']);
const FRACTION_GLYPHS: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾']];

/** 1.5 -> "1 ½", 0.25 -> "¼", rounded up to the nearest quarter (buy enough). */
function fractionText(value: number): string {
  const quarters = Math.max(1, Math.ceil(value * 4 - 0.01));
  const whole = Math.floor(quarters / 4);
  const glyph = FRACTION_GLYPHS.find(([f]) => Math.abs(f - (quarters % 4) / 4) < 0.01)?.[1];
  return [whole || '', glyph ?? ''].filter(Boolean).join(' ') || '0';
}

function metricText(value: number, dimension: 'mass' | 'volume'): string {
  const [small, big] = dimension === 'mass' ? ['g', 'kg'] : ['ml', 'l'];
  if (value >= 1000) return `${Number((value / 1000).toFixed(2))} ${big}`;
  const rounded = value >= 50 ? Math.ceil(value / 5) * 5 : Math.ceil(value);
  return `${rounded} ${small}`;
}

const PLURALS: Record<string, string> = { leaf: 'leaves', bunch: 'bunches', pinch: 'pinches', dash: 'dashes' };
const pluralUnit = (unit: string, amount: number) => (amount > 1 ? PLURALS[unit] ?? `${unit}s` : unit);

function bucketText(bucket: Bucket): string {
  if (bucket.dimension === 'count') {
    const amount = fractionText(bucket.base);
    return bucket.unit ? `${amount} ${pluralUnit(bucket.unit, bucket.base)}` : amount;
  }
  if (bucket.units.size === 1) {
    const [unit] = bucket.units;
    if (SPOON_UNITS.has(unit)) {
      const cupsOrUnit = unit === 'cup' ? pluralUnit('cup', bucket.inUnit) : unit;
      return `${fractionText(bucket.inUnit)} ${cupsOrUnit}`;
    }
  }
  return metricText(bucket.base, bucket.dimension);
}

export function aggregate(recipes: ListRecipe[], extras: ListExtra[] = []): ShoppingItem[] {
  const items = new Map<string, { name: string; buckets: Map<string, Bucket>; notes: Set<string>; recipes: Set<string> }>();

  for (const { meal, batches } of recipes) {
    for (const ingredient of meal.ingredients) {
      const key = ingredientKey(ingredient.name);
      if (!key || NOT_BOUGHT.test(key)) continue;
      let item = items.get(key);
      if (!item) {
        item = { name: ingredient.name.trim(), buckets: new Map(), notes: new Set(), recipes: new Set() };
        items.set(key, item);
      }
      item.recipes.add(meal.name);

      const parsed = parseMeasure(ingredient.measure);
      if (parsed.amount === null) {
        if (parsed.note) item.notes.add(parsed.note);
        continue;
      }
      const amount = parsed.amount * batches;
      const bucketKey = parsed.dimension === 'count' ? `count:${parsed.unit}` : parsed.dimension;
      const bucket = item.buckets.get(bucketKey) ?? { dimension: parsed.dimension, units: new Set(), base: 0, inUnit: 0, unit: parsed.unit };
      bucket.units.add(parsed.unit);
      bucket.base += amount * parsed.factor;
      bucket.inUnit += amount;
      item.buckets.set(bucketKey, bucket);
    }
  }

  const fromRecipes: ShoppingItem[] = [...items.entries()].map(([key, item]) => {
    const buckets = [...item.buckets.values()];
    return {
      key,
      name: item.name,
      aisle: aisleOf(item.name),
      quantity: buckets.map(bucketText).join(' + '),
      amounts: buckets.map(bucket =>
        bucket.dimension === 'count' || bucket.units.size === 1
          ? { amount: Number(bucket.inUnit.toFixed(3)), unit: bucket.dimension === 'count' ? bucket.unit : [...bucket.units][0] }
          : { amount: Math.round(bucket.base), unit: bucket.dimension === 'mass' ? 'g' : 'ml' }
      ),
      notes: [...item.notes],
      recipes: [...item.recipes]
    };
  });

  const fromExtras: ShoppingItem[] = extras.map(extra => ({
    key: `extra:${extra.id}`,
    name: extra.name,
    aisle: aisleOf(extra.name),
    quantity: '',
    amounts: [],
    notes: [],
    recipes: [],
    extra: true
  }));

  return [...fromRecipes, ...fromExtras].sort(
    (a, b) => AISLES.indexOf(a.aisle) - AISLES.indexOf(b.aisle) || a.name.localeCompare(b.name)
  );
}
