import { probeDuration } from '@/lib/audio';

export interface ParsedPicture {
  data: Uint8Array;
  mimeType: string;
}

export interface ParsedMetadata {
  title: string;
  artist: string;
  album: string;
  /** Seconds; 0 if unknown. */
  duration: number;
  year?: number;
  genre?: string;
  trackNo?: number;
  picture?: ParsedPicture;
  /** True when tags were missing/unreadable and we fell back to the file name. */
  fromFileName: boolean;
}

export const UNKNOWN_ARTIST = 'Unknown artist';
export const UNKNOWN_ALBUM = 'Unknown album';

/**
 * Best-effort parse of "01 - Artist - Title.mp3", "Artist - Title.mp3", "03. Title.mp3".
 */
export function parseFileName(fileName: string): {
  title: string;
  artist?: string;
  trackNo?: number;
} {
  let base = fileName
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/_/g, ' ')
    .trim();
  let trackNo: number | undefined;
  const num = /^(\d{1,3})\s*[-.)\]]?\s+/.exec(base);
  if (num) {
    trackNo = Number(num[1]);
    base = base.slice(num[0].length);
  }
  const parts = base.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    const artist = parts.shift()!.trim();
    return { title: parts.join(' - ').trim() || fileName, artist: artist || undefined, trackNo };
  }
  return { title: base || fileName, trackNo };
}

const clean = (v: string | undefined | null) => (v ?? '').replace(/\0/g, '').trim();

/**
 * Reads ID3/Vorbis/MP4 tags (and embedded cover art) in the browser.
 * music-metadata is loaded on demand so it doesn't weigh on the initial bundle.
 * Never throws for bad tags: falls back to the file name instead.
 */
export async function extractMetadata(file: File): Promise<ParsedMetadata> {
  const fromName = parseFileName(file.name);
  try {
    const { parseBlob, selectCover } = await import('music-metadata');
    // `duration: false` keeps parsing fast (no full-file scan); we probe below if needed.
    const meta = await parseBlob(file, { duration: false, skipPostHeaders: true });
    const { common, format } = meta;
    const cover = selectCover(common.picture);
    let duration = format.duration ?? 0;
    if (!duration) duration = await probeDuration(file);

    const title = clean(common.title) || fromName.title;
    const artist =
      clean(common.artist) || clean(common.albumartist) || fromName.artist || UNKNOWN_ARTIST;
    return {
      title,
      artist,
      album: clean(common.album) || UNKNOWN_ALBUM,
      duration,
      year: common.year && common.year > 0 ? common.year : undefined,
      genre: clean(common.genre?.[0]) || undefined,
      trackNo: common.track.no ?? fromName.trackNo,
      picture:
        cover && cover.data.length > 0
          ? { data: cover.data, mimeType: normalizeImageMime(cover.format) }
          : undefined,
      fromFileName: !clean(common.title),
    };
  } catch (err) {
    console.warn(`Tag parsing failed for ${file.name}; using the file name.`, err);
    return {
      title: fromName.title,
      artist: fromName.artist ?? UNKNOWN_ARTIST,
      album: UNKNOWN_ALBUM,
      duration: await probeDuration(file),
      trackNo: fromName.trackNo,
      fromFileName: true,
    };
  }
}

function normalizeImageMime(format: string | undefined): string {
  const f = (format ?? '').toLowerCase();
  if (f.includes('png')) return 'image/png';
  if (f.includes('webp')) return 'image/webp';
  if (f.includes('gif')) return 'image/gif';
  return 'image/jpeg'; // ID3 often says "JPG" or omits it
}
