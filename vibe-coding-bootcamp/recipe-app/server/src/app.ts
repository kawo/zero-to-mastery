/**
 * Recipes API: a thin proxy in front of TheMealDB, plus full-text search.
 *
 * The browser only ever calls /api/*. This server adds the API key
 * (MEALDB_API_KEY) and base URL (MEALDB_API_BASE) from the environment, so
 * neither reaches the client bundle or the network tab.
 *
 * This module builds the Express app without starting it: index.ts listens
 * on a port for a normal server, and api/index.mjs hands it to Vercel as a
 * serverless function.
 */
import './env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { mealdbRouter } from './routes/mealdb.js';
import { searchRouter } from './routes/search.js';

const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

export const app = express();

// Behind Render/Netlify/Vercel proxies, trust the first hop for req.ip etc.
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  // Images are fetched by the client's origin (through a same-origin proxy
  // in dev and production), but allow cross-origin use for direct setups
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({
  origin: CORS_ORIGINS.length ? CORS_ORIGINS : false,
  methods: ['GET']
}));
app.use(compression());

app.get('/health', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ ok: true });
});

// Search first: mealdbRouter ends with a catch-all 404 for unknown /api paths
app.use('/api', searchRouter);
app.use('/api', mealdbRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Last resort for errors no router handled
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  if (!res.headersSent) res.status(500).json({ error: 'Something went wrong' });
});
