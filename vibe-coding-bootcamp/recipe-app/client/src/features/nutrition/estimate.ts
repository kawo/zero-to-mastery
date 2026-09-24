/**
 * Nutrition estimates for a recipe, from the USDA table in foods.json (built
 * by scripts/build-nutrition.mjs).
 *
 * Each ingredient is matched to a USDA food by name, and its measure is turned
 * into grams:
 *   - weights convert directly ("200g", "1 lb")
 *   - volumes use the food's density from USDA's cup/tbsp/tsp portions, so a
 *     cup of flour is 125 g but a cup of milk is 244 g
 *   - counts use USDA's piece weights ("2 large eggs", "3 cloves", "1 slice"),
 *     then a few common kitchen units ("pinch", "knob", "can")
 * Ingredients that can't be matched or weighed are left out and reported, so
 * the page can say what the estimate is based on.
 * Nothing here touches the DOM, so it can be tested on its own.
 */
import { ingredientKey, type Meal } from '@/lib/meal';
import { parseMeasure } from '@/lib/measure';

export interface FoodTable {
  source: string;
  foods: Food[];
  /** Ingredient name -> index into foods */
  names: Record<string, number>;
}

interface Food {
  id: number;
  name: string;
  /** Per 100 g: kcal, protein, carbs, fat, fibre, sugars, saturates (g), sodium (mg) */
  n: number[];
  /** Grams per ml */
  density?: number;
  /** Grams in one piece: { large: 50, clove: 3, each: 175 } */
  pieces?: Record<string, number>;
}

export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fibre: number;
  sugars: number;
  saturates: number;
  salt: number;
}

export type SkipReason = 'no-amount' | 'unknown-food' | 'unknown-unit';

export interface IngredientEstimate {
  name: string;
  measure: string;
  /** The USDA food it was matched to */
  food?: string;
  grams?: number;
  nutrients?: Nutrients;
  /** Why it isn't counted */
  skipped?: SkipReason;
  /** Frying oil: only the part food absorbs is counted */
  frying?: boolean;
}

export interface Estimate {
  /** For the whole recipe */
  total: Nutrients;
  ingredients: IngredientEstimate[];
  counted: number;
}

const ZERO: Nutrients = { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sugars: 0, saturates: 0, salt: 0 };

// Weights for kitchen units when USDA has none for the food
const COMMON_PIECES: Record<string, number> = { pinch: 0.4, dash: 0.6, knob: 15, handful: 30, sprig: 1, leaf: 0.2, clove: 3, can: 400, cube: 10, rasher: 25 };
// A plain count ("2 onions") uses the first of these the food has
const DEFAULT_PIECES = ['each', 'medium', 'large', 'fruit', 'clove', 'piece', 'breast', 'thigh', 'drumstick', 'leg', 'fillet', 'link', 'stalk', 'head', 'cube', 'slice', 'small'];
const SIZES = ['extra large', 'jumbo', 'large', 'medium', 'small', 'whole'];
// Zest of one lemon, lime or orange
const ZEST_GRAMS = 2;
// Deep-frying: food soaks up only part of the oil in the pan. A cup or more
// of oil counts as frying oil when the method fries; over 3 cups, always.
const FRYING_OIL = { minGrams: 230, alwaysGrams: 700, absorbed: 0.1 };
const FRIES = /\b(deep[- ]?)?fr(y|ies|ied|ying)\b|\bhot oil\b|\bheat (the )?oil\b/i;
const isOil = (food: Food) => /^(Oil,|Lard|Shortening|Butter oil)/.test(food.name);

// Words to drop when a name isn't in the table: "finely chopped parsley" -> "parsley"
const MODIFIERS = new Set([
  'fresh', 'freshly', 'chopped', 'finely', 'roughly', 'minced', 'sliced', 'diced', 'grated', 'crushed', 'shredded', 'peeled', 'toasted',
  'beaten', 'softened', 'large', 'small', 'medium', 'whole', 'free-range', 'organic', 'raw', 'frozen', 'boneless', 'skinless', 'lean',
  'ripe', 'baby', 'cold', 'warm', 'good', 'quality', 'extra'
]);

const NOT_BY_LAST_WORD = new Set(['milk']);

/** The table's names, keyed the same way as recipe ingredients. */
function nameIndex(table: FoodTable): Map<string, Food> {
  return new Map(Object.entries(table.names).map(([name, index]) => [ingredientKey(name), table.foods[index]]));
}

const cache = new WeakMap<FoodTable, Map<string, Food>>();

