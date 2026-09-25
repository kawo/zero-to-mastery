import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { loadDemoSeed } from '@/dev/flags';

import { useToast } from '@/state/contexts';
import { useI18n } from '@/i18n';

/** "Load demo songs" (dev flag only). The seed module is lazy-loaded and dropped from production builds. */
export function DemoSeedButton() {
  const toast = useToast();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  if (!loadDemoSeed) return null;
  const load = loadDemoSeed;
  return (
    <button
      type="button"
      className="btn-secondary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { seedDemoLibrary } = await load();
          const n = await seedDemoLibrary();
          toast({
            tone: 'success',
            message: n ? t('demo.added', { count: n }) : t('demo.already'),
          });
        } catch (err) {
          toast({
            tone: 'error',
            message: err instanceof Error ? err.message : t('demo.failed'),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <FlaskConical className="h-4 w-4" aria-hidden />
      {busy ? t('common.loading') : t('demo.load')}
    </button>
  );
}
