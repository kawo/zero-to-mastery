import type { ReactNode } from 'react';
import { useLiveLibrary } from '@/hooks/useIndexedDb';
import { LibraryContext } from '@/state/contexts';

/** One live query for all track metadata, shared by every page and the player. */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const library = useLiveLibrary();
  return <LibraryContext.Provider value={library}>{children}</LibraryContext.Provider>;
}
