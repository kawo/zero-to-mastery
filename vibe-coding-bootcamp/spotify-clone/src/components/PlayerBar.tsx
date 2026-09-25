import { Link, useLocation } from 'react-router-dom';
import { ListMusic, ListPlus, Maximize2 } from 'lucide-react';
import { Artwork } from '@/components/Artwork';
import {
  NextButton,
  PlayPauseButton,
  Timeline,
  TransportControls,
  VolumeControl,
} from '@/components/PlayerControls';
import { SoundButton } from '@/components/SoundPanel';
import { usePlayer } from '@/hooks/usePlayer';
import { useProgress } from '@/hooks/useProgress';
import { cn } from '@/lib/utils';
import { useUi } from '@/state/contexts';
import { artistName, useI18n } from '@/i18n';

/** Button that shows/hides the queue panel; state is exposed via aria-expanded. */
export function QueueToggle({ className }: { className?: string }) {
  const { queueOpen, toggleQueue } = useUi();
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={toggleQueue}
      aria-expanded={queueOpen}
      aria-controls="queue-panel"
      aria-keyshortcuts="Q"
      title={queueOpen ? t('player.hideQueue') : t('player.showQueue')}
      className={cn('icon-btn relative', queueOpen && 'text-accent hover:text-accent', className)}
    >
      <ListMusic className="h-5 w-5" aria-hidden />
      <span className="sr-only">{t('player.queue')}</span>
      {queueOpen && (
        <span className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" aria-hidden />
      )}
    </button>
  );
}

/**
 * Persistent player. Desktop: full-width bar at the bottom of the shell.
 * Mobile: compact mini-player above the tab bar (tap to open Now Playing).
 */
export function PlayerBar() {
  const { currentTrack, audio } = usePlayer();
  const { t } = useI18n();
  const { addToPlaylist } = useUi();
  const { pathname } = useLocation();
  const progress = useProgress(audio, currentTrack?.duration ?? 0);
  const onNowPlaying = pathname === '/now-playing';

  return (
    <section aria-label={t('player.region')} className="border-t border-border bg-surface">
      {/* Mobile mini-player (hidden on the Now Playing page, which has full controls). */}
      {!onNowPlaying && currentTrack && (
        <div className="relative md:hidden">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-muted/20" aria-hidden>
            <div
              className="h-full bg-accent"
              style={{
                width: `${progress.duration ? (progress.current / progress.duration) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="flex items-center gap-3 px-3 py-2">
            <Link
              to="/now-playing"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-md"
              aria-label={t('player.nowPlayingOpen', {
                title: currentTrack.title,
                artist: artistName(currentTrack.artist),
              })}
            >
              <Artwork track={currentTrack} size="xs" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{currentTrack.title}</span>
                <span className="block truncate text-xs text-muted">
                  {artistName(currentTrack.artist)}
                </span>
              </span>
            </Link>
            <PlayPauseButton size="sm" />
            <NextButton />
          </div>
        </div>
      )}

      {/* Desktop bar */}
      <div className="hidden h-[5.5rem] grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)] items-center gap-4 px-4 md:grid">
        <div className="flex min-w-0 items-center gap-3">
          {currentTrack ? (
            <>
              <Link
                to="/now-playing"
                aria-label={t('player.openNowPlaying')}
                className="rounded-md"
              >
                <Artwork track={currentTrack} size="sm" />
              </Link>
              <div className="min-w-0">
                <Link
                  to="/now-playing"
                  className="block truncate text-sm font-semibold hover:underline"
                >
                  {currentTrack.title}
                </Link>
                <p className="truncate text-xs text-muted">{artistName(currentTrack.artist)}</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => addToPlaylist([currentTrack.id])}
                aria-label={t('player.addToPlaylist', { name: currentTrack.title })}
              >
                <ListPlus className="h-5 w-5" aria-hidden />
              </button>
            </>
          ) : (
            <p className="text-sm text-muted">{t('player.nothingPlaying')}</p>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <TransportControls />
          <Timeline className="max-w-xl" />
        </div>
        <div className="flex items-center justify-end gap-1">
          {!onNowPlaying && (
            <Link to="/now-playing" className="icon-btn" aria-label={t('player.openNowPlaying')}>
              <Maximize2 className="h-4 w-4" aria-hidden />
            </Link>
          )}
          <SoundButton />
          <QueueToggle />
          <VolumeControl className="hidden lg:flex" />
        </div>
      </div>
    </section>
  );
}
