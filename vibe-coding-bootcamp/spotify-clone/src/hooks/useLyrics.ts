import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/indexedDb';
import { parseLrc, type LyricLine } from '@/lib/lrc';
import type { LyricsDoc } from '@/types';

export interface LyricsState {
  /** undefined while loading, null when nothing is stored for the track. */
  doc: LyricsDoc | null | undefined;
  /** Parsed synced lines (empty when the lyrics are plain or missing). */
  lines: LyricLine[];
  plain: string | undefined;
  /** Seconds to add to the playback position (the user's timing correction). */
  offset: number;
}

/** Stored lyrics for a track, live-updated when they change. */
export function useLyrics(trackId: string | undefined): LyricsState {
  const doc = useLiveQuery(
    async () => (trackId ? ((await db.lyrics.get(trackId)) ?? null) : null),
    [trackId],
  );
  const lines = useMemo(() => (doc?.lrc ? parseLrc(doc.lrc) : []), [doc?.lrc]);
  return { doc, lines, plain: doc?.plain, offset: (doc?.offsetMs ?? 0) / 1000 };
}
