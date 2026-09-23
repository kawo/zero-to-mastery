/**
 * Full-text search and filtering over the local recipe index
 * (lib/searchIndex.ts). Mounted under /api next to the TheMealDB proxy routes.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { indexStatus, search, suggestIngredients } from '../lib/searchIndex.js';
import { TIME_BUCKETS, type TimeBucket } from '../lib/cookTime.js';

export const searchRouter = Router();

class BadRequest extends Error {}

const SORTS = ['relevance', 'name', 'time'] as const;
const NAME = /^[\p{L}\p{N} &'(),.-]+$/u;

/** A single optional string query parameter, trimmed and length-checked. */
function one(req: Request, name: string, maxLength: number, pattern?: RegExp): string | undefined {
  const value = req.query[name];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw new BadRequest(`"${name}" must be a single value`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new BadRequest(`"${name}" is too long`);
  if (pattern && trimmed && !pattern.test(trimmed)) throw new BadRequest(`"${name}" has invalid characters`);
  return trimmed || undefined;
}

/** ?ing=chicken&ing=garlic (repeated) or ?ing=chicken,garlic */
function ingredientList(req: Request): string[] {
  const raw = req.query.ing;
  if (raw === undefined) return [];
  const values = (Array.isArray(raw) ? raw : [raw]).flatMap(value => String(value).split(','));
  const list = values.map(value => value.trim()).filter(Boolean);
  if (list.length > 10) throw new BadRequest('At most 10 ingredients');
  if (list.some(value => value.length > 50 || !NAME.test(value))) throw new BadRequest('Invalid ingredient');
  return [...new Set(list)];
}

/** The index is built in the background on first start; until then, say so. */
function requireIndex(res: Response): boolean {
  const status = indexStatus();
  if (status.meals > 0) return true;
  res.set('Retry-After', '5').status(503).json({ error: 'The recipe index is still being built. Try again in a few seconds.', indexing: true });
  return false;
}

// GET /api/recipes?q=&ing=&cuisine=&c=&time=&sort=&limit=&offset=
searchRouter.get('/recipes', (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireIndex(res)) return;
    const time = one(req, 'time', 10);
    if (time && !(time in TIME_BUCKETS)) throw new BadRequest(`"time" must be one of ${Object.keys(TIME_BUCKETS).join(', ')}`);
    const sort = one(req, 'sort', 10);
    if (sort && !SORTS.includes(sort as (typeof SORTS)[number])) throw new BadRequest(`"sort" must be one of ${SORTS.join(', ')}`);
    const limit = Number(one(req, 'limit', 3) ?? 24);
    const offset = Number(one(req, 'offset', 6) ?? 0);
    if (!Number.isInteger(limit) || !Number.isInteger(offset)) throw new BadRequest('"limit" and "offset" must be whole numbers');

    const result = search({
      q: one(req, 'q', 100),
      ingredients: ingredientList(req),
      cuisine: one(req, 'cuisine', 50, NAME),
      category: one(req, 'c', 50, NAME),
      time: time as TimeBucket | undefined,
      sort: sort as (typeof SORTS)[number] | undefined,
      limit,
      offset
    });
    res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=1200');
    res.json({ ...result, index: indexStatus() });
  } catch (error) {
    next(error);
  }
});

// GET /api/ingredients?q=chick  ->  ingredient names for autocomplete
searchRouter.get('/ingredients', (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!requireIndex(res)) return;
    const q = one(req, 'q', 50) ?? '';
    res.set('Cache-Control', 'public, max-age=3600');
    res.json({ ingredients: suggestIngredients(q) });
  } catch (error) {
    next(error);
  }
});

// GET /api/search-index  ->  { meals, builtAt, building }
searchRouter.get('/search-index', (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store').json(indexStatus());
});

searchRouter.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof BadRequest) {
    res.status(400).json({ error: error.message });
    return;
  }
  next(error);
});
