import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { loadDemoSeed } from '@/dev/flags';
import { pluralize } from '@/lib/utils';
import { useToast } from '@/state/contexts';

/** "Load demo songs" (dev flag only). The seed module is lazy-loaded and dropped from production builds. */
export function DemoSeedButton() {
  const toast = useToast();
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
            message: n
              ? `Added ${pluralize(n, 'demo song')}.`
              : 'Demo songs are already in your library.',
          });
        } catch (err) {
          toast({
            tone: 'error',
            message: err instanceof Error ? err.message : 'Could not load demo songs.',
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <FlaskConical className="h-4 w-4" aria-hidden />
      {busy ? 'Loading…' : 'Load demo songs'}
    </button>
  );
}
