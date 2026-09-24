/**
 * Local full-text search index over the whole TheMealDB catalogue.
 *
 * TheMealDB can only search meal names and filter by one thing at a time,
 * but search.php?f=<letter> returns complete recipes, so 26 requests fetch
 * everything. Those recipes are stored in SQLite (Node's built-in
 * node:sqlite) with an FTS5 table for ranked full-text search, plus plain
 * tables for exact filters (ingredient, cuisine, category, estimated time).
 *
 * The database is a file (SEARCH_DB_PATH), so restarts reuse it; it is
 * rebuilt in the background when older than SEARCH_REFRESH_HOURS.
 *
 * Where the disk isn't writable or doesn't last (Vercel), the index is built
 * at deploy time (buildIndex.ts) and shipped with the code; SEARCH_DB_SEED
 * points at that copy, which is copied to SEARCH_DB_PATH on a cold start.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mealdb } from './mealdb.js';
import { estimateCookMinutes, TIME_BUCKETS, type TimeBucket } from './cookTime.js';

const DB_PATH = resolve(process.env.SEARCH_DB_PATH || 'data/recipes.db');
const REFRESH_MS = (Number(process.env.SEARCH_REFRESH_HOURS) || 24) * 60 * 60 * 1000;
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const FETCH_CONCURRENCY = 4;
// A full catalogue is several hundred meals; far fewer means TheMealDB had a problem
const MIN_PLAUSIBLE_MEALS = 100;

type RawMeal = Record<string, string | null | undefined> & { idMeal: string; strMeal: string };

mkdirSync(dirname(DB_PATH), { recursive: true });
const SEED = process.env.SEARCH_DB_SEED;
if (SEED && !existsSync(DB_PATH) && existsSync(SEED)) copyFileSync(SEED, DB_PATH);
const db = new DatabaseSync(DB_PATH);

// Bump when the tables below change: an index file from an older version is
// dropped and rebuilt rather than migrated (it's only a cache of TheMealDB).
const SCHEMA_VERSION = 2;
const { user_version: storedVersion } = db.prepare('PRAGMA user_version').get() as { user_version: number };
if (storedVersion !== SCHEMA_VERSION) {
  db.exec(`
    DROP TABLE IF EXISTS meals_fts; DROP TABLE IF EXISTS meal_ingredients;
    DROP TABLE IF EXISTS meals; DROP TABLE IF EXISTS meta;
    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    cuisine TEXT,
    thumbnail TEXT,
    tags TEXT,
    cook_minutes INTEGER
  );
  CREATE TABLE IF NOT EXISTS meal_ingredients (
    meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    ingredient TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS meal_ingredients_by_ingredient ON meal_ingredients(ingredient);
  CREATE INDEX IF NOT EXISTS meal_ingredients_by_meal ON meal_ingredients(meal_id);
  -- porter: "tomatoes" finds "tomato"; remove_diacritics: "jalapeno" finds "jalapeño"
  CREATE VIRTUAL TABLE IF NOT EXISTS meals_fts USING fts5(
    meal_id UNINDEXED, name, ingredients, category, cuisine, tags, instructions,
    tokenize = 'porter unicode61 remove_diacritics 2'
  );
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
`);

// ---------------------------------------------------------------------------
// Building

export const normalizeIngredient = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * The cuisine filter uses strCountry: every recipe has it and it's always a
 * country name. strArea is missing on about a quarter of recipes and mixes
 * "Italian" with "France", so it's only used when there's no country.
 */
function cuisineOf(meal: RawMeal): string | null {
  return (meal.strCountry || meal.strArea || '').trim() || null;
}

function ingredientsOf(meal: RawMeal): string[] {
  const names: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] ?? '').trim();
    if (name) names.push(name);
  }
  return names;
}

let building: Promise<number> | null = null;

