import { useCallback } from 'react';
import { ListEnd, ListPlus, ListStart } from 'lucide-react';
import type { MenuItem } from '@/components/ui/Menu';
import { usePlayer } from '@/hooks/usePlayer';

import { useToast, useUi } from '@/state/contexts';
import { useI18n } from '@/i18n';

/** Queue/playlist actions shared by song rows, selection bars and Now Playing. */
export function useTrackActions() {
  const player = usePlayer();
  const toast = useToast();
  const ui = useUi();
  const { t } = useI18n();
  const { playNext: pn, enqueue: eq } = player;

  const playNext = useCallback(
    (ids: string[]) => {
      pn(ids);
      toast({
        tone: 'success',
        message: t('trackActions.willPlayNext', { count: ids.length }),
      });
    },
    [pn, t, toast],
  );

  const enqueue = useCallback(
    (ids: string[]) => {
      eq(ids);
      toast({
        tone: 'success',
        message: t('trackActions.addedToQueue', { count: ids.length }),
        action: { label: t('common.view'), onClick: () => ui.setQueueOpen(true) },
      });
    },
    [eq, t, toast, ui],
  );

  /** Standard menu items for one or more tracks. */
  const menuItems = useCallback(
    (ids: string[]): MenuItem[] => [
      { label: t('trackActions.playNext'), icon: <ListStart />, onSelect: () => playNext(ids) },
      { label: t('trackActions.addToQueue'), icon: <ListEnd />, onSelect: () => enqueue(ids) },
      {
        label: t('trackActions.addToPlaylist'),
        icon: <ListPlus />,
        onSelect: () => ui.addToPlaylist(ids),
      },
    ],
    [enqueue, playNext, t, ui],
  );

  return { playNext, enqueue, addToPlaylist: ui.addToPlaylist, menuItems };
}
