import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  Loader2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { WaveformCanvas } from '@/components/Waveform';
import { MAX_CROSSFADE, usePlayer } from '@/hooks/usePlayer';
import { useProgress } from '@/hooks/useProgress';
import { useWaveform } from '@/hooks/useWaveform';
import { formatTime } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatPercent, spokenTime, useI18n } from '@/i18n';

const KEY_SEEK = 5; // seconds per arrow key on the timeline

/**
 * Scrubbable timeline. Drag previews the position and seeks on release; keys seek
 * immediately. Hovering shows the time under the pointer. With `waveform`, the track's
 * waveform is drawn under an invisible full-width slider, so clicks land exactly where
 * the waveform shows (the slider stays for keyboard and screen-reader use).
 */
export function Timeline({
  className,
  size = 'md',
  waveform = false,
}: {
  className?: string;
  size?: 'md' | 'lg';
  waveform?: boolean;
}) {
  const { audio, currentTrack, seek } = usePlayer();
  const { t } = useI18n();
  const peaks = useWaveform(waveform ? currentTrack : null);
  const [hover, setHover] = useState<number | null>(null); // 0–1 under the pointer
  const { current, duration } = useProgress(audio, currentTrack?.duration ?? 0);
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);
  // Position just seeked to, shown until playback reports it. Without this the slider
  // briefly re-renders the old position, and the browser's trailing `change` event
  // (fired after pointerup) carries that stale value and seeks straight back.
  const [held, setHeld] = useState<number | null>(null);
  const heldRef = useRef<number | null>(null);

  // Commit the drag even if the pointer is released outside the slider.
  const scrubbing = scrub !== null;
  useEffect(() => {
    if (!scrubbing) return;
    const commit = () => {
      const v = scrubRef.current;
      scrubRef.current = null;
      if (v !== null) {
        seek(v);
        heldRef.current = v;
        setHeld(v);
      }
      setScrub(null);
    };
    window.addEventListener('pointerup', commit, { once: true });
    window.addEventListener('pointercancel', commit, { once: true });
    return () => {
      window.removeEventListener('pointerup', commit);
      window.removeEventListener('pointercancel', commit);
    };
  }, [scrubbing, seek]);

  // Release the held position once playback catches up (or after a moment regardless).
  useEffect(() => {
    if (held === null) return;
    const release = () => {
      heldRef.current = null;
      setHeld(null);
    };
    if (Math.abs(current - held) < 0.5) return release();
    const timer = setTimeout(release, 1000);
    return () => clearTimeout(timer);
  }, [current, held]);

  const shown = scrub ?? held ?? current;
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;
  const withWave = waveform && !!peaks && !!duration;
  const onHover = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    setHover(Math.max(0, Math.min(1, (e.clientX - box.left) / box.width)));
  };

  return (
    <div
      className={cn('flex w-full items-center gap-2 text-xs tabular-nums text-muted', className)}
    >
      <span className={cn('text-right', size === 'lg' ? 'w-12 text-sm' : 'w-10')}>
        {formatTime(currentTrack ? shown : 0)}
      </span>
      <div
        className={cn(
          'relative flex flex-1 items-center rounded',
          withWave && 'h-12 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent',
        )}
        onPointerMove={duration ? onHover : undefined}
        onPointerLeave={() => setHover(null)}
      >
        {withWave && (
          <WaveformCanvas
            peaks={peaks}
            progress={duration ? shown / duration : 0}
            hover={hover}
            className="absolute inset-0 h-full w-full"
          />
        )}
        {hover !== null && currentTrack && duration > 0 && (
          <span
            className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 rounded bg-fg px-1.5 py-0.5 text-[11px] font-semibold text-bg shadow"
            style={{ left: `${hover * 100}%` }}
            aria-hidden
          >
            {formatTime(hover * duration)}
          </span>
        )}
        <input
          type="range"
          className={withWave ? 'wave-range absolute inset-0 h-full w-full' : 'range'}
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(shown, duration || 1)}
          disabled={!currentTrack || !duration}
          style={{ '--pct': `${pct}%` } as CSSProperties}
          aria-label={t('player.seek')}
          aria-valuetext={t('player.positionOf', {
            position: spokenTime(shown),
            duration: spokenTime(duration),
          })}
          onPointerDown={() => {
            scrubRef.current = shown;
            setScrub(shown);
          }}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (scrubRef.current !== null) {
              scrubRef.current = v;
              setScrub(v);
            } else if (v !== heldRef.current) seek(v); // the release echo repeats the held value
          }}
          onKeyDown={(e) => {
            const delta =
              e.key === 'ArrowRight' || e.key === 'ArrowUp'
                ? KEY_SEEK
                : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                  ? -KEY_SEEK
                  : 0;
            if (!delta) return;
            e.preventDefault();
            e.stopPropagation();
            seek(Math.max(0, Math.min(duration, shown + delta)));
          }}
        />
      </div>
      <span className={cn(size === 'lg' ? 'w-12 text-sm' : 'w-10')}>
        {currentTrack ? formatTime(duration) : '0:00'}
      </span>
    </div>
  );
}

