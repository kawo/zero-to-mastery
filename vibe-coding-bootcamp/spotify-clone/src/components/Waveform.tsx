import { useEffect, useRef } from 'react';

const BAR = 2; // px
const GAP = 1; // px
const rgb = (name: string, alpha = 1) => {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `rgb(${v} / ${alpha})` : `rgba(128,128,128,${alpha})`;
};

/**
 * Draws the peaks as mirrored bars: played part in the text colour, the stretch
 * between the playhead and the pointer highlighted, the rest muted.
 */
export function WaveformCanvas({
  peaks,
  progress,
  hover,
  className,
}: {
  peaks: Uint8Array;
  /** 0–1 */
  progress: number;
  /** 0–1 under the pointer, or null. */
  hover: number | null;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0 });

  const draw = () => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const { w, h } = size.current;
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const played = rgb('--fg');
    const ahead = rgb('--muted', 0.45);
    const between = rgb('--fg', 0.55);
    const bars = Math.max(1, Math.floor((w + GAP) / (BAR + GAP)));
    const per = peaks.length / bars;
    const lo = Math.min(progress, hover ?? progress);
    const hi = Math.max(progress, hover ?? progress);
    for (let b = 0; b < bars; b++) {
      // Loudest peak among the buckets this bar covers.
      let v = 0;
      for (
        let i = Math.floor(b * per), end = Math.max(i + 1, Math.floor((b + 1) * per));
        i < end;
        i++
      )
        v = Math.max(v, peaks[i] ?? 0);
      const barH = Math.max(2, (v / 255) * h);
      const x = b * (BAR + GAP);
      const at = (x + BAR / 2) / w;
      ctx.fillStyle =
        at <= progress ? played : hover !== null && at >= lo && at <= hi ? between : ahead;
      ctx.beginPath();
      ctx.roundRect(x, (h - barH) / 2, BAR, barH, 1);
      ctx.fill();
    }
  };
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
    draw();
  });

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: width, h: height };
      el.width = Math.round(width * dpr);
      el.height = Math.round(height * dpr);
      drawRef.current();
    });
    ro.observe(el);
    // Theme switches change the colours; redraw when the root's classes change.
    const mo = new MutationObserver(() => drawRef.current());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return <canvas ref={canvas} className={className} aria-hidden />;
}
