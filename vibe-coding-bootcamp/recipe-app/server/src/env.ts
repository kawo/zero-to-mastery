/**
 * Loads .env before anything else reads process.env. Imported first in
 * index.ts: ES module imports run in order, so this has to be its own module
 * rather than a dotenv.config() call in index.ts's body.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });
