// web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * The browser only ever talks to this dev server. Anything under /api is
 * forwarded to the Express proxy, which is where the API token lives — so no
 * bundle, sourcemap or network panel in the browser can reveal it.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5177',
        changeOrigin: true,
      },
    },
  },
});
