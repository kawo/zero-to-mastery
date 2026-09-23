import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useOnlineStatus } from '@/lib/useOnlineStatus';

/** Toasts when the connection drops or returns; refreshes data on reconnect. */
export function OfflineNotifier() {
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const first = useRef(true);

  useEffect(() => {
    // On first render only speak up if the app opened offline
    if (first.current) {
      first.current = false;
      if (online) return;
    }
    if (online) {
      toast.success("You're back online", { id: 'connection', description: 'Recipes will refresh as you browse.' });
      void queryClient.invalidateQueries({ predicate: query => query.state.status === 'error' });
    } else {
      toast.warning("You're offline", {
        id: 'connection',
        description: 'Favorites and recipes you have opened still work.',
        duration: 6000
      });
    }
  }, [online, queryClient]);

  return null;
}
