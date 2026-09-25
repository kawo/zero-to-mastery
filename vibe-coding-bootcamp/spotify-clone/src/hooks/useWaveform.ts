import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/indexedDb';
import { queueWaveform, WAVEFORM_VERSION } from '@/lib/waveform';
import type { Track } from '@/types';

/** Let playback start before decoding the file for its waveform. */
const COMPUTE_DELAY_MS = 1500;

/**
 * The track's stored waveform peaks: undefined while loading, null when there's
 * none (yet, or the file can't be analysed). Missing ones are computed in the background.
 */
export function useWaveform(track: Track | null): Uint8Array | null | undefined {
  const doc = useLiveQuery(
    async () => (track ? ((await db.waveforms.get(track.id)) ?? null) : null),
    [track?.id],
  );
  const stale = doc === null || (doc !== undefined && doc.version !== WAVEFORM_VERSION);
  useEffect(() => {
    if (!track || !stale) return;
    const t = setTimeout(() => queueWaveform(track), COMPUTE_DELAY_MS);
    return () => clearTimeout(t);
    // Keyed on the id: `track` changes identity whenever the library updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, stale]);
  if (doc === undefined) return undefined;
  return doc && doc.version === WAVEFORM_VERSION ? doc.peaks : null;
}
