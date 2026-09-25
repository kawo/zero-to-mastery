/**
 * Decodes an audio file for offline analysis (loudness, waveform) at a reduced
 * sample rate: analysis doesn't need full fidelity, and a lower rate keeps the
 * decoded buffer small (a 5-minute stereo song at 22 kHz is ~50 MB of floats).
 */
export async function decodeForAnalysis(blob: Blob, sampleRate: number): Promise<AudioBuffer> {
  if (typeof OfflineAudioContext === 'undefined') throw new Error('Web Audio is not available.');
  return new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(await blob.arrayBuffer());
}