function findFood(table: FoodTable, name: string): Food | undefined {
  let index = cache.get(table);
  if (!index) {
    index = nameIndex(table);
    cache.set(table, index);
  }
  // "Free-range egg, beaten" -> "free-range egg" -> "egg"
  const words = ingredientKey(name.split(',')[0]).split(' ');
  while (words.length) {
    const food = index.get(words.join(' '));
    if (food) return food;
    if (!MODIFIERS.has(words[0])) break;
    words.shift();
  }
  // Last resort, the last word: "bowtie pasta" -> pasta, "napa cabbage" -> cabbage.
  // Not milk: almond or oat milk is nothing like cow's milk.
  const last = words.at(-1);
  return words.length > 1 && last && !NOT_BY_LAST_WORD.has(last) ? index.get(last) : undefined;
}

function nutrientsFor(food: Food, grams: number): Nutrients {
  const [kcal = 0, protein = 0, carbs = 0, fat = 0, fibre = 0, sugars = 0, saturates = 0, sodiumMg = 0] = food.n.map(value => (value * grams) / 100);
  // Salt as food labels give it: sodium x 2.5
  return { kcal, protein, carbs, fat, fibre, sugars, saturates, salt: (sodiumMg * 2.5) / 1000 };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return Object.fromEntries(Object.keys(ZERO).map(key => [key, a[key as keyof Nutrients] + b[key as keyof Nutrients]])) as unknown as Nutrients;
}

export function divideNutrients(a: Nutrients, by: number): Nutrients {
  return Object.fromEntries(Object.entries(a).map(([key, value]) => [key, value / by])) as unknown as Nutrients;
}

/** Grams of one ingredient, or why it can't be weighed. */
function weigh(table: FoodTable, name: string, measure: string): { food?: Food; grams?: number; skipped?: SkipReason } {
  let parsed = parseMeasure(measure);
  // "Pepper · 1 red", "Chilli · 1 green": the colour picks the food
  const colour = /^(red|green|yellow|orange)\b/.exec(parsed.note)?.[1];
  const food = (colour && findFood(table, `${colour} ${name}`)) || findFood(table, name);
  if (!food) return { skipped: 'unknown-food' };

  // "pinch", "a dash": one of them
  const bare = /^(?:a\s+)?(pinch|dash|knob|handful|sprig)\b/i.exec(parsed.note);
  if (parsed.amount === null && bare) parsed = { ...parsed, amount: 1, unit: bare[1].toLowerCase(), note: '' };
  if (parsed.amount === null) return { food, skipped: 'no-amount' };

  if (parsed.dimension === 'mass') return { food, grams: parsed.amount * parsed.factor };
  if (parsed.dimension === 'volume') {
    return food.density ? { food, grams: parsed.amount * parsed.factor * food.density } : { food, skipped: 'unknown-unit' };
  }

  // "juice of 1" lemon: the juice's own food and yield per fruit
  if (/juice/.test(parsed.note) && !/juice/.test(name.toLowerCase())) {
    const juice = findFood(table, `${name} juice`);
    if (juice?.pieces?.fruit) return { food: juice, grams: parsed.amount * juice.pieces.fruit };
  }
  if (/zest/.test(parsed.note) && !/zest/.test(name.toLowerCase())) {
    const zest = findFood(table, `${name} zest`);
    if (zest) return { food: zest, grams: parsed.amount * ZEST_GRAMS };
  }

  const pieces = food.pieces ?? {};
  let each: number | undefined;
  if (parsed.unit) {
    each = pieces[parsed.unit] ?? COMMON_PIECES[parsed.unit];
  } else {
    // "4 duck legs": the name says which piece; "2 large": the note says the size
    const named = ingredientKey(name).split(' ').pop()!;
    const size = SIZES.find(word => parsed.note.startsWith(word));
    each = pieces[named] || (size && pieces[size]) || DEFAULT_PIECES.map(key => pieces[key]).find(Boolean);
  }
  if (!each) return { food, skipped: 'unknown-unit' };
  return { food, grams: parsed.amount * each };
}

export function estimateNutrition(meal: Meal, table: FoodTable): Estimate {
  let total = ZERO;
  let counted = 0;
  const fries = FRIES.test(meal.instructions);
  const ingredients = meal.ingredients.map(({ name, measure }): IngredientEstimate => {
    const { food, grams, skipped } = weigh(table, name, measure);
    if (!food || grams === undefined) return { name, measure, food: food?.name, skipped: skipped ?? 'unknown-food' };
    // A litre of oil in a recipe that fries is for the pan, not the plate
    const frying = isOil(food) && grams >= (fries ? FRYING_OIL.minGrams : FRYING_OIL.alwaysGrams);
    const eaten = frying ? grams * FRYING_OIL.absorbed : grams;
    const nutrients = nutrientsFor(food, eaten);
    total = addNutrients(total, nutrients);
    counted += 1;
    return { name, measure, food: food.name, grams: eaten, nutrients, ...(frying && { frying }) };
  });
  return { total, ingredients, counted };
}
