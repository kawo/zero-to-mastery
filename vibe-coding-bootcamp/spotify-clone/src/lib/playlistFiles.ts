/**
 * Playlist files: export one playlist as M3U or JSON, and import either back.
 *
 * - M3U (`.m3u8`, UTF-8 extended M3U): `#EXTINF` lines carry duration and
 *   "Artist - Title", followed by the file name. Other players can open it
 *   when it sits next to the music files.
 * - JSON (`tunebox-playlist`): also carries album and content hash, so it
 *   matches exactly on another device with the same files.
 *
 * Import never touches audio. Each entry is matched to a song already in the
 * library by content hash, then file name, then artist + title, then title.
 */
import type { Playlist, Track } from '@/types';
import { normalize } from '@/lib/utils';

export type PlaylistFormat = 'm3u' | 'json';

export interface PlaylistFileEntry {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  fileName?: string;
  hash?: string;
}

export interface PlaylistFile {
  format: 'tunebox-playlist';
  version: 1;
  name: string;
  exportedAt: string;
  tracks: PlaylistFileEntry[];
}

export interface ParsedPlaylist {
  name: string;
  entries: PlaylistFileEntry[];
}

export interface MatchResult {
  trackIds: string[];
  /** Entries with no matching song in the library. */
  missing: PlaylistFileEntry[];
}

/* ------------------------------ Export ------------------------------ */

/** Safe file name from a playlist name. */
function fileBase(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'playlist'
  );
}

/** Keeps each entry on one line; M3U has no escaping. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

export function toM3U(name: string, tracks: Track[]): string {
  const lines = ['#EXTM3U', `#PLAYLIST:${oneLine(name)}`];
  for (const t of tracks) {
    const secs = t.duration > 0 ? Math.round(t.duration) : -1;
    const label = t.artist ? `${t.artist} - ${t.title}` : t.title;
    lines.push(`#EXTINF:${secs},${oneLine(label)}`);
    if (t.album) lines.push(`#EXTALB:${oneLine(t.album)}`);
    lines.push(oneLine(t.fileName));
  }
  return lines.join('\n') + '\n';
}

export function toJSON(name: string, tracks: Track[]): PlaylistFile {
  return {
    format: 'tunebox-playlist',
    version: 1,
    name,
    exportedAt: new Date().toISOString(),
    tracks: tracks.map((t) => ({
      title: t.title,
      artist: t.artist,
      album: t.album,
      duration: t.duration,
      fileName: t.fileName,
      hash: t.hash,
    })),
  };
}

export function exportPlaylist(
  playlist: Playlist,
  tracks: Track[],
  format: PlaylistFormat,
): { blob: Blob; fileName: string } {
  const base = fileBase(playlist.name);
  return format === 'm3u'
    ? {
        blob: new Blob([toM3U(playlist.name, tracks)], { type: 'audio/x-mpegurl;charset=utf-8' }),
        fileName: `${base}.m3u8`,
      }
    : {
        blob: new Blob([JSON.stringify(toJSON(playlist.name, tracks), null, 2)], {
          type: 'application/json',
        }),
        fileName: `${base}.json`,
      };
}

/* ------------------------------ Import ------------------------------ */

