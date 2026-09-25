import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AudioLines, Disc3, Image as ImageIcon, ListPlus, MicVocal, Play } from 'lucide-react';
import { Artwork } from '@/components/Artwork';
import { LyricsView } from '@/components/Lyrics';
import { Visualizer } from '@/components/Visualizer';
import { QueueToggle } from '@/components/PlayerBar';
import { Timeline, TransportControls, VolumeControl } from '@/components/PlayerControls';
import { SoundButton } from '@/components/SoundPanel';
import { TopBar } from '@/components/TopBar';
import { useBlobUrl, useLibrary } from '@/hooks/useIndexedDb';
import { usePlayer } from '@/hooks/usePlayer';
import { dominantColor, hueFrom, hslToRgb, type Rgb } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { useUi } from '@/state/contexts';

/** Background tint from the artwork's dominant colour (or the placeholder hue). */
function useTint(blobId: string | undefined, seed: string): Rgb {
  const url = useBlobUrl(blobId);
  const [color, setColor] = useState<{ key: string; rgb: Rgb } | null>(null);
  useEffect(() => {
    if (!url || !blobId) return;
    let cancelled = false;
    void dominantColor(blobId, url).then((rgb) => {
      if (!cancelled && rgb) setColor({ key: blobId, rgb });
    });
    return () => {
      cancelled = true;
    };
  }, [url, blobId]);
  if (color && color.key === blobId) return color.rgb;
  return hslToRgb(hueFrom(seed), 0.55, 0.4);
}

type View = 'artwork' | 'lyrics' | 'visualizer';
const VIEW_KEY = 'tunebox-now-playing-view';
const VIEWS: { id: View; label: string; icon: typeof MicVocal }[] = [
  { id: 'artwork', label: 'Artwork', icon: ImageIcon },
  { id: 'lyrics', label: 'Lyrics', icon: MicVocal },
  { id: 'visualizer', label: 'Visualizer', icon: AudioLines },
];

/** What fills the left of Now Playing; remembered per browser. */
function useView() {
  const [view, setViewState] = useState<View>(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'lyrics' || v === 'visualizer') return v;
      // Earlier versions only had a lyrics on/off toggle.
      return localStorage.getItem('tunebox-lyrics-open') === '1' ? 'lyrics' : 'artwork';
    } catch {
      return 'artwork';
    }
  });
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* per-viewer convenience only */
    }
  };
  return [view, setView] as const;
}

export default function NowPlaying() {
  const { currentTrack, queue, index, playTracks } = usePlayer();
  const { tracks, byId } = useLibrary();
  const { addToPlaylist, setQueueOpen } = useUi();
  const [view, setView] = useView();
  const tint = useTint(
    currentTrack?.artworkBlobId,
    currentTrack?.hash ?? currentTrack?.id ?? 'none',
  );

  if (!currentTrack) {
    return (
      <>
        <TopBar title="Now Playing" />
        <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-elevated">
            <Disc3 className="h-9 w-9 text-muted" aria-hidden />
          </div>
          <h2 className="mt-5 text-xl font-bold">Nothing is playing</h2>
          <p className="mt-2 text-muted">Pick a song or playlist to start listening.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {tracks && tracks.length > 0 ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() =>
                  playTracks(
                    tracks.map((t) => t.id),
                    0,
                    { shuffle: true },
                  )
                }
              >
                <Play className="h-4 w-4 fill-current" aria-hidden />
                Shuffle my library
              </button>
            ) : (
              <Link to="/upload" className="btn-primary">
                Import songs
              </Link>
            )}
            <Link to="/songs" className="btn-secondary">
              Browse songs
            </Link>
          </div>
        </div>
      </>
    );
  }

  const upNext = queue
    .slice(index + 1, index + 4)
    .map((it) => byId.get(it.trackId))
    .filter((t) => !!t);
  const details = [currentTrack.album, currentTrack.year, currentTrack.genre]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="relative">
      {/* Tinted backdrop behind the page content */}
      <div
        className="pointer-events-none absolute -inset-x-8 -top-4 h-[28rem] opacity-60 transition-colors duration-700"
        style={{
          background: `linear-gradient(to bottom, rgb(${tint.r} ${tint.g} ${tint.b} / 0.55), transparent)`,
        }}
        aria-hidden
      />
      <div className="relative">
        <TopBar
          title="Now Playing"
          actions={
            <>
              <div
                role="group"
                aria-label="View"
                className="flex items-center rounded-full border border-border p-0.5"
              >
                {VIEWS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setView(id)}
                    aria-pressed={view === id}
                    title={label}
                    className={cn(
                      'grid h-8 w-8 place-items-center rounded-full transition-colors',
                      view === id ? 'bg-fg text-bg' : 'text-muted hover:text-fg',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                    <span className="sr-only">{label}</span>
                  </button>
                ))}
              </div>
              <QueueToggle />
            </>
          }
        />

        <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
          {view === 'lyrics' ? (
            <LyricsView track={currentTrack} className="h-[55vh] md:h-[32rem]" />
          ) : view === 'visualizer' ? (
            <Visualizer track={currentTrack} tint={tint} className="h-[45vh] md:h-[32rem]" />
          ) : (
            <Artwork
              track={currentTrack}
              size="lg"
              alt={`Artwork for ${currentTrack.album}`}
              className="mx-auto max-w-sm shadow-2xl md:max-w-md"
            />
          )}

          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  className="text-2xl font-extrabold leading-tight md:text-4xl"
                  aria-live="polite"
                >
                  {currentTrack.title}
                </h2>
                <p className="mt-1 text-lg text-fg/80">{currentTrack.artist}</p>
                {details && <p className="mt-1 text-sm text-muted">{details}</p>}
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => addToPlaylist([currentTrack.id])}
                aria-label={`Add ${currentTrack.title} to playlist`}
              >
                <ListPlus className="h-6 w-6" aria-hidden />
              </button>
            </div>

            <Timeline size="lg" waveform />
            <TransportControls size="lg" />

            <div className="flex flex-wrap items-center justify-center gap-3 md:justify-start">
              <VolumeControl />
              <SoundButton withLabel />
            </div>

            <section aria-labelledby="up-next-heading" className="rounded-xl bg-surface/70 p-4">
              <div className="flex items-center justify-between">
                <h3
                  id="up-next-heading"
                  className="text-sm font-semibold uppercase tracking-wider text-muted"
                >
                  Up next
                </h3>
                <button
                  type="button"
                  className="text-sm font-semibold text-accent hover:underline"
                  onClick={() => setQueueOpen(true)}
                >
                  Open queue
                </button>
              </div>
              {upNext.length ? (
                <ol className="mt-3 space-y-2">
                  {upNext.map((t, i) => (
                    <li key={`${t.id}-${i}`} className="flex items-center gap-3">
                      <Artwork track={t} size="xs" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{t.title}</span>
                        <span className="block truncate text-xs text-muted">{t.artist}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-sm text-muted">Nothing queued after this song.</p>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
