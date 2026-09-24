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
import { usePlayer } from '@/hooks/usePlayer';
import { useProgress } from '@/hooks/useProgress';
import { formatTime, spokenTime } from '@/lib/audio';
import { cn } from '@/lib/utils';

const KEY_SEEK = 5; // seconds per arrow key on the timeline

/** Scrubbable timeline. Drag previews the position and seeks on release; keys seek immediately. */
export function Timeline({ className, size = 'md' }: { className?: string; size?: 'md' | 'lg' }) {
  const { audio, currentTrack, seek } = usePlayer();
  const { current, duration } = useProgress(audio, currentTrack?.duration ?? 0);
  const [scrub, setScrub] = useState<number | null>(null);
  const scrubRef = useRef<number | null>(null);

  // Commit the drag even if the pointer is released outside the slider.
  const scrubbing = scrub !== null;
  useEffect(() => {
    if (!scrubbing) return;
    const commit = () => {
      if (scrubRef.current !== null) seek(scrubRef.current);
      scrubRef.current = null;
      setScrub(null);
    };
    window.addEventListener('pointerup', commit, { once: true });
    window.addEventListener('pointercancel', commit, { once: true });
    return () => {
      window.removeEventListener('pointerup', commit);
      window.removeEventListener('pointercancel', commit);
    };
  }, [scrubbing, seek]);

  const shown = scrub ?? current;
  const pct = duration > 0 ? Math.min(100, (shown / duration) * 100) : 0;

  return (
    <div
      className={cn('flex w-full items-center gap-2 text-xs tabular-nums text-muted', className)}
    >
      <span className={cn('text-right', size === 'lg' ? 'w-12 text-sm' : 'w-10')}>
        {formatTime(currentTrack ? shown : 0)}
      </span>
      <input
        type="range"
        className="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={Math.min(shown, duration || 1)}
        disabled={!currentTrack || !duration}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        aria-label="Seek"
        aria-valuetext={`${spokenTime(shown)} of ${spokenTime(duration)}`}
        onPointerDown={() => {
          scrubRef.current = current;
          setScrub(current);
        }}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (scrubRef.current !== null) {
            scrubRef.current = v;
            setScrub(v);
          } else seek(v);
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
          seek(Math.max(0, Math.min(duration, current + delta)));
        }}
      />
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
  const dims = { sm: 'h-9 w-9', md: 'h-10 w-10', lg: 'h-16 w-16' }[size];
  const icon = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-7 w-7' }[size];
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isPlaying ? 'Pause' : 'Play'}
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
  return (
    <button
      type="button"
      onClick={prev}
      disabled={!currentTrack}
      className={cn('icon-btn', className)}
      aria-label="Previous track"
    >
      <SkipBack className="h-5 w-5 fill-current" aria-hidden />
    </button>
  );
}

export function NextButton({ className }: { className?: string }) {
  const { next, currentTrack } = usePlayer();
  return (
    <button
      type="button"
      onClick={next}
      disabled={!currentTrack}
      className={cn('icon-btn', className)}
      aria-label="Next track"
    >
      <SkipForward className="h-5 w-5 fill-current" aria-hidden />
    </button>
  );
}

export function ShuffleButton({ className }: { className?: string }) {
  const { shuffle, toggleShuffle } = usePlayer();
  return (
    <button
      type="button"
      onClick={toggleShuffle}
      aria-pressed={shuffle}
      aria-label="Shuffle"
      title={shuffle ? 'Shuffle on' : 'Shuffle off'}
      className={cn('icon-btn relative', shuffle && 'text-accent hover:text-accent', className)}
    >
      <Shuffle className="h-5 w-5" aria-hidden />
      {shuffle && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" aria-hidden />}
    </button>
  );
}

export function RepeatButton({ className }: { className?: string }) {
  const { repeat, cycleRepeat } = usePlayer();
  const label = { off: 'Repeat off', all: 'Repeat all', one: 'Repeat one' }[repeat];
  const Icon = repeat === 'one' ? Repeat1 : Repeat;
  return (
    <button
      type="button"
      onClick={cycleRepeat}
      aria-label={`${label}. Activate to change.`}
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
  const effective = muted ? 0 : volume;
  const Icon = effective === 0 ? VolumeX : effective < 0.5 ? Volume1 : Volume2;
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button
        type="button"
        className="icon-btn"
        onClick={toggleMute}
        aria-label="Mute"
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
        aria-label="Volume"
        aria-valuetext={`${Math.round(effective * 100)}%`}
      />
    </div>
  );
}
