import { useCallback, useSyncExternalStore } from 'react';

/** Live `navigator.onLine`. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/*
 * The install event can fire before any component mounts, so it is captured
 * at module load (this file is imported by main.tsx) and exposed as a store.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<() => void>();
const emitInstall = () => installListeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    emitInstall();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emitInstall();
  });
}

/** Chrome/Edge/Android install prompt. Safari has no event: users use Share → Add to Home Screen. */
export function useInstallPrompt() {
  const canInstall = useSyncExternalStore(
    (cb) => {
      installListeners.add(cb);
      return () => installListeners.delete(cb);
    },
    () => !!deferredPrompt,
    () => false,
  );
  const install = useCallback(async () => {
    const prompt = deferredPrompt;
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    deferredPrompt = null;
    emitInstall();
    return outcome === 'accepted';
  }, []);
  return { canInstall, install };
}