/** Fetches every recipe and replaces the index in one transaction. Returns the meal count. */
export function buildIndex(): Promise<number> {
  building ??= (async () => {
    try {
      const meals = new Map<string, RawMeal>();
      const failed: string[] = [];
      const queue = [...LETTERS];
      await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, async () => {
        for (let letter = queue.shift(); letter; letter = queue.shift()) {
          try {
            const data = (await mealdb(`search.php?f=${letter}`)) as { meals?: RawMeal[] | null };
            (data.meals ?? []).forEach(meal => meals.set(meal.idMeal, meal));
          } catch {
            failed.push(letter);
          }
        }
      }));

      // A partial fetch would silently drop recipes, so keep the old index instead
      if (failed.length || meals.size < MIN_PLAUSIBLE_MEALS) {
        throw new Error(`Index build incomplete (${meals.size} meals, failed letters: ${failed.join(',') || 'none'})`);
      }

      writeIndex([...meals.values()]);
      return meals.size;
    } finally {
      building = null;
    }
  })();
  return building;
}

function writeIndex(meals: RawMeal[]) {
  const insertMeal = db.prepare('INSERT INTO meals (id, name, category, cuisine, thumbnail, tags, cook_minutes) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const insertIngredient = db.prepare('INSERT INTO meal_ingredients (meal_id, ingredient) VALUES (?, ?)');
  const insertFts = db.prepare('INSERT INTO meals_fts (meal_id, name, ingredients, category, cuisine, tags, instructions) VALUES (?, ?, ?, ?, ?, ?, ?)');

  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM meal_ingredients; DELETE FROM meals; DELETE FROM meals_fts;');
    for (const meal of meals) {
      const ingredients = ingredientsOf(meal);
      const tags = (meal.strTags ?? '').split(',').map(tag => tag.trim()).filter(Boolean).join(', ');
      insertMeal.run(
        meal.idMeal, meal.strMeal.trim(), meal.strCategory || null, cuisineOf(meal),
        meal.strMealThumb || null, tags || null, estimateCookMinutes(meal.strInstructions)
      );
      new Set(ingredients.map(normalizeIngredient)).forEach(name => insertIngredient.run(meal.idMeal, name));
      insertFts.run(
        meal.idMeal, meal.strMeal, ingredients.join(', '), meal.strCategory ?? '',
        // Both, so a search for "Italian" or "Italy" finds it
        [meal.strCountry, meal.strArea].filter(Boolean).join(' '),
        tags, meal.strInstructions ?? ''
      );
    }
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('builtAt', ?)").run(new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function indexStatus() {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM meals').get() as { count: number };
  const builtAt = (db.prepare("SELECT value FROM meta WHERE key = 'builtAt'").get() as { value: string } | undefined)?.value ?? null;
  return { meals: count, builtAt, building: Boolean(building) };
}

/**
 * Folds the write-ahead log into the main file and closes the database, so
 * the index is one self-contained file that can be copied (buildIndex.ts).
 */
export function closeIndexAsSingleFile() {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
  db.close();
}

/** Builds now if the index is empty or stale, then re-checks on a timer. */
export function startIndexing() {
  const refreshIfStale = () => {
    const { meals, builtAt } = indexStatus();
    const stale = !builtAt || Date.now() - Date.parse(builtAt) > REFRESH_MS;
    if (meals === 0 || stale) {
      const started = Date.now();
      buildIndex()
        .then(count => console.log(`Search index built: ${count} recipes in ${((Date.now() - started) / 1000).toFixed(1)}s`))
        .catch(error => console.error('Search index build failed:', error.message));
    }
  };
  refreshIfStale();
  setInterval(refreshIfStale, 60 * 60 * 1000).unref();
}

// ---------------------------------------------------------------------------
// Querying

export interface SearchParams {
  q?: string;
  ingredients?: string[];
  /** A country name, e.g. "Italy" (see cuisineOf) */
  cuisine?: string;
  category?: string;
  time?: TimeBucket;
  sort?: 'relevance' | 'name' | 'time';
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  id: string;
  name: string;
  category: string | null;
  cuisine: string | null;
  thumbnail: string | null;
  cookMinutes: number | null;
  /** Matched text with \u0002 ... \u0003 around the hits, when there's a text query */
  snippet?: string;
}

/**
 * Turns what someone typed into a safe FTS5 query where all words must match.
 * Each word is quoted, so FTS5 operators and punctuation in the input are
 * treated as plain text. Whole words by default (the porter stemmer already
 * matches "tomatoes" to "tomato"); with prefix, "chick" also finds chicken.
 */
export function toFtsQuery(input: string, prefix = false): string | null {
  const words = input.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 8) ?? [];
  return words.length ? words.map(word => `"${word}"${prefix ? '*' : ''}`).join(' AND ') : null;
}

