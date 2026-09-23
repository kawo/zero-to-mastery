/**
 * Recipes API server: a thin proxy in front of TheMealDB.
 *
 * The browser only ever calls /api/*. This server adds the API key
 * (MEALDB_API_KEY) and base URL (MEALDB_API_BASE) from the environment, so
 * neither reaches the client bundle or the network tab.
 */
import './env.js';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import { mealdbRouter } from './routes/mealdb.js';
import { searchRouter } from './routes/search.js';
import { startIndexing } from './lib/searchIndex.js';

const PORT = Number(process.env.PORT) || 3001;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const app = express();

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

// Fetch TheMealDB's catalogue into the local search index (in the background)
startIndexing();

// Express 5 passes startup errors (e.g. port already in use) to this
// callback instead of throwing, so they have to be checked here
app.listen(PORT, error => {
  if (error) {
    console.error(`Could not start the API on port ${PORT}: ${error.message}`);
    process.exit(1);
  }
  console.log(`Recipes API listening on http://localhost:${PORT}`);
});
