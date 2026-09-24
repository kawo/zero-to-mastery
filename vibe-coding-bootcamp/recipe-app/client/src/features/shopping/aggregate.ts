/**
 * Turns the ingredients of several recipes into one shopping list.
 *
 * Each measure is parsed (see lib/measure.ts), then amounts of the same
 * ingredient are added up:
 *   - mass and volume convert within their kind. If every entry used one unit
 *     that suits the chosen system, the total stays in it ("1 ½ cups");
 *     otherwise it's written in the chosen system (metric when "as written").
 *   - counted things add up per unit: "2" + "3 large" eggs = 5; "2 cloves" +
 *     "3 cloves" = 5 cloves. Different units stay side by side ("1 can + 200 g").
 *   - measures without a number ("pinch", "to taste") are kept as notes.
 * Nothing here touches the DOM, so it can be tested on its own.
 */
import { ingredientKey, type Meal } from '@/lib/meal';
import { formatAmount, keepsUnit, parseMeasure, pickUnit, unitFactor, type Dimension, type UnitSystem } from '@/lib/measure';

// ---------------------------------------------------------------------------
// Names and aisles

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

/** A bucket's total as an amount in one unit, in the chosen system. */
function bucketAmount(bucket: Bucket, system: UnitSystem): { amount: number; unit: string } {
  if (bucket.dimension === 'count') return { amount: bucket.base, unit: bucket.unit };
  const [only] = bucket.units;
  if (bucket.units.size === 1 && keepsUnit(only, system)) return { amount: bucket.inUnit, unit: only };
  const unit = pickUnit(bucket.base, bucket.dimension, system === 'imperial' ? 'imperial' : 'metric');
  return { amount: bucket.base / unitFactor(unit), unit };
}

export function aggregate(recipes: ListRecipe[], extras: ListExtra[] = [], system: UnitSystem = 'original'): ShoppingItem[] {
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
    const amounts = [...item.buckets.values()].map(bucket => bucketAmount(bucket, system));
    return {
      key,
      name: item.name,
      aisle: aisleOf(item.name),
      quantity: amounts.map(({ amount, unit }) => formatAmount(amount, unit, 'up')).join(' + '),
      amounts: amounts.map(({ amount, unit }) => ({ amount: Number(amount.toFixed(3)), unit })),
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
