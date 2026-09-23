import { toast } from 'sonner';

/**
 * Registers the service worker in production builds only: in `vite dev`
 * there's no built sw.js, and a caching worker would fight hot reloading.
 * To try offline behaviour locally, use `npm run build && npm run preview`.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const hadController = Boolean(navigator.serviceWorker.controller);
      const registration = await navigator.serviceWorker.register('/sw.js');

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state !== 'activated') return;
          if (hadController) {
            // A new version took over; this page still runs the old code
            toast('A new version is available', {
              id: 'sw-update',
              duration: Infinity,
              action: { label: 'Reload', onClick: () => window.location.reload() }
            });
          } else {
            toast.success('Ready to work offline', { id: 'sw-ready' });
          }
        });
      });
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  });
}
