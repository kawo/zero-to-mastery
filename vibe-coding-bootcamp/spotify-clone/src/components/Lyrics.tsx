import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import {
  FileUp,
  Loader2,
  Mic2,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import { db, updateSettings } from '@/db/indexedDb';
import { useMediaQuery } from '@/hooks/useBrowser';
import { useLibrary, useSettings } from '@/hooks/useIndexedDb';
import { useLyrics } from '@/hooks/useLyrics';
import { usePlayer } from '@/hooks/usePlayer';
import { useProgress } from '@/hooks/useProgress';
import { formatTime } from '@/lib/audio';
import { lineIndexAt, type LyricLine } from '@/lib/lrc';
import {
  lookupLyrics,
  lyricsFromText,
  recentlyNotFound,
  removeLyrics,
  saveLyrics,
  setLyricsOffset,
  type LookupResult,
} from '@/lib/lyrics';
import { cn } from '@/lib/utils';
import { useToast } from '@/state/contexts';
import type { Track } from '@/types';

const OFFSET_STEP_MS = 250;
/** After the user scrolls the lyrics, leave them alone this long before following again. */
const MANUAL_SCROLL_MS = 4000;

const SOURCE_LABEL = {
  embedded: 'From the file’s tags',
  file: 'From an .lrc file',
  lrclib: 'Lyrics from LRCLIB (lrclib.net)',
  manual: 'Added by you',
} as const;

/* ----------------------------- lyrics view ----------------------------- */

/**
 * Lyrics for the current track. Synced lyrics highlight and follow the current
 * line (click a line to jump there); plain lyrics just scroll. Missing lyrics are
 * looked up on lrclib.net when that's switched on.
 */
export function LyricsView({ track, className }: { track: Track; className?: string }) {
  const { audio, seek, queue, index } = usePlayer();
  const { byId } = useLibrary();
  const settings = useSettings();
  const toast = useToast();
  const { doc, lines, plain, offset } = useLyrics(track.id);
  const [lookup, setLookup] = useState<{ trackId: string; state: 'searching' | LookupResult }>();
  const [editing, setEditing] = useState(false);
  const [karaoke, setKaraoke] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const online = settings?.lyricsOnline ?? false;

  // Nothing stored yet (or an old "not found" from LRCLIB): look it up automatically.
  const needsLookup =
    doc === null || (!!doc && !!doc.notFound && doc.source === 'lrclib' && !recentlyNotFound(doc));
  const autoLookup = online && needsLookup && lookup?.trackId !== track.id;
  const status: 'searching' | LookupResult | undefined =
    lookup?.trackId === track.id ? lookup.state : autoLookup ? 'searching' : undefined;

  useEffect(() => {
    if (!autoLookup) return;
    let cancelled = false;
    void lookupLyrics(track).then((state) => {
      if (!cancelled) setLookup({ trackId: track.id, state });
    });
    return () => {
      cancelled = true;
    };
    // `track` changes identity on every library update; its id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLookup, track.id]);

  /** "Search again" and friends: always asks LRCLIB, even after a recent miss. */
  const searchNow = async () => {
    setLookup({ trackId: track.id, state: 'searching' });
    const state = await lookupLyrics(track);
    setLookup({ trackId: track.id, state });
    if (state === 'error')
      toast({ tone: 'error', message: 'LRCLIB could not be reached. Try again later.' });
    else if (state === 'offline')
      toast({ tone: 'error', message: "You're offline, so lyrics can't be looked up." });
  };

  // Look up the next song too, so karaoke and the lyrics view keep going offline-ready.
  const nextTrack = queue[index + 1] ? byId.get(queue[index + 1]!.trackId) : undefined;
  useEffect(() => {
    if (!online || !nextTrack) return;
    const t = setTimeout(async () => {
      if (!(await db.lyrics.get(nextTrack.id))) void lookupLyrics(nextTrack);
    }, 3000);
    return () => clearTimeout(t);
  }, [online, nextTrack]);

  const { current } = useProgress(audio, track.duration);
  const time = current + offset;
  const active = lines.length ? lineIndexAt(lines, time) : -1;

  // Keep the current line in view unless the user is scrolling the lyrics.
  const scroller = useRef<HTMLDivElement>(null);
  const lastManualScroll = useRef(0);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  useEffect(() => {
    const box = scroller.current;
    if (!box || active < 0 || Date.now() - lastManualScroll.current < MANUAL_SCROLL_MS) return;
    const el = box.querySelector<HTMLElement>(`[data-line="${active}"]`);
    if (!el) return;
    box.scrollTo({
      top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2,
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [active, reducedMotion]);

  const menuItems = [
    ...(lines.length
      ? [{ label: 'Karaoke mode', icon: <Mic2 />, onSelect: () => setKaraoke(true) }]
      : []),
    {
      label: doc?.lrc || plain ? 'Edit lyrics' : 'Add lyrics',
      icon: <Pencil />,
      onSelect: () => setEditing(true),
    },
    { label: 'Import .lrc file', icon: <FileUp />, onSelect: () => fileInput.current?.click() },
    { label: 'Search LRCLIB again', icon: <RefreshCw />, onSelect: () => void searchNow() },
    ...(doc?.lrc || plain
      ? [
          {
            label: 'Remove lyrics',
            icon: <Trash2 />,
            danger: true,
            onSelect: () => void removeLyrics(track.id),
          },
        ]
      : []),
    {
      label: online ? 'Stop searching online' : 'Search online automatically',
      icon: <Search />,
      onSelect: () => void updateSettings({ lyricsOnline: !online }),
    },
  ];

  const hasLyrics = lines.length > 0 || !!plain;
  let body: React.ReactNode;
  if (doc === undefined) body = null;
  else if (status === 'searching' && !hasLyrics)
    body = (
      <p className="flex items-center gap-2 text-muted" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Looking for lyrics…
      </p>
    );
  else if (lines.length)
    body = (
      <ol className="space-y-3 py-[40%]">
        {lines.map((line, i) => (
          <li key={`${line.time}-${i}`} data-line={i}>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => seek(Math.max(0, line.time - offset))}
              aria-current={i === active ? 'true' : undefined}
              className={cn(
                'block w-full text-left text-2xl font-bold leading-snug transition-colors duration-300 md:text-3xl',
                i === active
                  ? 'text-fg'
                  : i < active
                    ? 'text-fg/35'
                    : 'text-fg/55 hover:text-fg/80',
              )}
            >
              {line.text || '♪'}
            </button>
          </li>
        ))}
      </ol>
    );
  else if (plain) body = <p className="whitespace-pre-line text-lg leading-relaxed">{plain}</p>;
  else if (doc?.instrumental)
    body = <p className="text-lg text-muted">This song is instrumental.</p>;
  else
    body = (
      <div className="space-y-3 text-muted">
        <p className="text-lg font-semibold text-fg">No lyrics for this song</p>
        <p className="text-sm">
          {status === 'offline'
            ? "You're offline, so lyrics can't be looked up right now."
            : status === 'error'
              ? 'LRCLIB could not be reached.'
              : online
                ? 'LRCLIB has no lyrics for it.'
                : 'Online search is off.'}{' '}
          Add them by pasting the text or importing an .lrc file.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" aria-hidden /> Add lyrics
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fileInput.current?.click()}
          >
            <FileUp className="h-4 w-4" aria-hidden /> Import .lrc
          </button>
          <button type="button" className="btn-secondary" onClick={() => void searchNow()}>
            <Search className="h-4 w-4" aria-hidden /> Search LRCLIB
          </button>
        </div>
      </div>
    );

  return (
    <section
      aria-label={`Lyrics for ${track.title}`}
      className={cn('flex min-h-0 flex-col', className)}
    >
      <div
        ref={scroller}
        className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto rounded-xl bg-surface/60 px-5 py-4"
        onWheel={() => (lastManualScroll.current = Date.now())}
        onTouchMove={() => (lastManualScroll.current = Date.now())}
      >
        {body}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">
          {doc?.source && hasLyrics
            ? SOURCE_LABEL[doc.source]
            : online
              ? 'Looks up lyrics on lrclib.net'
              : ''}
        </span>
        {lines.length > 0 && (
          <span className="flex items-center gap-1" role="group" aria-label="Lyrics timing">
            <button
              type="button"
              className="icon-btn h-7 w-7"
              onClick={() => void setLyricsOffset(track.id, (doc?.offsetMs ?? 0) - OFFSET_STEP_MS)}
              aria-label="Show lines later"
              title="Lines appear too early? Show them later"
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              className="w-14 tabular-nums hover:text-fg"
              onClick={() => void setLyricsOffset(track.id, 0)}
              title="Reset timing"
            >
              {offset === 0 ? 'In sync' : `${offset > 0 ? '+' : ''}${offset.toFixed(2)} s`}
            </button>
            <button
              type="button"
              className="icon-btn h-7 w-7"
              onClick={() => void setLyricsOffset(track.id, (doc?.offsetMs ?? 0) + OFFSET_STEP_MS)}
              aria-label="Show lines sooner"
              title="Lines appear too late? Show them sooner"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        )}
        {lines.length > 0 && (
          <button
            type="button"
            className="btn-secondary px-3 py-1 text-xs"
            onClick={() => setKaraoke(true)}
          >
            <Mic2 className="h-3.5 w-3.5" aria-hidden /> Karaoke
          </button>
        )}
        <Menu label="Lyrics options" items={menuItems} />
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".lrc,.txt,text/plain"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          const text = await file.text();
          if (!text.trim()) return toast({ tone: 'error', message: `${file.name} is empty.` });
          await saveLyrics(track.id, lyricsFromText(text), 'file');
          toast({ tone: 'success', message: `Lyrics added to ${track.title}.` });
        }}
      />
      <LyricsEditor
        key={`${track.id}-${editing}`}
        open={editing}
        track={track}
        initial={doc?.lrc ?? plain ?? ''}
        onClose={() => setEditing(false)}
      />
      {karaoke && lines.length > 0 && (
        <KaraokeOverlay
          track={track}
          lines={lines}
          offset={offset}
          onClose={() => setKaraoke(false)}
        />
      )}
    </section>
  );
}

/* ------------------------------- editor ------------------------------- */

function LyricsEditor({
  open,
  track,
  initial,
  onClose,
}: {
  open: boolean;
  track: Track;
  initial: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const id = useId();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Lyrics for ${track.title}`}
      description="Paste plain text, or LRC with [mm:ss.xx] timestamps for synced lyrics."
      className="max-w-xl"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              if (text.trim()) await saveLyrics(track.id, lyricsFromText(text), 'manual');
              else await removeLyrics(track.id);
              onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <label htmlFor={id} className="sr-only">
        Lyrics
      </label>
      <textarea
        id={id}
        className="input h-72 font-mono text-sm"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'[00:12.30] First line\n[00:17.80] Second line'}
      />
    </Dialog>
  );
}

/* ------------------------------- karaoke ------------------------------- */

/** How far (0–1) through `line` the song is, by its words if timed, else by the line. */
function lineProgress(
  line: LyricLine,
  next: LyricLine | undefined,
  time: number,
  duration: number,
) {
  const end = next?.time ?? Math.min(duration, line.time + 6);
  return Math.max(0, Math.min(1, (time - line.time) / Math.max(0.3, end - line.time)));
}

function Sung({ progress, children }: { progress: number; children: React.ReactNode }) {
  const pct = `${(progress * 100).toFixed(1)}%`;
  return (
    <span
      className="bg-clip-text text-transparent"
      style={
        {
          backgroundImage: `linear-gradient(to right, rgb(var(--accent)) ${pct}, rgb(255 255 255 / 0.45) ${pct})`,
          WebkitBackgroundClip: 'text',
        } as CSSProperties
      }
    >
      {children}
    </span>
  );
}

/**
 * Full-screen sing-along: the current line large, filling in as it's sung (word by
 * word when the LRC has word timings), with the lines around it. Space plays or
 * pauses, arrows seek, Esc closes.
 */
function KaraokeOverlay({
  track,
  lines,
  offset,
  onClose,
}: {
  track: Track;
  lines: LyricLine[];
  offset: number;
  onClose: () => void;
}) {
  const { audio, toggle, seek, isPlaying } = usePlayer();
  const { current, duration } = useProgress(audio, track.duration);
  const ref = useRef<HTMLDialogElement>(null);
  const playButton = useRef<HTMLButtonElement>(null);
  const time = current + offset;
  const i = lineIndexAt(lines, time);
  const line = lines[i];
  const next = lines[i + 1];

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
    // showModal focuses the first button (close); start on play/pause instead.
    playButton.current?.focus();
  }, []);

  const waiting = !line || !line.text;
  const countdown = waiting && next ? Math.ceil(next.time - time) : 0;

  return (
    <dialog
      ref={ref}
      aria-label={`Karaoke: ${track.title}`}
      onClose={onClose}
      onKeyUp={(e) => e.key === ' ' && e.preventDefault()}
      onKeyDown={(e) => {
        // Space always plays/pauses here, even with a button focused (it would click it).
        if (e.key === ' ') {
          e.preventDefault();
          if (!e.repeat) toggle();
        } else if (e.key === 'ArrowRight') seek(current + 5);
        else if (e.key === 'ArrowLeft') seek(Math.max(0, current - 5));
      }}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-gradient-to-b from-zinc-950 via-zinc-900 to-black p-0 text-white backdrop:bg-black"
    >
      <div className="flex h-full flex-col px-6 py-5 md:px-16">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{track.title}</p>
            <p className="truncate text-sm text-white/60">{track.artist}</p>
          </div>
          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
            onClick={() => ref.current?.close()}
            aria-label="Close karaoke"
          >
            <X className="h-6 w-6" aria-hidden />
          </button>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-6 text-center" aria-live="off">
          <p className="min-h-[1.5em] text-xl font-semibold text-white/35 md:text-2xl">
            {lines[i - 1]?.text ?? ''}
          </p>
          <p className="min-h-[1.3em] text-4xl font-extrabold leading-tight md:text-6xl">
            {waiting ? (
              <span className="text-white/60">
                {countdown > 0 && countdown <= 5 ? '•'.repeat(countdown) : '♪'}
              </span>
            ) : line.words?.length ? (
              line.words.map((w, k) => (
                <Sung
                  key={k}
                  progress={lineProgress(
                    { time: w.time, text: w.text },
                    line.words![k + 1] ?? next,
                    time,
                    duration,
                  )}
                >
                  {w.text}
                </Sung>
              ))
            ) : (
              <Sung progress={lineProgress(line, next, time, duration)}>{line.text}</Sung>
            )}
          </p>
          <p className="min-h-[1.5em] text-2xl font-bold text-white/55 md:text-3xl">
            {next?.text ?? ''}
          </p>
          <p className="min-h-[1.5em] text-xl font-semibold text-white/30 md:text-2xl">
            {lines[i + 2]?.text ?? ''}
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 text-sm text-white/60">
          <span className="w-12 text-right tabular-nums">{formatTime(current)}</span>
          <button
            type="button"
            ref={playButton}
            onClick={toggle}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="grid h-16 w-16 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105"
          >
            {isPlaying ? (
              <Pause className="h-7 w-7 fill-current" aria-hidden />
            ) : (
              <Play className="h-7 w-7 translate-x-[1px] fill-current" aria-hidden />
            )}
          </button>
          <span className="w-12 tabular-nums">{formatTime(duration)}</span>
        </div>
      </div>
    </dialog>
  );
}
