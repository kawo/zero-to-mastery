import { useCallback } from 'react';
import { ListEnd, ListPlus, ListStart } from 'lucide-react';
import type { MenuItem } from '@/components/ui/Menu';
import { usePlayer } from '@/hooks/usePlayer';
import { pluralize } from '@/lib/utils';
import { useToast, useUi } from '@/state/contexts';

/** Queue/playlist actions shared by song rows, selection bars and Now Playing. */
export function useTrackActions() {
  const player = usePlayer();
  const toast = useToast();
  const ui = useUi();
  const { playNext: pn, enqueue: eq } = player;

  const playNext = useCallback(
    (ids: string[]) => {
      pn(ids);
      toast({
        tone: 'success',
        message: `${ids.length === 1 ? 'Song' : pluralize(ids.length, 'song')} will play next.`,
      });
    },
    [pn, toast],
  );

  const enqueue = useCallback(
    (ids: string[]) => {
      eq(ids);
      toast({
        tone: 'success',
        message: `Added ${ids.length === 1 ? 'to' : `${pluralize(ids.length, 'song')} to`} queue.`,
        action: { label: 'View', onClick: () => ui.setQueueOpen(true) },
      });
    },
    [eq, toast, ui],
  );

  /** Standard menu items for one or more tracks. */
  const menuItems = useCallback(
    (ids: string[]): MenuItem[] => [
      { label: 'Play next', icon: <ListStart />, onSelect: () => playNext(ids) },
      { label: 'Add to queue', icon: <ListEnd />, onSelect: () => enqueue(ids) },
      { label: 'Add to playlist…', icon: <ListPlus />, onSelect: () => ui.addToPlaylist(ids) },
    ],
    [enqueue, playNext, ui],
  );

  return { playNext, enqueue, addToPlaylist: ui.addToPlaylist, menuItems };
}