export function PlayPauseButton({
  size = 'md',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const { isPlaying, isBuffering, toggle } = usePlayer();
  const { t } = useI18n();
  const dims = { sm: 'h-9 w-9', md: 'h-10 w-10', lg: 'h-16 w-16' }[size];
  const icon = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' }[size];
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isPlaying ? t('common.pause') : t('common.play')}
      aria-keyshortcuts="Space"
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-fg text-bg transition-transform hover:scale-105 active:scale-95',
        dims,
        className,
      )}
    >
      {isPlaying && isBuffering ? (
        <Loader2 className={cn(icon, 'animate-spin')} aria-hidden />
      ) : isPlaying ? (
        <Pause className={cn(icon, 'fill-current')} aria-hidden />
      ) : (
        <Play className={cn(icon, 'translate-x-[1px] fill-current')} aria-hidden />
      )}
    </button>
  );
}

export function PrevButton({ className }: { className?: string }) {
  const { prev, currentTrack } = usePlayer();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={prev}
      disabled={!currentTrack}
      className={cn('icon-btn', className)}
      aria-label={t('player.previousTrack')}
    >
      <SkipBack className="h-5 w-5 fill-current" aria-hidden />
    </button>
  );
}

export function NextButton({ className }: { className?: string }) {
  const { next, currentTrack } = usePlayer();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={next}
      disabled={!currentTrack}
      className={cn('icon-btn', className)}
      aria-label={t('player.nextTrack')}
    >
      <SkipForward className="h-5 w-5 fill-current" aria-hidden />
    </button>
  );
}

export function ShuffleButton({ className }: { className?: string }) {
  const { shuffle, toggleShuffle } = usePlayer();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleShuffle}
      aria-pressed={shuffle}
      aria-label={t('common.shuffle')}
      title={shuffle ? t('player.shuffleOn') : t('player.shuffleOff')}
      className={cn('icon-btn relative', shuffle && 'text-accent hover:text-accent', className)}
    >
      <Shuffle className="h-5 w-5" aria-hidden />
      {shuffle && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" aria-hidden />}
    </button>
  );
}

export function RepeatButton({ className }: { className?: string }) {
  const { repeat, cycleRepeat } = usePlayer();
  const { t } = useI18n();
  const label = t(
    ({ off: 'player.repeatOff', all: 'player.repeatAll', one: 'player.repeatOne' } as const)[
      repeat
    ],
  );
  const Icon = repeat === 'one' ? Repeat1 : Repeat;
  return (
    <button
      type="button"
      onClick={cycleRepeat}
      aria-label={t('player.activateToChange', { label })}
      title={label}
      className={cn(
        'icon-btn relative',
        repeat !== 'off' && 'text-accent hover:text-accent',
        className,
      )}
    >
      <Icon className="h-5 w-5" aria-hidden />
      {repeat !== 'off' && (
        <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" aria-hidden />
      )}
    </button>
  );
}

export function TransportControls({
  size = 'md',
  className,
}: {
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center',
        size === 'lg' ? 'gap-4' : 'gap-2',
        className,
      )}
    >
      <ShuffleButton />
      <PrevButton />
      <PlayPauseButton size={size === 'lg' ? 'lg' : 'md'} />
      <NextButton />
      <RepeatButton />
    </div>
  );
}

export function VolumeControl({ className }: { className?: string }) {
  const { volume, muted, setVolume, toggleMute } = usePlayer();
  const { t } = useI18n();
  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        className="icon-btn"
        onClick={toggleMute}
        aria-label={t('player.mute')}
        aria-pressed={muted}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </button>
      <input
        type="range"
        className="range w-24"
        min={0}
        max={1}
        step={0.01}
        value={effective}
        onChange={(e) => setVolume(Number(e.target.value))}
        style={{ '--pct': `${effective * 100}%` } as CSSProperties}
        aria-label={t('player.volume')}
        aria-valuetext={formatPercent(effective)}
      />
    </div>
  );
}

/** Crossfade length between tracks. 0 plays tracks back to back with no gap. */
export function CrossfadeControl({
  className,
  hideLabel,
}: {
  className?: string;
  /** When a surrounding heading already says "Crossfade". */
  hideLabel?: boolean;
}) {
  const { crossfade, canCrossfade, setCrossfade } = usePlayer();
  const { t } = useI18n();
  const value = canCrossfade ? crossfade : 0;
  const label = value === 0 ? t('player.crossfadeOff') : t('player.crossfadeSeconds', { s: value });
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-3">
        <label htmlFor="crossfade" className={cn('text-sm font-semibold', hideLabel && 'sr-only')}>
          {t('player.crossfade')}
        </label>
        <input
          id="crossfade"
          type="range"
          className="range w-32"
          min={0}
          max={MAX_CROSSFADE}
          step={1}
          value={value}
          disabled={!canCrossfade}
          onChange={(e) => setCrossfade(Number(e.target.value))}
          style={{ '--pct': `${(value / MAX_CROSSFADE) * 100}%` } as CSSProperties}
          aria-valuetext={
            value === 0
              ? t('player.crossfadeOffSpoken')
              : t('player.crossfadeSecondsSpoken', { count: value })
          }
          aria-describedby="crossfade-help"
        />
        <span className="w-24 text-sm tabular-nums text-muted">{label}</span>
      </div>
      <p id="crossfade-help" className="text-xs text-muted">
        {canCrossfade ? t('player.crossfadeHelp') : t('player.crossfadeUnavailable')}
      </p>
    </div>
  );
}
