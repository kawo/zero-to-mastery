import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioWaveform, BarChart3, CircleDot, Maximize, Minimize } from 'lucide-react';
import { Artwork } from '@/components/Artwork';
import { useMediaQuery } from '@/hooks/useBrowser';
import { usePlayer } from '@/hooks/usePlayer';
import type { Rgb } from '@/lib/audio';
import { soundGraphActive } from '@/lib/soundGraph';
import { cn } from '@/lib/utils';
import type { Track } from '@/types';

export type VisualizerStyle = 'bars' | 'wave' | 'radial';

const STYLES: { id: VisualizerStyle; label: string; icon: typeof BarChart3 }[] = [
  { id: 'bars', label: 'Spectrum bars', icon: BarChart3 },
  { id: 'wave', label: 'Waveform', icon: AudioWaveform },
  { id: 'radial', label: 'Radial', icon: CircleDot },
];
const STYLE_KEY = 'tunebox-visualizer-style';
const BAR_COUNT = 56;
const MIN_HZ = 40;
const MAX_HZ = 16000;
/** With reduced motion, redraw this often instead of every frame. */
const REDUCED_MOTION_MS = 120;

function readStyle(): VisualizerStyle {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    return v === 'wave' || v === 'radial' ? v : 'bars';
  } catch {
    return 'bars';
  }
}

/** Log-spaced frequency bands (bass gets as many bars as treble, as we hear it). */
function bandEdges(bins: number, sampleRate: number): number[] {
  const hzPerBin = sampleRate / 2 / bins;
  return Array.from({ length: BAR_COUNT + 1 }, (_, i) =>
    Math.min(
      bins,
      Math.max(1, Math.round((MIN_HZ * (MAX_HZ / MIN_HZ) ** (i / BAR_COUNT)) / hzPerBin)),
    ),
  );
}

function accent(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return v ? `rgb(${v})` : '#1db954';
}

/**
 * Live audio visualizer for Now Playing: spectrum bars, an oscilloscope line, or
 * bars around the artwork, in the artwork's colour. It needs Web Audio (see
 * soundGraph.ts), which it switches on when it first appears; on iOS it asks first,
 * because that can stop playback when the screen locks.
 */
