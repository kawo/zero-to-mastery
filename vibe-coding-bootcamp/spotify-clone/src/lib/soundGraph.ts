/**
 * Web Audio routing for the equalizer, loudness normalization and visualizer.
 *
 *   deck A <audio> ─► source ─► gain (normalization A) ─┐
 *                                                       ├─► preamp ─► 10 peaking EQ bands ─► speakers
 *   deck B <audio> ─► source ─► gain (normalization B) ─┘                     └─► analyser (visualizer)
 *
 * Built lazily, the first time the EQ, normalization or visualizer is switched on. Once an
 * element is routed through Web Audio it can't be un-routed, and on iOS audio that
 * goes through Web Audio can stop when the screen locks, so with all three off
 * the app never creates it and playback stays on the plain <audio> path.
 *
 * Element `volume` and `muted` still apply before the source node, so the volume
 * slider and crossfades keep working unchanged.
 */
import { EQ_BANDS, EQ_Q, eqPreampDb } from '@/lib/eq';

interface Graph {
  ctx: AudioContext;
  preamp: GainNode;
  bands: BiquadFilterNode[];
  analyser: AnalyserNode;
  decks: Map<HTMLAudioElement, GainNode>;
}

let graph: Graph | null = null;

const dbToGain = (db: number) => Math.pow(10, db / 20);
/** Short ramps so changes don't click. */
const RAMP = 0.05;

export function soundGraphActive(): boolean {
  return graph !== null;
}

/** Creates the graph (once) and routes these elements through it. */
export function ensureSoundGraph(elements: readonly (HTMLAudioElement | null)[]): boolean {
  if (typeof AudioContext === 'undefined') return false;
  if (!graph) {
    const ctx = new AudioContext();
    const preamp = ctx.createGain();
    const bands = EQ_BANDS.map((hz) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = hz;
      f.Q.value = EQ_Q;
      f.gain.value = 0;
      return f;
    });
    [preamp, ...bands].reduce((a, b) => (a.connect(b), b));
    const out = bands[bands.length - 1]!;
    out.connect(ctx.destination);
    // A side branch for the visualizer: it reads the audio, it doesn't pass it on.
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    out.connect(analyser);
    graph = { ctx, preamp, bands, analyser, decks: new Map() };
  }
  for (const el of elements) {
    if (!el || graph.decks.has(el)) continue;
    const gain = graph.ctx.createGain();
    graph.ctx.createMediaElementSource(el).connect(gain).connect(graph.preamp);
    graph.decks.set(el, gain);
  }
  void resumeSoundGraph();
  return true;
}

/** The visualizer's analyser, building the graph if needed. Null without Web Audio. */
export function getAnalyser(elements: readonly (HTMLAudioElement | null)[]): AnalyserNode | null {
  return ensureSoundGraph(elements) ? graph!.analyser : null;
}

/** The context starts suspended until a user gesture; call before playing. */
export async function resumeSoundGraph(): Promise<void> {
  if (graph && graph.ctx.state !== 'running') {
    try {
      await graph.ctx.resume();
    } catch {
      /* resumes on the next gesture */
    }
  }
}

/** Applies EQ band gains (dB); `enabled: false` makes the EQ flat without removing it. */
export function setEqualizer(enabled: boolean, gains: readonly number[]): void {
  if (!graph) return;
  const t = graph.ctx.currentTime;
  const g = enabled ? gains : gains.map(() => 0);
  graph.bands.forEach((band, i) => band.gain.setTargetAtTime(g[i] ?? 0, t, RAMP));
  graph.preamp.gain.setTargetAtTime(dbToGain(eqPreampDb(g)), t, RAMP);
}

/** Normalization gain for whatever track this deck holds. */
export function setDeckGain(el: HTMLAudioElement | null, db: number): void {
  const gain = el && graph?.decks.get(el);
  if (!gain || !graph) return;
  gain.gain.setTargetAtTime(dbToGain(db), graph.ctx.currentTime, RAMP);
}
