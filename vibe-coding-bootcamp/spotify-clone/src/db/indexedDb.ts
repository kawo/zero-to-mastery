import Dexie, { type EntityTable } from 'dexie';
import { DEFAULT_EQ } from '@/lib/eq';
import type {
  AppRow,
  AppSettings,
  BlobDoc,
  LyricsDoc,
  Playlist,
  ResumePoint,
  Track,
  WaveformDoc,
} from '@/types';
import { t } from '@/i18n/core';

/** Also read directly (without Dexie) by the service worker to serve artwork. */
export const DB_NAME = 'tunebox';

export type TuneboxDb = Dexie & {
  tracks: EntityTable<Track, 'id'>;
  blobs: EntityTable<BlobDoc, 'id'>;
  playlists: EntityTable<Playlist, 'id'>;
  app: EntityTable<AppRow, 'key'>;
  resumePoints: EntityTable<ResumePoint, 'trackId'>;
  lyrics: EntityTable<LyricsDoc, 'trackId'>;
  waveforms: EntityTable<WaveformDoc, 'trackId'>;
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

// v4 added lyrics (embedded, .lrc files, LRCLIB or pasted), one row per track.
db.version(4).stores({
  lyrics: 'trackId',
});

// v5 added seek-bar waveform previews (recomputable, so not in backups).
db.version(5).stores({
  waveforms: 'trackId',
});

// Another tab upgraded the schema: close so it isn't blocked, then reload into the new code.
db.on('versionchange', () => {
  db.close();
  window.location.reload();
  return false;
});

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  contrast: 'system',
  language: 'auto',
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
  lyricsOnline: true,
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
    return t('errors.quota');
  }
  if (name === 'MissingAPIError' || name === 'InvalidStateError') {
    return t('errors.storageBlocked');
  }
  if (name === 'VersionError') {
    return t('errors.upgraded');
  }
  if (name === 'DatabaseClosedError' || name === 'OpenFailedError') {
    return t('errors.cantOpen');
  }
  return err instanceof Error ? err.message : t('errors.generic');
}
