/**
 * Builds src/features/nutrition/foods.json, the nutrition table the recipe
 * page uses, from scripts/nutrition-foods.txt and USDA's SR Legacy dataset.
 *
 * Download and unzip the CSV version of SR Legacy from
 * https://fdc.nal.usda.gov/download-datasets (about 6 MB), then run:
 *
 *   node scripts/build-nutrition.mjs path/to/FoodData_Central_sr_legacy_food_csv_2018-04
 *
 * For each food it keeps, per 100 g: energy, protein, carbohydrate, fat,
 * fibre, sugars, saturated fat and sodium. From USDA's household portions it
 * works out a density (grams per ml, from cup/tbsp/tsp portions) and the
 * weight of one piece ("large" egg, garlic "clove", bread "slice").
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const usdaDir = process.argv[2];
if (!usdaDir) {
  console.error('Usage: node scripts/build-nutrition.mjs <folder with the SR Legacy CSV files>');
  process.exit(1);
}

const here = import.meta.dirname;
const MAPPING = resolve(here, 'nutrition-foods.txt');
const OUTPUT = resolve(here, '../src/features/nutrition/foods.json');

/** Minimal CSV reader: USDA quotes every field and doubles embedded quotes. */
function readCsv(file) {
  const [header, ...lines] = readFileSync(join(usdaDir, file), 'utf8').split(/\r?\n/).filter(Boolean);
  const fields = line => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map(match => match[1].replace(/""/g, '"'));
  const names = fields(header);
  return lines.map(line => Object.fromEntries(fields(line).map((value, index) => [names[index], value])));
}

// Energy (kcal), protein, carbohydrate, fat, fibre, sugars, saturated fat (g), sodium (mg)
const NUTRIENTS = ['1008', '1003', '1005', '1004', '1079', '2000', '1258', '1093'];

// --- The mapping --------------------------------------------------------------