/** Escapes LIKE wildcards so a typed "%" or "_" is matched literally. */
const likeContains = (text: string) => `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`;

type Clause = { sql: string; params: SQLInputValue[] };

/** WHERE clauses for each filter, keyed so facets can leave their own filter out. */
function filterClauses(params: SearchParams, fts: string | null): Record<string, Clause[]> {
  const clauses: Record<string, Clause[]> = { text: [], ingredients: [], cuisine: [], category: [], time: [] };
  if (fts) {
    clauses.text.push({ sql: 'm.id IN (SELECT meal_id FROM meals_fts WHERE meals_fts MATCH ?)', params: [fts] });
  }
  // Every listed ingredient must appear; "chicken" also matches "chicken breast"
  for (const ingredient of params.ingredients ?? []) {
    clauses.ingredients.push({
      sql: "EXISTS (SELECT 1 FROM meal_ingredients mi WHERE mi.meal_id = m.id AND mi.ingredient LIKE ? ESCAPE '\\')",
      params: [likeContains(normalizeIngredient(ingredient))]
    });
  }
  if (params.cuisine) clauses.cuisine.push({ sql: 'm.cuisine = ?', params: [params.cuisine] });
  if (params.category) clauses.category.push({ sql: 'm.category = ?', params: [params.category] });
  if (params.time) {
    const { min, max } = TIME_BUCKETS[params.time];
    clauses.time.push({ sql: 'm.cook_minutes BETWEEN ? AND ?', params: [min, max] });
  }
  return clauses;
}

function where(clauses: Record<string, Clause[]>, omit?: string): Clause {
  const list = Object.entries(clauses).filter(([key]) => key !== omit).flatMap(([, value]) => value);
  return {
    sql: list.length ? `WHERE ${list.map(c => c.sql).join(' AND ')}` : '',
    params: list.flatMap(c => c.params)
  };
}

const countMatches = (all: Clause) =>
  (db.prepare(`SELECT COUNT(*) AS total FROM meals m ${all.sql}`).get(...all.params) as { total: number }).total;

