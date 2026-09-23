import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const API_TARGET = process.env.API_URL || 'http://localhost:3001';

/** Every file under public/, as URL paths ("/icons/icon-192.png"). */
function publicFiles(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return publicFiles(full, root);
    return ['/' + relative(root, full).split('\\').join('/')];
  });
}

/**
 * Builds the service worker from src/sw.js (hand-written, no Workbox).
 *
 * At build time the hashed file names of the app shell aren't known in
 * advance, so this plugin fills them in: it replaces the placeholders
 * self.__PRECACHE_MANIFEST__ and self.__SW_VERSION__ in src/sw.js with the
 * list of built files and a hash of that list, then writes dist/sw.js.
 * A new build with any changed file gets a new version, which makes the
 * installed worker update and drop the old precache.
 */
function serviceWorker(): Plugin {
  const swSource = resolve(import.meta.dirname, 'src/sw.js');
  const publicDir = resolve(import.meta.dirname, 'public');
  return {
    name: 'recipes-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      // Source maps are for debugging, not worth downloading to every device.
      // index.html is listed explicitly: Vite may add it to the bundle after
      // this hook runs.
      const built = Object.keys(bundle).filter(file => !file.endsWith('.map')).map(file => '/' + file);
      const fromPublic = publicFiles(publicDir).filter(file => !file.endsWith('.DS_Store'));
      const precache = [...new Set(['/', '/index.html', ...built, ...fromPublic])].sort();

      const version = createHash('sha256')
        .update(precache.join('\n'))
        .update(readFileSync(swSource))
        .digest('hex')
        .slice(0, 12);

      const source = readFileSync(swSource, 'utf8')
        .replace('self.__PRECACHE_MANIFEST__', JSON.stringify(precache))
        .replace('self.__SW_VERSION__', JSON.stringify(version));

      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') }
  },
  // The client only ever calls /api/*; in dev and preview Vite forwards
  // those requests to the Express server, so they stay same-origin.
  server: {
    port: 5173,
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } }
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: API_TARGET, changeOrigin: true } }
  },
  build: {
    sourcemap: true
  }
});
