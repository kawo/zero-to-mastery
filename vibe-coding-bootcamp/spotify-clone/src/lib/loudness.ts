/**
 * Loudness normalization: measure each track once (ITU-R BS.1770 integrated
 * loudness, the LUFS figure streaming services use), store it on the track, and
 * play every track at the same target loudness.
 */
import { db } from '@/db/indexedDb';
import { decodeForAnalysis } from '@/lib/decode';
import type { Loudness, Track } from '@/types';

/** Target loudness, as used by most streaming services. */
export const TARGET_LUFS = -14;
/** Never boost a track's peaks above this, so normalization doesn't clip. */
const PEAK_CEILING_DB = -1;
const MAX_BOOST_DB = 8;
const MAX_CUT_DB = -12;
/** Decoding a long mix whole would need too much memory; those play unadjusted. */
const MAX_ANALYZE_SECONDS = 30 * 60;

/** dB to apply to a track so it plays at the target loudness. 0 when unknown. */
export function normalizationGainDb(loudness: Loudness | null | undefined): number {
  if (!loudness) return 0;
  const gain = Math.min(TARGET_LUFS - loudness.lufs, PEAK_CEILING_DB - loudness.peakDb);
  return Math.max(MAX_CUT_DB, Math.min(MAX_BOOST_DB, gain));
}

/**
 * Integrated loudness and sample peak of an audio file. Decodes at a reduced
 * sample rate (plenty for loudness), applies K-weighting, then gates 400 ms blocks
 * at -70 LUFS absolute and -10 LU relative. Null for silence or undecodable files.
 */
export async function measureLoudness(blob: Blob, duration: number): Promise<Loudness | null> {
  if (duration > MAX_ANALYZE_SECONDS || typeof OfflineAudioContext === 'undefined') return null;
  const sampleRate = duration > 10 * 60 ? 8000 : 22050;
  const decoded = await decodeForAnalysis(blob, sampleRate);

  // K-weighting: a high shelf (+4 dB above ~1.7 kHz) and a high-pass at ~38 Hz.
  const ctx = new OfflineAudioContext(decoded.numberOfChannels, decoded.length, decoded.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = decoded;
  const shelf = ctx.createBiquadFilter();
  shelf.type = 'highshelf';
  shelf.frequency.value = 1682;
  shelf.gain.value = 4;
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 38;
  highpass.Q.value = 0.5;
  source.connect(shelf).connect(highpass).connect(ctx.destination);
  source.start();
  const weighted = await ctx.startRendering();

  let peak = 0;
  for (let c = 0; c < decoded.numberOfChannels; c++) {
    const data = decoded.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const v = Math.abs(data[i]!);
      if (v > peak) peak = v;
    }
  }

  // Mean square per 100 ms hop, summed over channels; a 400 ms block is 4 hops.
  const hop = Math.round(weighted.sampleRate / 10);
  const hops = Math.floor(weighted.length / hop);
  const hopEnergy = new Float64Array(hops);
  for (let c = 0; c < weighted.numberOfChannels; c++) {
    const data = weighted.getChannelData(c);
    for (let h = 0; h < hops; h++) {
      let sum = 0;
      for (let i = h * hop, end = i + hop; i < end; i++) sum += data[i]! * data[i]!;
      hopEnergy[h]! += sum / hop;
    }
  }
  const blocks: number[] = [];
  for (let h = 0; h + 4 <= hops; h++)
    blocks.push((hopEnergy[h]! + hopEnergy[h + 1]! + hopEnergy[h + 2]! + hopEnergy[h + 3]!) / 4);

  const lufsOf = (energy: number) => -0.691 + 10 * Math.log10(energy);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const loud = blocks.filter((z) => z > 0 && lufsOf(z) > -70);
  if (!loud.length) return null;
  const relativeGate = lufsOf(mean(loud)) - 10;
  const gated = loud.filter((z) => lufsOf(z) > relativeGate);
  return {
    lufs: Math.round(lufsOf(mean(gated)) * 10) / 10,
    peakDb: Math.round(20 * Math.log10(Math.max(peak, 1e-6)) * 10) / 10,
  };
}

/* ----------------------- one-at-a-time background queue ----------------------- */

let chain: Promise<void> = Promise.resolve();
const pending = new Set<string>();

/**
 * Measures a track in the background (one track at a time) and stores the result
 * on it. Tracks that can't be measured get `loudness: null` so they aren't retried.
 */
export function queueLoudnessAnalysis(track: Track): void {
  if (track.loudness !== undefined || track.audioMissing || pending.has(track.id)) return;
  pending.add(track.id);
  chain = chain.then(async () => {
    try {
      const doc = await db.blobs.get(track.audioBlobId);
      const loudness = doc
        ? await measureLoudness(doc.blob, track.duration).catch(() => null)
        : null;
      await db.tracks.update(track.id, { loudness });
    } catch {
      /* try again next session */
    } finally {
      pending.delete(track.id);
    }
  });
}
