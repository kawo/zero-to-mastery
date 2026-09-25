/**
 * Lyrics storage and lookup. Sources, in the order they're used:
 *   1. embedded in the file's tags (ID3 USLT/SYLT, Vorbis LYRICS), read at import
 *   2. a sidecar .lrc file imported with (or after) the song, matched by file name
 *   3. lrclib.net, looked up when the lyrics view opens (can be switched off)
 *   4. pasted by hand
 * Everything is stored in IndexedDB, so lyrics work offline once found.
 */
import { db } from '@/db/indexedDb';
import { isLrc } from '@/lib/lrc';
import type { LyricsDoc, LyricsSource, Track } from '@/types';

const LRCLIB = 'https://lrclib.net/api';
/** Don't ask LRCLIB again for a song it didn't have, for this long. */
const NOT_FOUND_TTL = 7 * 24 * 3600 * 1000;

/** Splits pasted or file text into synced (LRC) or plain lyrics. */
export function lyricsFromText(text: string): Pick<LyricsDoc, 'lrc' | 'plain'> {
  const t = text.replace(/\r\n/g, '\n').trim();
  return isLrc(t) ? { lrc: t } : { plain: t };
}

export async function saveLyrics(
  trackId: string,
  content: Pick<LyricsDoc, 'lrc' | 'plain' | 'instrumental'>,
  source: LyricsSource,
): Promise<void> {
  const existing = await db.lyrics.get(trackId);
  await db.lyrics.put({
    trackId,
    ...content,
    source,
    offsetMs: existing?.offsetMs,
    updatedAt: Date.now(),
  });
}

export async function removeLyrics(trackId: string): Promise<void> {
  // Remember the removal so the view doesn't immediately look the song up again.
  await db.lyrics.put({ trackId, notFound: true, source: 'manual', updatedAt: Date.now() });
}

export async function setLyricsOffset(trackId: string, offsetMs: number): Promise<void> {
  await db.lyrics.update(trackId, { offsetMs: Math.round(offsetMs) });
}

/* ------------------------------- LRCLIB ------------------------------- */

interface LrclibRecord {
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

export type LookupResult = 'found' | 'not-found' | 'offline' | 'error';

const inFlight = new Map<string, Promise<LookupResult>>();

/** True when a stored "not found" is recent enough to skip an automatic lookup. */
export function recentlyNotFound(doc: LyricsDoc | undefined): boolean {
  return !!doc?.notFound && Date.now() - doc.updatedAt < NOT_FOUND_TTL;
}

/**
 * Looks the track up on lrclib.net and stores what it finds. Tries an exact match
 * (title, artist, album, duration) first, then a search that prefers synced lyrics
 * with the closest duration. Sends only those four fields.
 */
export function lookupLyrics(track: Track): Promise<LookupResult> {
  const running = inFlight.get(track.id);
  if (running) return running;
  const job = (async (): Promise<LookupResult> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
    try {
      const record = (await getExact(track)) ?? (await searchBest(track));
      if (record && (record.syncedLyrics || record.plainLyrics || record.instrumental)) {
        await saveLyrics(
          track.id,
          {
            lrc: record.syncedLyrics?.trim() || undefined,
            plain: record.plainLyrics?.trim() || undefined,
            instrumental: record.instrumental || undefined,
          },
          'lrclib',
        );
        return 'found';
      }
      await db.lyrics.put({
        trackId: track.id,
        notFound: true,
        source: 'lrclib',
        updatedAt: Date.now(),
      });
      return 'not-found';
    } catch {
      return navigator.onLine ? 'error' : 'offline';
    } finally {
      inFlight.delete(track.id);
    }
  })();
  inFlight.set(track.id, job);
  return job;
}

const known = (s: string | undefined) => !!s && !/^unknown (artist|album)$/i.test(s);

async function getExact(track: Track): Promise<LrclibRecord | null> {
  if (!known(track.artist) || !track.duration) return null;
  const q = new URLSearchParams({
    track_name: track.title,
    artist_name: track.artist,
    duration: String(Math.round(track.duration)),
  });
  if (known(track.album)) q.set('album_name', track.album);
  const res = await fetch(`${LRCLIB}/get?${q}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  return (await res.json()) as LrclibRecord;
}

async function searchBest(track: Track): Promise<LrclibRecord | null> {
  const q = new URLSearchParams({ track_name: track.title });
  if (known(track.artist)) q.set('artist_name', track.artist);
  const res = await fetch(`${LRCLIB}/search?${q}`);
  if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
  const results = (await res.json()) as LrclibRecord[];
  const close = (r: LrclibRecord) =>
    !track.duration || !r.duration || Math.abs(r.duration - track.duration) <= 8;
  const candidates = results.filter((r) => close(r) && (r.syncedLyrics || r.plainLyrics));
  const score = (r: LrclibRecord) =>
    (r.syncedLyrics ? 0 : 100) +
    (track.duration && r.duration ? Math.abs(r.duration - track.duration) : 50);
  return candidates.sort((a, b) => score(a) - score(b))[0] ?? null;
}

/* ---------------------------- .lrc sidecars ---------------------------- */

const baseName = (name: string) =>
  (name.split(/[\\/]/).pop() ?? name).replace(/\.[^.]+$/, '').toLowerCase();

export function isLyricsFile(file: File): boolean {
  return /\.lrc$/i.test(file.name);
}

/**
 * Attaches .lrc files to library tracks with the same file name
 * ("01 - Song.lrc" → "01 - Song.mp3"). Returns how many matched.
 */
export async function attachLyricsFiles(files: File[]): Promise<number> {
  if (!files.length) return 0;
  const tracks = await db.tracks.toArray();
  const byBase = new Map(tracks.map((t) => [baseName(t.fileName), t]));
  let matched = 0;
  for (const file of files) {
    const track = byBase.get(baseName(file.name));
    if (!track) continue;
    const text = await file.text();
    if (!text.trim()) continue;
    await saveLyrics(track.id, lyricsFromText(text), 'file');
    matched++;
  }
  return matched;
}
