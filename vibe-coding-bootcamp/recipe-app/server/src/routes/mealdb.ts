/**
 * /api routes. Each one validates its input, forwards to TheMealDB through
 * lib/mealdb.ts (which adds the API key), and sets cache headers suited to
 * how often that data changes.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { IMAGE_ORIGIN, UpstreamError, mealdb } from '../lib/mealdb.js';

export const mealdbRouter = Router();

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

class BadRequest extends Error {}

/** Wraps async handlers so rejected promises reach the error middleware. */
const handle = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

function queryString(req: Request, name: string, maxLength: number, pattern?: RegExp): string {
  const value = req.query[name];
  if (value === undefined) return '';
  if (typeof value !== 'string') throw new BadRequest(`"${name}" must be a single value`);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new BadRequest(`"${name}" is too long`);
  if (pattern && trimmed && !pattern.test(trimmed)) throw new BadRequest(`"${name}" has invalid characters`);
  return trimmed;
}

/** max-age for browsers; stale-while-revalidate lets caches serve old data while refreshing. */
function cacheFor(res: Response, seconds: number) {
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 4}`);
}

/** TheMealDB returns { meals: null } for "nothing found"; make that an empty list. */
function mealsList(data: unknown) {
  const meals = (data as { meals?: unknown })?.meals;
  return { meals: Array.isArray(meals) ? meals : [] };
}

// GET /api/search?q=chicken  ->  search.php?s=chicken
mealdbRouter.get('/search', handle(async (req, res) => {
  const q = queryString(req, 'q', 100);
  const data = await mealdb(`search.php?s=${encodeURIComponent(q)}`, 5 * MINUTE);
  cacheFor(res, 300);
  res.json(mealsList(data));
}));

// GET /api/meal/52772  ->  lookup.php?i=52772
mealdbRouter.get('/meal/:id', handle(async (req, res) => {
  const id = String(req.params.id);
  if (!/^\d{1,10}$/.test(id)) throw new BadRequest('Meal id must be a number');
  const data = await mealdb(`lookup.php?i=${id}`, 30 * MINUTE);
  // Unknown ids come back as { meals: null }, invalid ones as { meals: "Invalid ID" }
  const meal = mealsList(data).meals[0];
  if (!meal) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  cacheFor(res, 1800);
  res.json({ meal });
}));

// GET /api/categories  ->  categories.php (in-memory cache for a day)
mealdbRouter.get('/categories', handle(async (_req, res) => {
  const data = await mealdb('categories.php', DAY);
  const categories = (data as { categories?: unknown })?.categories;
  cacheFor(res, 3600);
  res.json({ categories: Array.isArray(categories) ? categories : [] });
}));

// GET /api/filter?c=Seafood  ->  filter.php?c=Seafood
mealdbRouter.get('/filter', handle(async (req, res) => {
  const category = queryString(req, 'c', 50, /^[\p{L}\p{N} &'-]+$/u);
  if (!category) throw new BadRequest('"c" (category) is required');
  const data = await mealdb(`filter.php?c=${encodeURIComponent(category)}`, HOUR);
  cacheFor(res, 3600);
  res.json(mealsList(data));
}));

// GET /api/random  ->  random.php (never cached: it should differ each time)
mealdbRouter.get('/random', handle(async (_req, res) => {
  const data = await mealdb('random.php');
  const meal = mealsList(data).meals[0];
  res.set('Cache-Control', 'no-store');
  if (!meal) {
    res.status(502).json({ error: 'TheMealDB returned no recipe' });
    return;
  }
  res.json({ meal });
}));

// GET /api/images/media/meals/abc.jpg/preview  ->  https://www.themealdb.com/images/media/meals/abc.jpg/preview
// Only TheMealDB's own image folders are allowed, so this can't be used to
// fetch arbitrary URLs. Express has already decoded the path, and ingredient
// files are named after the ingredient ("Double Cream-small.png",
// "Jalapeño-small.png"), so names may contain spaces, accents and the like.
const IMAGE_PATH = /^(media\/meals|category|ingredients)\/[\p{L}\p{N} _.,'()&-]+(\/(preview|small|medium|large))?$/iu;

mealdbRouter.get(/^\/images\/(.+)$/, handle(async (req, res) => {
  const path = (req.params as unknown as string[])[0];
  if (!IMAGE_PATH.test(path) || path.includes('..')) throw new BadRequest('Not a TheMealDB image path');
  // Re-encode each segment for the upstream URL (spaces -> %20 etc.)
  const upstreamPath = path.split('/').map(encodeURIComponent).join('/');

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${IMAGE_ORIGIN}/images/${upstreamPath}`, { signal: AbortSignal.timeout(10000) });
  } catch {
    throw new UpstreamError('Could not load the image', 504);
  }
  const type = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !type.startsWith('image/')) {
    res.status(upstream.status === 404 ? 404 : 502).json({ error: 'Image not available' });
    return;
  }
  res.set('Content-Type', type);
  // Recipe photos never change at the same URL, so they can be cached for a week
  res.set('Cache-Control', 'public, max-age=604800, immutable');
  res.send(Buffer.from(await upstream.arrayBuffer()));
}));

// Unknown /api paths
mealdbRouter.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Errors from any route above: bad input is 400, upstream trouble 502/504,
// anything else 500. The message never includes the upstream URL or key.
mealdbRouter.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof BadRequest) {
    res.status(400).json({ error: error.message });
  } else if (error instanceof UpstreamError) {
    res.status(error.status).json({ error: error.message });
  } else {
    console.error('Unexpected API error:', error);
    res.status(500).json({ error: 'Something went wrong' });
  }
});
