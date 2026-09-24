/**
 * Builds the search index once and exits: `npm run build:index`.
 *
 * Used at deploy time on hosts without a lasting writable disk (Vercel): the
 * resulting file (SEARCH_DB_PATH, data/recipes.db by default) ships with the
 * function, so no request has to wait for an index to be built. Exits with
 * an error if TheMealDB couldn't be fetched completely, which fails the
 * deploy rather than shipping an empty or partial index.
 */
import './env.js';
import { buildIndex, closeIndexAsSingleFile } from './lib/searchIndex.js';

const started = Date.now();
try {
  const count = await buildIndex();
  closeIndexAsSingleFile();
  console.log(`Search index built: ${count} recipes in ${((Date.now() - started) / 1000).toFixed(1)}s`);
} catch (error) {
  console.error('Search index build failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
