/**
 * Library backup & restore.
 *
 * - Metadata-only export: `tunebox-backup-<date>.json` (tracks, playlists, settings).
 * - Full export: a .zip containing backup.json + audio/ + artwork/ (stored, not
 *   recompressed; MP3/JPEG don't compress further).
 *
 * Restore maps backup tracks onto local ones by content hash, so a JSON-only
 * backup "re-links" to songs already on this device. Tracks whose audio is not
 * available are kept as `audioMissing` and relink when the same file is imported.
 */
import { db, getSettings, updateSettings } from '@/db/indexedDb';
import { uid } from '@/lib/utils';
import type { BackupFile, BlobDoc, BlobKind, Playlist, Track } from '@/types';

const EXT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

async function buildManifest(includesAudio: boolean): Promise<BackupFile> {
  const [tracks, playlists, settings, lyrics] = await Promise.all([
    db.tracks.toArray(),
    db.playlists.toArray(),
    getSettings(),
    db.lyrics.toArray(),
  ]);
  return {
    format: 'tunebox-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    includesAudio,
    tracks,
    playlists,
    lyrics: lyrics.filter((l) => l.lrc || l.plain || l.instrumental),
    settings: {
      theme: settings.theme,
      repeat: settings.repeat,
      shuffle: settings.shuffle,
      volume: settings.volume,
    },
  };
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportMetadata(): Promise<{ blob: Blob; fileName: string }> {
  const manifest = await buildManifest(false);
  return {
    blob: new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
    fileName: `tunebox-backup-${stamp()}.json`,
  };
}

/** Rough size of a full export, to warn before building a huge zip in memory. */
export async function estimateFullExportSize(): Promise<number> {
  let total = 0;
  await db.blobs.each((b) => {
    total += b.size;
  });
  return total;
}

export async function exportWithAudio(
  onProgress?: (done: number, total: number) => void,
): Promise<{ blob: Blob; fileName: string }> {
  const { zip } = await import('fflate');
  const manifest = await buildManifest(true);
  const referenced = new Set<string>();
  for (const t of manifest.tracks) {
    if (!t.audioMissing) referenced.add(t.audioBlobId);
    if (t.artworkBlobId) referenced.add(t.artworkBlobId);
  }

  const files: Record<string, Uint8Array> = {};
  manifest.files = {};
  const ids = [...referenced];
  for (let i = 0; i < ids.length; i++) {
    const doc = await db.blobs.get(ids[i]!);
    onProgress?.(i + 1, ids.length);
    if (!doc) continue;
    const path = `${doc.type}/${doc.id}.${EXT[doc.mimeType] ?? 'bin'}`;
    files[path] = new Uint8Array(await doc.blob.arrayBuffer());
    manifest.files[doc.id] = { path, type: doc.type, mimeType: doc.mimeType };
  }
  files['backup.json'] = new TextEncoder().encode(JSON.stringify(manifest, null, 2));

  const data = await new Promise<Uint8Array>((resolve, reject) =>
    zip(files, { level: 0 }, (err, out) => (err ? reject(err) : resolve(out))),
  );
  return {
    blob: new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    fileName: `tunebox-full-backup-${stamp()}.zip`,
  };
}

export interface RestoreSummary {
  tracksAdded: number;
  tracksLinked: number;
  tracksMissingAudio: number;
  playlists: number;
}

function assertBackup(value: unknown): asserts value is BackupFile {
  const v = value as Partial<BackupFile> | null;
  if (
    !v ||
    v.format !== 'tunebox-backup' ||
    !Array.isArray(v.tracks) ||
    !Array.isArray(v.playlists)
  ) {
    throw new Error('This file is not a Tunebox backup.');
  }
  if (v.version !== 1)
    throw new Error(
      `Backup version ${String(v.version)} is not supported by this version of Tunebox.`,
    );
}

/** Restores a `.json` or `.zip` backup, merging into the current library. */
export async function importBackup(file: File): Promise<RestoreSummary> {
  let manifest: BackupFile;
  let zipFiles: Record<string, Uint8Array> | null = null;

  if (file.name.toLowerCase().endsWith('.zip') || file.type.includes('zip')) {
    const { unzip } = await import('fflate');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const unzipped = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
      unzip(bytes, (err, out) =>
        err ? reject(new Error('The zip file is damaged or incomplete.')) : resolve(out),
      ),
    );
    zipFiles = unzipped;
    const json = unzipped['backup.json'];
    if (!json) throw new Error('The zip has no backup.json inside. Was it exported from Tunebox?');
    manifest = JSON.parse(new TextDecoder().decode(json)) as BackupFile;
  } else {
    try {
      manifest = JSON.parse(await file.text()) as BackupFile;
    } catch {
      throw new Error('The backup file is not valid JSON.');
    }
  }
  assertBackup(manifest);

  const summary: RestoreSummary = {
    tracksAdded: 0,
    tracksLinked: 0,
    tracksMissingAudio: 0,
    playlists: 0,
  };
  /** backup track id → local track id */
  const idMap = new Map<string, string>();
  const now = Date.now();

  const zip = zipFiles;
  await db.transaction('rw', [db.tracks, db.blobs, db.playlists, db.lyrics], async () => {
    for (const t of manifest.tracks) {
      const local = await db.tracks.where('hash').equals(t.hash).first();
      if (local) {
        idMap.set(t.id, local.id);
        // A local placeholder can be filled from a full backup.
        if (local.audioMissing && zip) {
          if (await restoreBlob(manifest, zip, t.audioBlobId, local.audioBlobId)) {
            await db.tracks.update(local.id, { audioMissing: false, updatedAt: now });
          }
        }
        summary.tracksLinked++;
        continue;
      }

      const newId = (await db.tracks.get(t.id)) ? uid() : t.id;
      idMap.set(t.id, newId);
      const audioBlobId = `audio-${newId}`;
      const hasAudio = !!zip && (await restoreBlob(manifest, zip, t.audioBlobId, audioBlobId));
      let artworkBlobId: string | undefined;
      if (t.artworkBlobId) {
        const exists = await db.blobs.get(t.artworkBlobId);
        if (
          exists ||
          (zip && (await restoreBlob(manifest, zip, t.artworkBlobId, t.artworkBlobId)))
        ) {
          artworkBlobId = t.artworkBlobId;
        }
      }
      const track: Track = {
        ...t,
        id: newId,
        audioBlobId,
        artworkBlobId,
        audioMissing: !hasAudio,
        playCount: t.playCount ?? 0,
        updatedAt: now,
      };
      await db.tracks.add(track);
      summary.tracksAdded++;
      if (!hasAudio) summary.tracksMissingAudio++;
    }

    // Lyrics restore onto the mapped track, without overwriting lyrics already here.
    for (const l of manifest.lyrics ?? []) {
      const trackId = idMap.get(l.trackId);
      if (!trackId) continue;
      const existing = await db.lyrics.get(trackId);
      if (existing && (existing.lrc || existing.plain)) continue;
      await db.lyrics.put({ ...l, trackId });
    }

    for (const p of manifest.playlists) {
      const trackIds = [
        ...new Set(p.trackIds.map((id) => idMap.get(id)).filter((x): x is string => !!x)),
      ];
      const existing = await db.playlists.get(p.id);
      const playlist: Playlist = { ...p, trackIds, updatedAt: now };
      if (existing) {
        // Keep both when they diverged; overwrite when it is the same playlist restored.
        if (existing.name !== p.name) playlist.id = uid();
        else playlist.trackIds = [...new Set([...existing.trackIds, ...trackIds])];
      }
      await db.playlists.put(playlist);
      summary.playlists++;
    }
  });

  if (manifest.settings) await updateSettings(manifest.settings);
  return summary;
}

async function restoreBlob(
  manifest: BackupFile,
  zipFiles: Record<string, Uint8Array>,
  sourceId: string,
  targetId: string,
): Promise<boolean> {
  const entry = manifest.files?.[sourceId];
  const bytes = entry && zipFiles[entry.path];
  if (!entry || !bytes) return false;
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: entry.mimeType });
  const doc: BlobDoc = {
    id: targetId,
    type: entry.type as BlobKind,
    blob,
    mimeType: entry.mimeType,
    size: blob.size,
    createdAt: Date.now(),
  };
  await db.blobs.put(doc);
  return true;
}