export function search(params: SearchParams) {
  const limit = Math.min(Math.max(params.limit ?? 24, 1), 48);
  const offset = Math.max(params.offset ?? 0, 0);

  // Whole words first ("pie" shouldn't find "pieces"). If that finds almost
  // nothing, try prefixes too, so a partial word like "chick" finds chicken
  // and not just the one "Chick-Fil-A"; keep whichever finds more.
  let fts = params.q ? toFtsQuery(params.q) : null;
  let clauses = filterClauses(params, fts);
  let all = where(clauses);
  let total = countMatches(all);
  let matchedPrefix = false;
  if (fts && total < 3) {
    const prefixFts = toFtsQuery(params.q!, true);
    const prefixClauses = filterClauses(params, prefixFts);
    const prefixAll = where(prefixClauses);
    const prefixTotal = countMatches(prefixAll);
    if (prefixTotal > total) {
      [fts, clauses, all, total, matchedPrefix] = [prefixFts, prefixClauses, prefixAll, prefixTotal, true];
    }
  }
  const sort = params.sort ?? (fts ? 'relevance' : 'name');

  let rows: SearchResult[];
  if (fts && sort === 'relevance') {
    // The join's MATCH does the text filtering (and feeds bm25/snippet), so
    // the text clause's subquery is left out here.
    // bm25 weights per column: name, ingredients, category, cuisine, tags, instructions.
    // A hit in the name counts ten times one in the method.
    const others = where(clauses, 'text');
    rows = db.prepare(`
      SELECT m.id, m.name, m.category, m.cuisine, m.thumbnail, m.cook_minutes AS cookMinutes,
             snippet(meals_fts, -1, char(2), char(3), '…', 12) AS snippet
      FROM meals_fts f JOIN meals m ON m.id = f.meal_id
      ${others.sql ? `${others.sql} AND` : 'WHERE'} meals_fts MATCH ?
      ORDER BY bm25(meals_fts, 10.0, 5.0, 3.0, 3.0, 3.0, 1.0)
      LIMIT ? OFFSET ?
    `).all(...others.params, fts, limit, offset) as unknown as SearchResult[];
  } else {
    const order = sort === 'time' ? 'm.cook_minutes IS NULL, m.cook_minutes, m.name' : 'm.name COLLATE NOCASE';
    rows = db.prepare(`
      SELECT m.id, m.name, m.category, m.cuisine, m.thumbnail, m.cook_minutes AS cookMinutes
      ${fts ? ', (SELECT snippet(meals_fts, -1, char(2), char(3), \'…\', 12) FROM meals_fts WHERE meal_id = m.id AND meals_fts MATCH ?) AS snippet' : ''}
      FROM meals m ${all.sql}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `).all(...(fts ? [fts] : []), ...all.params, limit, offset) as unknown as SearchResult[];
  }

  return {
    total,
    /** True when no whole-word match existed and partial words were used */
    matchedPrefix,
    results: rows.map(row => ({ ...row, snippet: row.snippet || undefined })),
    facets: facets(clauses)
  };
}

/**
 * Counts for each filter option, given the other active filters. A facet
 * ignores its own filter, so picking "Italian" still shows how many
 * "Mexican" recipes there would be.
 */
function facets(clauses: Record<string, Clause[]>) {
  const count = (column: string, omit: string) => {
    const w = where(clauses, omit);
    return db.prepare(`
      SELECT ${column} AS name, COUNT(*) AS count FROM meals m ${w.sql ? `${w.sql} AND` : 'WHERE'} ${column} IS NOT NULL
      GROUP BY ${column} ORDER BY ${column}
    `).all(...w.params) as unknown as { name: string; count: number }[];
  };

  const timeWhere = where(clauses, 'time');
  const time = (Object.keys(TIME_BUCKETS) as TimeBucket[]).map(bucket => {
    const { min, max } = TIME_BUCKETS[bucket];
    const { count } = db.prepare(`
      SELECT COUNT(*) AS count FROM meals m ${timeWhere.sql ? `${timeWhere.sql} AND` : 'WHERE'} m.cook_minutes BETWEEN ? AND ?
    `).get(...timeWhere.params, min, max) as { count: number };
    return { bucket, label: TIME_BUCKETS[bucket].label, count };
  });

  return { cuisines: count('m.cuisine', 'cuisine'), categories: count('m.category', 'category'), time };
}

/** Ingredient names for autocomplete: prefix matches first, then other matches, by popularity. */
export function suggestIngredients(prefix: string, limit = 10) {
  const text = normalizeIngredient(prefix);
  if (!text) return [];
  const escaped = text.replace(/[\\%_]/g, char => `\\${char}`);
  return db.prepare(`
    SELECT ingredient AS name, COUNT(*) AS count FROM meal_ingredients
    WHERE ingredient LIKE ? ESCAPE '\\'
    GROUP BY ingredient
    ORDER BY ingredient LIKE ? ESCAPE '\\' DESC, count DESC, ingredient
    LIMIT ?
  `).all(`%${escaped}%`, `${escaped}%`, limit) as unknown as { name: string; count: number }[];
}
