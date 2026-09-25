/**
 * Write operations on the library. Reads go through the live-query hooks in
 * src/hooks/useIndexedDb.ts so the UI updates automatically after these run.
 */
import { db } from '@/db/indexedDb';
import { evictBlobUrl } from '@/lib/audio';
import { uid } from '@/lib/utils';
import type { Playlist, Track } from '@/types';

/* ------------------------------ Tracks ------------------------------ */

/** Deletes tracks, their audio, now-unused artwork, and removes them from playlists. */
export async function deleteTracks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  const evicted: string[] = [];
  await db.transaction(
    'rw',
    [db.tracks, db.blobs, db.playlists, db.resumePoints, db.lyrics, db.waveforms],
    async () => {
      const tracks = (await db.tracks.bulkGet(ids)).filter((t): t is Track => !!t);
      const artworkIds = new Set(
        tracks.map((t) => t.artworkBlobId).filter((x): x is string => !!x),
      );

      await db.tracks.bulkDelete(ids);
      await db.resumePoints.bulkDelete(ids);
      await db.lyrics.bulkDelete(ids);
      await db.waveforms.bulkDelete(ids);
      await db.blobs.bulkDelete(tracks.map((t) => t.audioBlobId));
      evicted.push(...tracks.map((t) => t.audioBlobId));

      // Artwork is shared across an album: only delete it when nothing references it anymore.
      for (const artId of artworkIds) {
        const stillUsed = await db.tracks.where('artworkBlobId').equals(artId).count();
        if (!stillUsed) {
          await db.blobs.delete(artId);
          evicted.push(artId);
        }
      }

      const now = Date.now();
      await db.playlists.toCollection().modify((p) => {
        const next = p.trackIds.filter((id) => !idSet.has(id));
        if (next.length !== p.trackIds.length) {
          p.trackIds = next;
          p.updatedAt = now;
        }
      });
    },
  );
  evicted.forEach(evictBlobUrl);
}

export async function recordPlay(trackId: string): Promise<void> {
  await db.tracks
    .where('id')
    .equals(trackId)
    .modify((t) => {
      t.playCount = (t.playCount ?? 0) + 1;
      t.lastPlayedAt = Date.now();
    });
}

export async function updateTrack(
  id: string,
  patch: Partial<Pick<Track, 'title' | 'artist' | 'album' | 'genre' | 'year'>>,
): Promise<void> {
  await db.tracks.update(id, { ...patch, updatedAt: Date.now() });
}

/* --------------------------- Resume points -------------------------- */

/** Tracks at least this long (seconds) remember where playback stopped. */
export const RESUME_MIN_DURATION = 10 * 60;
/** Positions this close to the start or end (seconds) count as "not started" or "finished". */
const RESUME_MARGIN_START = 10;
const RESUME_MARGIN_END = 15;

export async function getResumePosition(trackId: string): Promise<number | null> {
  return (await db.resumePoints.get(trackId))?.position ?? null;
}

/** Saves where playback is in a long track, or forgets it near the start or end. */
export async function saveResumePosition(
  trackId: string,
  position: number,
  duration: number,
): Promise<void> {
  if (position < RESUME_MARGIN_START || position > duration - RESUME_MARGIN_END) {
    await db.resumePoints.delete(trackId);
  } else {
    await db.resumePoints.put({ trackId, position, updatedAt: Date.now() });
  }
}

/* ----------------------------- Playlists ---------------------------- */

export async function createPlaylist(name: string, trackIds: string[] = []): Promise<Playlist> {
  const now = Date.now();
  const playlist: Playlist = {
    id: uid(),
    name: name.trim() || 'Untitled playlist',
    trackIds: [...new Set(trackIds)],
    createdAt: now,
    updatedAt: now,
  };
  await db.playlists.add(playlist);
  return playlist;
}

export async function renamePlaylist(id: string, name: string): Promise<void> {
  await db.playlists.update(id, {
    name: name.trim() || 'Untitled playlist',
    updatedAt: Date.now(),
  });
}

export async function deletePlaylist(id: string): Promise<void> {
  await db.playlists.delete(id);
}

/**
 * Appends tracks, skipping ones already in the playlist.
 * Returns how many were actually added.
 */
export async function addToPlaylist(id: string, trackIds: string[]): Promise<number> {
  let added = 0;
  await db.transaction('rw', db.playlists, async () => {
    const p = await db.playlists.get(id);
    if (!p) throw new Error('That playlist no longer exists.');
    const existing = new Set(p.trackIds);
    const fresh = [...new Set(trackIds)].filter((t) => !existing.has(t));
    added = fresh.length;
    if (added)
      await db.playlists.update(id, { trackIds: [...p.trackIds, ...fresh], updatedAt: Date.now() });
  });
  return added;
}

export async function removeFromPlaylist(id: string, trackIds: string[]): Promise<void> {
  const drop = new Set(trackIds);
  await db.transaction('rw', db.playlists, async () => {
    const p = await db.playlists.get(id);
    if (!p) return;
    await db.playlists.update(id, {
      trackIds: p.trackIds.filter((t) => !drop.has(t)),
      updatedAt: Date.now(),
    });
  });
}

export async function setPlaylistOrder(id: string, trackIds: string[]): Promise<void> {
  await db.playlists.update(id, { trackIds, updatedAt: Date.now() });
}

/* ------------------------------ Storage ----------------------------- */

export interface StorageInfo {
  usage: number;
  quota: number;
  persisted: boolean;
}

export async function getStorageInfo(): Promise<StorageInfo | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  const persisted = (await navigator.storage.persisted?.()) ?? false;
  return { usage, quota, persisted };
}

/** Asks the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
