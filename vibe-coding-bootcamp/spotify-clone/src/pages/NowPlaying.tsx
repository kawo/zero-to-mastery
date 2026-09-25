import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Disc3, ListPlus, Play } from 'lucide-react';
import { Artwork } from '@/components/Artwork';
import { QueueToggle } from '@/components/PlayerBar';
import {
  CrossfadeControl,
  Timeline,
  TransportControls,
  VolumeControl,
} from '@/components/PlayerControls';
import { TopBar } from '@/components/TopBar';
import { useBlobUrl, useLibrary } from '@/hooks/useIndexedDb';
import { usePlayer } from '@/hooks/usePlayer';
import { dominantColor, hueFrom, hslToRgb, type Rgb } from '@/lib/audio';
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

export default function NowPlaying() {
  const { currentTrack, queue, index, playTracks } = usePlayer();
  const { tracks, byId } = useLibrary();
  const { addToPlaylist, setQueueOpen } = useUi();
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
        <TopBar title="Now Playing" actions={<QueueToggle />} />

        <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-12">
          <Artwork
            track={currentTrack}
            size="lg"
            alt={`Artwork for ${currentTrack.album}`}
            className="mx-auto max-w-sm shadow-2xl md:max-w-md"
          />

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

            <Timeline size="lg" />
            <TransportControls size="lg" />

            <VolumeControl className="justify-center md:justify-start" />
            <CrossfadeControl className="items-center md:items-start" />

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
