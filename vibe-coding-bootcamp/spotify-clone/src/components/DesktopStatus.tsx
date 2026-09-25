import { useEffect, useRef } from 'react';
import { desktop, type UpdateStatus } from '@/lib/desktop';
import { useToast } from '@/state/contexts';
import { t } from '@/i18n/core';

/**
 * Desktop app updates → toasts. Takes the place of the service-worker status in the
 * web app (the desktop app has no service worker: its files are already local).
 */
export function DesktopStatus() {
  const toast = useToast();
  const shown = useRef(new Set<string>());

  useEffect(() => {
    const api = desktop();
    if (!api) return;
    const onStatus = (s: UpdateStatus) => {
      // One toast per version and kind, however often the app re-checks.
      const key = 'version' in s ? `${s.state}:${s.version}` : '';
      if (!key || shown.current.has(key)) return;
      if (s.state === 'ready') {
        shown.current.add(key);
        toast({
          message: t('desktop.ready', { version: s.version }),
          action: { label: t('common.restart'), onClick: () => void api.installUpdate() },
          duration: 0,
        });
      } else if (s.state === 'manual') {
        shown.current.add(key);
        toast({
          message: t('desktop.available', { version: s.version }),
          action: { label: t('common.download'), onClick: () => window.open(s.url, '_blank') },
          duration: 0,
        });
      }
    };
    const off = api.onUpdate(onStatus);
    void api.updateStatus().then(onStatus);
    return off;
  }, [toast]);

  return null;
}
