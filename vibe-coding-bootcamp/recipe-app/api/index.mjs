/**
 * Vercel entry point: the whole Express API (server/src/app.ts) as one
 * serverless function. vercel.json rewrites every /api/* request here, and
 * Express routes it by the original path.
 *
 * The search index is built during the deploy (server/src/buildIndex.ts) and
 * shipped with this function. A function's own files are read-only, so it's
 * copied to /tmp on a cold start; see ./_env.mjs.
 */
import './_env.mjs';
import { app } from '../server/dist/app.js';

export default app;
