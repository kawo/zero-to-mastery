/**
 * Environment for the API on Vercel, set before the server modules load
 * (ES modules run in import order). Files starting with "_" aren't turned
 * into functions of their own.
 */
import { fileURLToPath } from 'node:url';

// The index built at deploy time, included with the function (vercel.json)
process.env.SEARCH_DB_SEED ??= fileURLToPath(new URL('../server/data/recipes.db', import.meta.url));
// The only writable place in a function
process.env.SEARCH_DB_PATH ??= '/tmp/recipes.db';