const mapping = readFileSync(MAPPING, 'utf8')
  .split(/\r?\n/)
  .map(line => line.replace(/#.*$/, '').trim())
  .filter(Boolean)
  .map(line => {
    const [head, names] = line.split('|').map(part => part.trim());
    const [id, ...overrides] = head.split(/\s+/);
    return {
      id,
      overrides: Object.fromEntries(overrides.map(pair => pair.split('=')).map(([key, grams]) => [key, Number(grams)])),
      names: names.split(',').map(name => name.trim().toLowerCase()).filter(Boolean)
    };
  });

const wanted = new Set(mapping.map(entry => entry.id));

// --- USDA data ----------------------------------------------------------------

const descriptions = new Map(readCsv('food.csv').filter(row => wanted.has(row.fdc_id)).map(row => [row.fdc_id, row.description]));

const nutrients = new Map();
for (const row of readCsv('food_nutrient.csv')) {
  if (!wanted.has(row.fdc_id) || !NUTRIENTS.includes(row.nutrient_id)) continue;
  const values = nutrients.get(row.fdc_id) ?? Array(NUTRIENTS.length).fill(0);
  values[NUTRIENTS.indexOf(row.nutrient_id)] = Number(row.amount);
  nutrients.set(row.fdc_id, values);
}

// Household measures, in ml
const VOLUMES = { cup: 236.588, cups: 236.588, tbsp: 14.787, tablespoon: 14.787, tablespoons: 14.787, tsp: 4.929, teaspoon: 4.929, teaspoons: 4.929, 'fl oz': 29.574 };
// Piece words, first match wins: "slice, large" is a slice; "Potato large" is large
const PIECES = ['extra large', 'jumbo', 'large', 'medium', 'small', 'clove', 'slice', 'stalk', 'leaf', 'sprig', 'stick', 'cube', 'fillet', 'breast', 'thigh', 'drumstick', 'wing', 'leg', 'link', 'head', 'bulb', 'bunch', 'fruit', 'whole', 'piece', 'sheet', 'strip', 'chop', 'steak'];
// Portions that aren't one item of the food
const NOT_AN_ITEM = /^(oz|lb|cubic|nlea|serving|package|packet|container|unit|bar|box|can|jar|bottle|pat|dash|rings?|wedge|spear|strips?|slices?|quart|gallon|pint|liter|ml|fl)\b/;
const isMeat = description => /^(Chicken|Duck|Turkey|Goose|Beef|Pork|Lamb|Veal)\b/.test(description ?? '');
const singular = word => (word === 'leaves' ? 'leaf' : word.replace(/s$/, ''));

const portions = new Map();
for (const row of readCsv('food_portion.csv')) {
  if (!wanted.has(row.fdc_id)) continue;
  const amount = Number(row.amount) || 1;
  const grams = Number(row.gram_weight) / amount;
  if (!(grams > 0)) continue;
  const food = portions.get(row.fdc_id) ?? { density: undefined, pieces: {} };
  const modifier = row.modifier.toLowerCase();
  const head = modifier.split(/[,(]/)[0].trim();

  const volume = Object.keys(VOLUMES).find(unit => head === unit || head.startsWith(`${unit} `));
  if (volume) {
    // A plain "cup" or "tbsp" wins; otherwise the first, which is USDA's usual
    // form ("cup, chopped" for onions). Never whipped or packed.
    const plain = head === volume;
    if (!/whipped|packed|sifted/.test(modifier) && (food.density === undefined || (plain && !food.plainDensity))) {
      food.density = grams / VOLUMES[volume];
      food.plainDensity = plain;
    }
  } else if (/\byields\b/.test(head)) {
    // Juices: "lemon yields" is the juice of one fruit
    food.pieces.fruit ??= grams;
  } else {
    const words = head.split(/\s+/).map(singular).join(' ');
    const piece = PIECES.find(word => ` ${words} `.includes(` ${word} `));
    if (piece) food.pieces[piece] ??= grams;
    // Otherwise USDA names the item itself: "pepper", "cucumber (8-1/4"")", "pita, large"
    // (not for meat: USDA's "1 duck" or "1 chicken" isn't what "4 duck legs" means)
    else if (!NOT_AN_ITEM.test(head) && !isMeat(descriptions.get(row.fdc_id))) food.pieces.each ??= grams;
  }
  portions.set(row.fdc_id, food);
}

// --- Output -------------------------------------------------------------------

const round = value => Math.round(value * 1000) / 1000;
const foods = [];
const names = {};
const problems = [];

for (const entry of mapping) {
  const index = foods.length;
  if (entry.id === '0') {
    foods.push({ id: 0, name: 'Water', n: Array(NUTRIENTS.length).fill(0), density: 1 });
  } else {
    const description = descriptions.get(entry.id);
    if (!description) {
      problems.push(`FDC id ${entry.id} (${entry.names[0]}) isn't in the dataset`);
      continue;
    }
    const portion = portions.get(entry.id);
    const { density = portion?.density, ...pieceOverrides } = entry.overrides;
    const pieces = { ...portion?.pieces, ...pieceOverrides };
    foods.push({
      id: Number(entry.id),
      name: description,
      n: (nutrients.get(entry.id) ?? []).map(round),
      ...(density ? { density: round(density) } : {}),
      ...(Object.keys(pieces).length ? { pieces: Object.fromEntries(Object.entries(pieces).map(([key, grams]) => [key, round(grams)])) } : {})
    });
  }
  for (const name of entry.names) {
    if (name in names) problems.push(`"${name}" is listed twice`);
    names[name] = index;
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const table = {
  source: 'USDA FoodData Central, SR Legacy (April 2018)',
  nutrients: ['kcal', 'protein', 'carbs', 'fat', 'fibre', 'sugars', 'saturates', 'sodiumMg'],
  foods,
  names
};
writeFileSync(OUTPUT, JSON.stringify(table) + '\n');
console.log(`Wrote ${foods.length} foods and ${Object.keys(names).length} names to ${OUTPUT}`);
