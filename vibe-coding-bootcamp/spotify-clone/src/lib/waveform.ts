/**
 * Waveform previews for the seek bar: each track is decoded once, in the
 * background, and reduced to WAVEFORM_BUCKETS peak values (0–255) stored in the
 * `waveforms` store. Nothing here touches the playing audio, so it works the same
 * on every platform.
 */
import { db } from '@/db/indexedDb';
import { decodeForAnalysis } from '@/lib/decode';
import type { Track } from '@/types';

export const WAVEFORM_BUCKETS = 800;
/** Bump when the peak format changes, so old previews are recomputed. */
export const WAVEFORM_VERSION = 1;
/** Peaks don't need detail: a low rate keeps long tracks affordable. */
const RATE_SHORT = 8000;
const RATE_LONG = 3000; // Web Audio's minimum
const LONG_TRACK_SECONDS = 20 * 60;
const MAX_SECONDS = 3 * 3600;

/**
 * Peak amplitude per bucket across all channels, scaled so the loudest bucket is
 * 255 (quiet masters still show their shape). A square root lifts quiet passages
 * a little so they don't vanish next to loud ones.
 */
export function computePeaks(buffer: AudioBuffer, buckets = WAVEFORM_BUCKETS): Uint8Array {
  const size = Math.max(1, Math.floor(buffer.length / buckets));
  const raw = new Float32Array(buckets);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let b = 0; b < buckets; b++) {
      let max = raw[b]!;
      for (let i = b * size, end = Math.min(data.length, i + size); i < end; i++) {
        const v = Math.abs(data[i]!);
        if (v > max) max = v;
      }
      raw[b] = max;
    }
  }
  const top = Math.max(...raw, 1e-6);
  return Uint8Array.from(raw, (v) => Math.round(Math.sqrt(v / top) * 255));
}

let chain: Promise<void> = Promise.resolve();
const pending = new Set<string>();

/** Computes and stores a track's waveform in the background, one track at a time. */
export function queueWaveform(track: Track): void {
  if (track.audioMissing || pending.has(track.id) || track.duration > MAX_SECONDS) return;
  pending.add(track.id);
  chain = chain.then(async () => {
    try {
      const existing = await db.waveforms.get(track.id);
      if (existing?.version === WAVEFORM_VERSION) return;
      const doc = await db.blobs.get(track.audioBlobId);
      if (!doc) return;
      const rate = track.duration > LONG_TRACK_SECONDS ? RATE_LONG : RATE_SHORT;
      const peaks = computePeaks(await decodeForAnalysis(doc.blob, rate));
      await db.waveforms.put({ trackId: track.id, peaks, version: WAVEFORM_VERSION });
    } catch {
      // Undecodable here: the seek bar stays a plain slider for this track.
      await db.waveforms
        .put({ trackId: track.id, peaks: null, version: WAVEFORM_VERSION })
        .catch(() => {});
    } finally {
      pending.delete(track.id);
    }
  });
}
