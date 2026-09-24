/**
 * Demo data is available in `npm run dev`, or in any build made with
 * VITE_ENABLE_DEMO=true. The env checks are written inline so Vite replaces
 * them with literals and the seed chunk is dropped from normal production builds.
 */
export const loadDemoSeed =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true'
    ? () => import('./seed')
    : null;