/** Last path segment of a local path or URL, decoded. */
function baseName(path: string): string {
  const last = path.split(/[\\/]/).pop() ?? path;
  const clean = last.split(/[?#]/)[0] ?? last;
  try {
    return decodeURIComponent(clean);
  } catch {
    return clean;
  }
}

/** Byte-order mark some editors put at the start of UTF-8 files. */
const BOM = new RegExp('^\uFEFF');

const stripExt = (name: string) => name.replace(/\.[^.]+$/, '');

export function parseM3U(text: string, fallbackName: string): ParsedPlaylist {
  let name = fallbackName;
  const entries: PlaylistFileEntry[] = [];
  let pending: PlaylistFileEntry = {};

  for (const raw of text.replace(BOM, '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const inf = /^#EXTINF:\s*(-?[\d.]+)[^,]*,(.*)$/i.exec(line);
      if (inf) {
        const secs = Number(inf[1]);
        if (secs > 0) pending.duration = secs;
        const label = inf[2]!.trim();
        const sep = label.indexOf(' - ');
        if (sep > 0) {
          pending.artist = label.slice(0, sep).trim();
          pending.title = label.slice(sep + 3).trim();
        } else if (label) {
          pending.title = label;
        }
      } else if (/^#PLAYLIST:/i.test(line)) {
        name = line.slice(10).trim() || name;
      } else if (/^#EXTALB:/i.test(line)) {
        pending.album = line.slice(8).trim();
      }
      continue;
    }
    entries.push({ ...pending, fileName: baseName(line) });
    pending = {};
  }
  return { name, entries };
}

export function parsePlaylistJSON(text: string, fallbackName: string): ParsedPlaylist {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const d = data as Omit<Partial<PlaylistFile>, 'format'> & { format?: string };
  if (d?.format === 'tunebox-backup')
    throw new Error('This is a full library backup. Restore it from Import → Backup & restore.');
  if (d?.format !== 'tunebox-playlist' || !Array.isArray(d.tracks))
    throw new Error('This JSON file is not a Tunebox playlist.');
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    name: str(d.name) ?? fallbackName,
    entries: d.tracks.map((t) => ({
      title: str(t?.title),
      artist: str(t?.artist),
      album: str(t?.album),
      duration: typeof t?.duration === 'number' ? t.duration : undefined,
      fileName: str(t?.fileName),
      hash: str(t?.hash),
    })),
  };
}

export async function parsePlaylistFile(file: File): Promise<ParsedPlaylist> {
  const text = await file.text();
  const fallback = stripExt(file.name) || 'Imported playlist';
  const isJSON = /\.json$/i.test(file.name) || /^\s*[{[]/.test(text);
  return isJSON ? parsePlaylistJSON(text, fallback) : parseM3U(text, fallback);
}

/** Maps entries to library tracks, in file order, without duplicates. */
export function matchEntries(entries: PlaylistFileEntry[], library: Track[]): MatchResult {
  const byHash = new Map<string, Track>();
  const byFile = new Map<string, Track>();
  const byArtistTitle = new Map<string, Track>();
  const byTitle = new Map<string, Track>();
  const key = (...parts: (string | undefined)[]) =>
    parts.map((p) => normalize(p ?? '')).join('\u0000');
  // First song wins, so re-imports are stable; songs without audio are the last resort.
  const ordered = [...library].sort((a, b) => Number(!!a.audioMissing) - Number(!!b.audioMissing));
  for (const t of ordered) {
    if (!byHash.has(t.hash)) byHash.set(t.hash, t);
    const f = normalize(t.fileName);
    if (!byFile.has(f)) byFile.set(f, t);
    const at = key(t.artist, t.title);
    if (!byArtistTitle.has(at)) byArtistTitle.set(at, t);
    const ti = normalize(t.title);
    if (!byTitle.has(ti)) byTitle.set(ti, t);
  }

  const trackIds: string[] = [];
  const seen = new Set<string>();
  const missing: PlaylistFileEntry[] = [];
  for (const e of entries) {
    const hit =
      (e.hash && byHash.get(e.hash)) ||
      (e.fileName && byFile.get(normalize(e.fileName))) ||
      (e.title && e.artist && byArtistTitle.get(key(e.artist, e.title))) ||
      (e.title && byTitle.get(normalize(e.title))) ||
      // M3U without #EXTINF: try "Artist - Title.mp3" style file names.
      (e.fileName &&
        !e.title &&
        byTitle.get(normalize(stripExt(e.fileName).replace(/^.* - /, '')))) ||
      undefined;
    if (!hit) missing.push(e);
    else if (!seen.has(hit.id)) {
      seen.add(hit.id);
      trackIds.push(hit.id);
    }
  }
  return { trackIds, missing };
}

/** Short human label for an unmatched entry. */
export function describeEntry(e: PlaylistFileEntry): string {
  if (e.title) return e.artist ? `${e.artist} – ${e.title}` : e.title;
  return e.fileName ?? 'Unknown song';
}