export function Visualizer({
  track,
  tint,
  className,
}: {
  track: Track;
  tint: Rgb;
  className?: string;
}) {
  const { getAnalyser, isPlaying, canCrossfade } = usePlayer();
  const [style, setStyleState] = useState<VisualizerStyle>(readStyle);
  // iOS (no volume control) is where Web Audio can stop background playback: ask first.
  const [consented, setConsented] = useState(() => canCrossfade || soundGraphActive());
  const [fullscreen, setFullscreen] = useState(false);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  const setStyle = (s: VisualizerStyle) => {
    setStyleState(s);
    try {
      localStorage.setItem(STYLE_KEY, s);
    } catch {
      /* per-viewer convenience only */
    }
  };

  // getAnalyser builds the Web Audio graph on first use and returns the same node after.
  const analyser = useMemo(() => (consented ? getAnalyser() : null), [consented, getAnalyser]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === box.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Draw loop: runs while playing (and briefly after, so the bars fall to rest).
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !analyser) return;
    const freq = new Uint8Array(analyser.frequencyBinCount);
    const wave = new Uint8Array(analyser.fftSize);
    const edges = bandEdges(analyser.frequencyBinCount, analyser.context.sampleRate);
    const color = `rgb(${tint.r} ${tint.g} ${tint.b})`;
    const hi = accent();
    let frame = 0;
    let last = 0;
    let idleSince = isPlaying ? 0 : performance.now();

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (reducedMotion && now - last < REDUCED_MOTION_MS) return;
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr)) el.width = Math.round(w * dpr);
      if (el.height !== Math.round(h * dpr)) el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      analyser.getByteFrequencyData(freq);

      // Band levels 0–1, the loudest bin in each log-spaced band.
      const levels = edges.slice(0, -1).map((start, i) => {
        let v = 0;
        for (let k = start; k < Math.max(start + 1, edges[i + 1]!); k++)
          v = Math.max(v, freq[k] ?? 0);
        return v / 255;
      });

      if (style === 'bars') {
        const gap = Math.max(2, w / BAR_COUNT / 5);
        const bw = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, color);
        grad.addColorStop(1, hi);
        ctx.fillStyle = grad;
        levels.forEach((v, i) => {
          const bh = Math.max(3, v ** 1.4 * h * 0.92);
          ctx.beginPath();
          ctx.roundRect(i * (bw + gap), h - bh, bw, bh, Math.min(4, bw / 2));
          ctx.fill();
        });
      } else if (style === 'wave') {
        analyser.getByteTimeDomainData(wave);
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = hi;
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        const step = w / (wave.length - 1);
        wave.forEach((v, i) => {
          const y = h / 2 + ((v - 128) / 128) * (h / 2) * 0.9;
          if (i === 0) ctx.moveTo(0, y);
          else ctx.lineTo(i * step, y);
        });
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) * 0.24;
        const span = Math.min(w, h) / 2 - r - 8;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, (2 * Math.PI * r) / (BAR_COUNT * 2) - 2);
        // Mirror the bands around the circle so it's symmetrical.
        const all = [...levels, ...[...levels].reverse()];
        all.forEach((v, i) => {
          const a = (i / all.length) * Math.PI * 2 - Math.PI / 2;
          const len = 4 + v ** 1.3 * span;
          ctx.strokeStyle = i % 2 ? color : hi;
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * (r + 6), cy + Math.sin(a) * (r + 6));
          ctx.lineTo(cx + Math.cos(a) * (r + 6 + len), cy + Math.sin(a) * (r + 6 + len));
          ctx.stroke();
        });
      }

      // Stop drawing a couple of seconds after playback stops (the bars have settled).
      if (!isPlaying) {
        idleSince ||= now;
        if (now - idleSince > 2000 && freq.every((x) => x === 0)) cancelAnimationFrame(frame);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analyser, style, tint, isPlaying, reducedMotion]);

  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  return (
    <div
      ref={box}
      className={cn(
        'relative overflow-hidden rounded-xl',
        fullscreen ? 'bg-black' : 'bg-surface/60',
        className,
      )}
      style={
        fullscreen
          ? {
              background: `radial-gradient(circle at 50% 40%, rgb(${tint.r} ${tint.g} ${tint.b} / 0.35), #000 70%)`,
            }
          : undefined
      }
    >
      {!consented ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="max-w-xs text-sm text-muted">
            The visualizer routes audio through Web Audio. On iPhone and iPad that can stop playback
            when the screen locks, until you reload.
          </p>
          <button type="button" className="btn-primary" onClick={() => setConsented(true)}>
            Start visualizer
          </button>
        </div>
      ) : (
        <>
          {style === 'radial' && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="aspect-square h-[44%] overflow-hidden rounded-full shadow-2xl">
                <Artwork track={track} size="lg" />
              </div>
            </div>
          )}
          <canvas
            ref={canvas}
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label={`Audio visualizer (${STYLES.find((s) => s.id === style)!.label.toLowerCase()})`}
          />
          <div className="absolute right-2 top-2 flex gap-1 rounded-full bg-bg/60 p-1 backdrop-blur">
            {STYLES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setStyle(id)}
                aria-pressed={style === id}
                title={label}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-full',
                  style === id ? 'bg-fg text-bg' : 'text-muted hover:text-fg',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                <span className="sr-only">{label}</span>
              </button>
            ))}
            {canFullscreen && (
              <button
                type="button"
                onClick={() =>
                  fullscreen
                    ? void document.exitFullscreen()
                    : void box.current?.requestFullscreen()
                }
                title={fullscreen ? 'Exit full screen' : 'Full screen'}
                className="grid h-8 w-8 place-items-center rounded-full text-muted hover:text-fg"
              >
                {fullscreen ? (
                  <Minimize className="h-4 w-4" aria-hidden />
                ) : (
                  <Maximize className="h-4 w-4" aria-hidden />
                )}
                <span className="sr-only">{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
