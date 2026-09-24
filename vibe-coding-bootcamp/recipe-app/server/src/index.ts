/**
 * Runs the API as a normal long-lived server (local dev, Render). It keeps
 * the search index fresh in the background; on Vercel, api/index.mjs uses
 * the app from app.ts with an index built at deploy time instead.
 */
import { app } from './app.js';
import { startIndexing } from './lib/searchIndex.js';

const PORT = Number(process.env.PORT) || 3001;

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
