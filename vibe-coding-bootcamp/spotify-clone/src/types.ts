/**
 * Domain models shared by the database, hooks and UI.
 * Everything lives in the browser (IndexedDB); there is no server.
 */

import type { EqSettings } from '@/lib/eq';

/** Epoch milliseconds. */
export type Timestamp = number;

/** Measured loudness (ITU-R BS.1770), used for volume normalization. */
export interface Loudness {
  /** Integrated loudness in LUFS. */
  lufs: number;
  /** Sample peak in dBFS. */
  peakDb: number;
}

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  /** Seconds (may be fractional). 0 when it could not be determined. */
  duration: number;
  year?: number;
  genre?: string;
  trackNo?: number;
  /** Key into the `blobs` store for the audio file. */
  audioBlobId: string;
  /** Key into the `blobs` store. Artwork is shared between tracks of the same album. */
  artworkBlobId?: string;
  /** Content hash of the audio file (`sha256:<hex>` or `fnv:<hex>`); used for dedupe and relinking. */
  hash: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /**
   * Set when metadata was restored from a backup without its audio.
   * Importing the same file again (same hash) relinks it.
   */
  audioMissing?: boolean;
  playCount: number;
  lastPlayedAt?: Timestamp;
  /** Measured on first play with normalization on; null if it couldn't be measured. */
  loudness?: Loudness | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Where playback stopped in a long track, so it can resume there next time. */
export interface ResumePoint {
  trackId: string;
  /** Seconds into the track. */
  position: number;
  updatedAt: Timestamp;
}

export type LyricsSource = 'embedded' | 'file' | 'lrclib' | 'manual';

/** Lyrics for one track, in the `lyrics` store (key: trackId). */
export interface LyricsDoc {
  trackId: string;
  /** Time-synced lyrics in LRC format. */
  lrc?: string;
  /** Plain (unsynced) lyrics. */
  plain?: string;
  /** The track is instrumental (as reported by LRCLIB). */
  instrumental?: boolean;
  /** An online lookup found nothing; retried after a while or on request. */
  notFound?: boolean;
  source?: LyricsSource;
  /** User timing correction in ms; positive shows lines sooner. */
  offsetMs?: number;
  updatedAt: Timestamp;
}

export type BlobKind = 'audio' | 'artwork';

export interface BlobDoc {
  id: string;
  type: BlobKind;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: Timestamp;
}

export interface Playlist {
  id: string;
  name: string;
  /** Ordered, unique track IDs. */
  trackIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type RepeatMode = 'off' | 'all' | 'one';
export type ThemePreference = 'light' | 'dark' | 'system';

/** One slot in the play queue. `uid` keeps duplicates of the same track distinct. */
export interface QueueItem {
  uid: string;
  trackId: string;
}

export interface QueueState {
  items: QueueItem[];
  /** Index of the current item in `items`; -1 when the queue is empty. */
  index: number;
  /** Queue order before shuffle was switched on, so it can be restored. */
  unshuffled?: string[];
}

/** Single row in the `app` store (key: 'settings'). */
export interface AppSettings {
  theme: ThemePreference;
  repeat: RepeatMode;
  shuffle: boolean;
  volume: number;
  muted: boolean;
  /** Track IDs of the queue at the time of the last save. */
  lastQueue: string[];
  lastIndex: number;
  lastTrackId?: string;
  /** Seconds into `lastTrackId`. */
  lastPosition: number;
  /** Seconds the end of one track overlaps the start of the next. 0 = gapless, no fade. */
  crossfade: number;
  /** 0.5–2; pitch is preserved. */
  playbackRate: number;
  /** Play every track at the same loudness. */
  normalize: boolean;
  /** Look up missing lyrics on lrclib.net when the lyrics view opens. */
  lyricsOnline: boolean;
  eq: EqSettings;
}

export interface AppRow {
  key: 'settings';
  value: AppSettings;
}

export type SortKey = 'title' | 'artist' | 'album' | 'duration' | 'createdAt' | 'playCount';
export type SortDir = 'asc' | 'desc';

/** Per-file state shown on the Upload page while importing. */
export type ImportStatus =
  'queued' | 'hashing' | 'parsing' | 'saving' | 'done' | 'relinked' | 'duplicate' | 'error';

export interface ImportItem {
  key: string;
  fileName: string;
  size: number;
  status: ImportStatus;
  message?: string;
  trackId?: string;
}

/** Shape of an exported backup (`backup.json`, alone or inside a zip). */
export interface BackupFile {
  format: 'tunebox-backup';
  version: 1;
  exportedAt: string;
  includesAudio: boolean;
  tracks: Track[];
  playlists: Playlist[];
  settings?: Pick<AppSettings, 'theme' | 'repeat' | 'shuffle' | 'volume'>;
  /** Lyrics by backup track id (optional; older backups have none). */
  lyrics?: LyricsDoc[];
  /** blobId → path inside the zip (only when `includesAudio`). */
  files?: Record<string, { path: string; type: BlobKind; mimeType: string }>;
}
