// Bundles the Electron main process and preload script into dist-electron/.
// Both are CommonJS: sandboxed preload scripts can't be ES modules, and bundling
// electron-updater in means the packaged app ships without node_modules.
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
};

await Promise.all([
  build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' }),
  build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' }),
]);
