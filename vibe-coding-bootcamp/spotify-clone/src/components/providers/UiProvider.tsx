import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AddToPlaylistDialog } from '@/components/AddToPlaylistDialog';
import { UiContext } from '@/state/contexts';

const QUEUE_KEY = 'tunebox-queue-open';

function readQueueOpen(): boolean {
  try {
    return localStorage.getItem(QUEUE_KEY) === '1';
  } catch {
    return false;
  }
}

/** App-wide UI state: queue panel visibility and the shared "Add to playlist" dialog. */
export function UiProvider({ children }: { children: ReactNode }) {
  const [queueOpen, setQueueOpenState] = useState(readQueueOpen);
  const [pickerIds, setPickerIds] = useState<string[] | null>(null);

  const setQueueOpen = useCallback((open: boolean) => {
    setQueueOpenState(open);
    try {
      localStorage.setItem(QUEUE_KEY, open ? '1' : '0');
    } catch {
      /* per-viewer convenience only */
    }
  }, []);

  const value = useMemo(
    () => ({
      queueOpen,
      setQueueOpen,
      toggleQueue: () => setQueueOpen(!queueOpen),
      addToPlaylist: (ids: string[]) => setPickerIds(ids),
    }),
    [queueOpen, setQueueOpen],
  );

  return (
    <UiContext.Provider value={value}>
      {children}
      <AddToPlaylistDialog trackIds={pickerIds} onClose={() => setPickerIds(null)} />
    </UiContext.Provider>
  );
}
