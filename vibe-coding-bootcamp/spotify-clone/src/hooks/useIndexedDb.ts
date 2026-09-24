/**
 * Reactive reads from IndexedDB. Built on Dexie live queries: any write made
 * anywhere (this tab or another) re-runs the query and re-renders the UI.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, DEFAULT_SETTINGS, describeDbError } from '@/db/indexedDb';
import { acquireBlobUrl, releaseBlobUrl } from '@/lib/audio';
import { LibraryContext, required, type LibraryValue } from '@/state/contexts';
import type { AppSettings, Playlist, Track } from '@/types';

/** All track metadata (no blobs). Used once by LibraryProvider; components use `useLibrary()`. */
export function useLiveLibrary(): LibraryValue {
  const [error, setError] = useState<string | null>(null);
  const tracks = useLiveQuery(async () => {
    try {
      const all = await db.tracks.toArray();
      setError(null);
      return all;
    } catch (err) {
      setError(describeDbError(err));
      return [] as Track[];
    }
  });
  const byId = useMemo(() => new Map((tracks ?? []).map((t) => [t.id, t])), [tracks]);
  return { tracks, byId, error };
}

/** Shared library snapshot from LibraryProvider. */
export const useLibrary = () => required(LibraryContext, 'useLibrary');

/** Resolves IDs to tracks, preserving order and skipping deleted ones. */
export function useTracksByIds(ids: readonly string[] | undefined): Track[] {
  const { byId } = useLibrary();
  return useMemo(
    () => (ids ?? []).map((id) => byId.get(id)).filter((t): t is Track => !!t),
    [ids, byId],
  );
}

/** Playlists, most recently updated first. */
export function usePlaylists(): Playlist[] | undefined {
  return useLiveQuery(() => db.playlists.orderBy('updatedAt').reverse().toArray());
}

/** `undefined` while loading, `null` if it doesn't exist. */
export function usePlaylist(id: string | undefined): Playlist | null | undefined {
  return useLiveQuery(async () => (id ? ((await db.playlists.get(id)) ?? null) : null), [id]);
}

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(async () => ({
    ...DEFAULT_SETTINGS,
    ...(await db.app.get('settings'))?.value,
  }));
}

/**
 * Object URL for a stored blob (artwork, audio). Shared and ref-counted across
 * components; revoked automatically once nothing uses it.
 * Returns `undefined` while loading and `null` when there is no such blob.
 */
export function useBlobUrl(blobId: string | undefined): string | null | undefined {
  const [state, setState] = useState<{ id?: string; url: string | null }>({ url: null });
  useEffect(() => {
    if (!blobId) return;
    let cancelled = false;
    let acquired = false;
    acquireBlobUrl(blobId)
      .then((url) => {
        acquired = true;
        if (cancelled) releaseBlobUrl(blobId);
        else setState({ id: blobId, url });
      })
      .catch(() => {
        if (!cancelled) setState({ id: blobId, url: null });
      });
    return () => {
      cancelled = true;
      if (acquired) releaseBlobUrl(blobId);
    };
  }, [blobId]);
  if (!blobId) return null;
  // Never hand back the previous blob's URL while the new one loads.
  return state.id === blobId ? state.url : undefined;
}
