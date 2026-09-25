import { db, describeDbError } from '@/db/indexedDb';
import { requestPersistentStorage } from '@/db/library';
import { canPlay } from '@/lib/audio';
import { extractMetadata } from '@/lib/id3';
import { hashBlob, uid } from '@/lib/utils';
import type { BlobDoc, ImportItem, ImportStatus, Track } from '@/types';
import { t } from '@/i18n/core';

const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav|webm)$/i;

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXT.test(file.name);
}

function guessMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    opus: 'audio/ogg',
    flac: 'audio/flac',
    wav: 'audio/wav',
    webm: 'audio/webm',
  };
  return map[ext ?? ''] ?? 'audio/mpeg';
}

export class QuotaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaError';
  }
}

interface FileResult {
  status: Extract<ImportStatus, 'done' | 'relinked' | 'duplicate' | 'error'>;
  message?: string;
  trackId?: string;
}

/**
 * Imports one file: hash → dedupe → parse tags → store blobs + track in one transaction.
 * Dedupe: identical content (hash) or same file name + duration (±1s).
 */
export async function importFile(
  file: File,
  onStatus: (status: ImportStatus) => void,
): Promise<FileResult> {
  const mimeType = guessMime(file);
  if (!canPlay(mimeType)) {
    return { status: 'error', message: t('importer.cantPlay', { type: mimeType }) };
  }
  if (file.size === 0) return { status: 'error', message: t('importer.empty') };

  onStatus('hashing');
  let hash: string;
  try {
    hash = await hashBlob(file);
  } catch {
    return {
      status: 'error',
      message: t('importer.unreadable'),
    };
  }

  if (inFlight.has(hash)) return { status: 'duplicate', message: t('importer.sameBatch') };
  inFlight.add(hash);
  try {
    return await importHashed(file, hash, mimeType, onStatus);
  } finally {
    inFlight.delete(hash);
  }
}

/** Hashes of files currently being imported, so one batch can't add the same file twice. */
const inFlight = new Set<string>();

async function importHashed(
  file: File,
  hash: string,
  mimeType: string,
  onStatus: (status: ImportStatus) => void,
): Promise<FileResult> {
  const sameContent = await db.tracks.where('hash').equals(hash).first();
  if (sameContent && !sameContent.audioMissing) {
    return {
      status: 'duplicate',
      message: t('importer.alreadyIn', { title: sameContent.title }),
      trackId: sameContent.id,
    };
  }

  onStatus('parsing');
  const meta = await extractMetadata(file);

  if (!sameContent) {
    const sameName = await db.tracks.where('fileName').equals(file.name).toArray();
    const match = sameName.find(
      (t) => Math.abs(t.duration - meta.duration) <= 1 && !t.audioMissing,
    );
    if (match)
      return {
        status: 'duplicate',
        message: t('importer.sameNameLength', { title: match.title }),
        trackId: match.id,
      };
  }

  onStatus('saving');
  const now = Date.now();
  const blobs: BlobDoc[] = [];

  let artworkBlobId: string | undefined;
  if (meta.picture) {
    const artBlob = new Blob([meta.picture.data as Uint8Array<ArrayBuffer>], {
      type: meta.picture.mimeType,
    });
    // Content-addressed so every track of an album shares one image.
    artworkBlobId = `art-${(await hashBlob(artBlob)).split(':')[1]!.slice(0, 32)}`;
    blobs.push({
      id: artworkBlobId,
      type: 'artwork',
      blob: artBlob,
      mimeType: artBlob.type,
      size: artBlob.size,
      createdAt: now,
    });
  }

  // Store a plain Blob (not the File) so Safari doesn't keep a reference to the original path.
  const audioBlob = new Blob([file], { type: mimeType });

  try {
    // Relink: metadata restored from a backup without audio, now the real file arrived.
    if (sameContent?.audioMissing) {
      blobs.push({
        id: sameContent.audioBlobId,
        type: 'audio',
        blob: audioBlob,
        mimeType,
        size: file.size,
        createdAt: now,
      });
      await db.transaction('rw', db.tracks, db.blobs, async () => {
        await putBlobsIfAbsent(blobs);
        await db.tracks.update(sameContent.id, {
          audioMissing: false,
          artworkBlobId: sameContent.artworkBlobId ?? artworkBlobId,
          updatedAt: now,
        });
      });
      return {
        status: 'relinked',
        trackId: sameContent.id,
        message: t('importer.relinked'),
      };
    }

    const id = uid();
    const audioBlobId = `audio-${id}`;
    blobs.push({
      id: audioBlobId,
      type: 'audio',
      blob: audioBlob,
      mimeType,
      size: file.size,
      createdAt: now,
    });
    const track: Track = {
      id,
      title: meta.title,
      artist: meta.artist,
      album: meta.album,
      duration: meta.duration,
      year: meta.year,
      genre: meta.genre,
      trackNo: meta.trackNo,
      audioBlobId,
      artworkBlobId,
      hash,
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      playCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.transaction('rw', db.tracks, db.blobs, db.lyrics, async () => {
      await putBlobsIfAbsent(blobs);
      await db.tracks.add(track);
      if (meta.lyrics)
        await db.lyrics.put({ trackId: id, ...meta.lyrics, source: 'embedded', updatedAt: now });
    });
    return {
      status: 'done',
      trackId: id,
      message: meta.fromFileName ? t('importer.noTags') : undefined,
    };
  } catch (err) {
    const message = describeDbError(err);
    if (/storage space/.test(message)) throw new QuotaError(message);
    return { status: 'error', message };
  }
}

async function putBlobsIfAbsent(blobs: BlobDoc[]): Promise<void> {
  const existing = await db.blobs.bulkGet(blobs.map((b) => b.id));
  const fresh = blobs.filter((_, i) => !existing[i]);
  if (fresh.length) await db.blobs.bulkAdd(fresh);
}

export interface ImportCallbacks {
  onItem: (key: string, patch: Partial<ImportItem>) => void;
  signal?: AbortSignal;
}

/**
 * Imports files two at a time (hashing and parsing are I/O bound; more
 * parallelism mostly adds memory pressure on phones). Stops early on quota errors.
 */
export async function importFiles(
  entries: { key: string; file: File }[],
  { onItem, signal }: ImportCallbacks,
): Promise<{
  added: number;
  duplicates: number;
  failed: number;
  relinked: number;
  quotaError?: string;
}> {
  void requestPersistentStorage();
  const totals = {
    added: 0,
    duplicates: 0,
    failed: 0,
    relinked: 0,
    quotaError: undefined as string | undefined,
  };
  let cursor = 0;

  const worker = async () => {
    while (cursor < entries.length && !signal?.aborted && !totals.quotaError) {
      const { key, file } = entries[cursor++]!;
      try {
        const res = await importFile(file, (status) => onItem(key, { status }));
        onItem(key, res);
        if (res.status === 'done') totals.added++;
        else if (res.status === 'relinked') totals.relinked++;
        else if (res.status === 'duplicate') totals.duplicates++;
        else totals.failed++;
      } catch (err) {
        totals.failed++;
        if (err instanceof QuotaError) totals.quotaError = err.message;
        onItem(key, {
          status: 'error',
          message: err instanceof Error ? err.message : t('importer.failed'),
        });
      }
    }
  };
  await Promise.all([worker(), worker()]);

  // Anything not reached (abort or quota) is marked so the list doesn't look stuck.
  for (let i = cursor; i < entries.length; i++) {
    onItem(entries[i]!.key, {
      status: 'error',
      message: totals.quotaError ? t('importer.skippedFull') : t('importer.cancelled'),
    });
  }
  return totals;
}
