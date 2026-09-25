import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_EQ } from '@/lib/eq';
import type { AppRow, AppSettings, BlobDoc, Playlist, ResumePoint, Track } from '@/types';

/** Also read directly (without Dexie) by the service worker to serve artwork. */
export const DB_NAME = 'tunebox';

export type TuneboxDb = Dexie & {
  tracks: EntityTable<Track, 'id'>;
  blobs: EntityTable<BlobDoc, 'id'>;
  playlists: EntityTable<Playlist, 'id'>;
  app: EntityTable<AppRow, 'key'>;
  resumePoints: EntityTable<ResumePoint, 'trackId'>;
};

export const db = new Dexie(DB_NAME) as TuneboxDb;

/*
 * Schema history. Never edit a released version: add a new one below it.
 * Only indexed fields are listed; other properties are stored as-is.
 */
db.version(1).stores({
  tracks: 'id, title, artist, album, createdAt, hash, artworkBlobId, [fileName+duration]',
  blobs: 'id, type',
  playlists: 'id, name, updatedAt',
  app: 'key',
});

// v2 added play statistics. Libraries created on v1 get defaults filled in.
db.version(2)
  .stores({
    tracks:
      'id, title, artist, album, createdAt, hash, artworkBlobId, [fileName+duration], playCount',
  })
  .upgrade(async (tx) => {
    await tx
      .table<Track, string>('tracks')
      .toCollection()
      .modify((t) => {
        t.playCount ??= 0;
      });
  });

// v3 added per-track resume points for long tracks. Kept out of `tracks` so saving
// the position every few seconds doesn't refresh every live query of the library.
db.version(3).stores({
  resumePoints: 'trackId',
});

// Another tab upgraded the schema: close so it isn't blocked, then reload into the new code.
db.on('versionchange', () => {
  db.close();
  window.location.reload();
  return false;
});

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  repeat: 'off',
  shuffle: false,
  volume: 0.9,
  muted: false,
  lastQueue: [],
  lastIndex: -1,
  lastPosition: 0,
  crossfade: 0,
  playbackRate: 1,
  normalize: false,
  eq: DEFAULT_EQ,
};

export async function getSettings(): Promise<AppSettings> {
  const row = await db.app.get('settings');
  return { ...DEFAULT_SETTINGS, ...row?.value };
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<void> {
  await db.transaction('rw', db.app, async () => {
    const current = await getSettings();
    await db.app.put({ key: 'settings', value: { ...current, ...patch } });
  });
}

/** Turns IndexedDB/Dexie failures into messages a user can act on. */
export function describeDbError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const inner = (err as { inner?: { name?: string } } | null)?.inner?.name ?? '';
  if (name === 'QuotaExceededError' || inner === 'QuotaExceededError') {
    return 'Your browser is out of storage space for this site. Delete some songs, or free up disk space, then try again.';
  }
  if (name === 'MissingAPIError' || name === 'InvalidStateError') {
    return 'This browser does not allow local storage here (private browsing can block it). Open Tunebox in a normal window.';
  }
  if (name === 'VersionError') {
    return 'Tunebox was updated in another tab. Reload this page.';
  }
  if (name === 'DatabaseClosedError' || name === 'OpenFailedError') {
    return 'The music library could not be opened. Reload the page; if it keeps happening, check that site data is allowed.';
  }
  return err instanceof Error ? err.message : 'Something went wrong while accessing your library.';
}
