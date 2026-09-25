import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, ListX, X } from 'lucide-react';
import { Artwork } from '@/components/Artwork';
import { EqBars } from '@/components/SongList';
import { SortableList } from '@/components/ui/Sortable';
import { useLibrary } from '@/hooks/useIndexedDb';
import { usePlayer } from '@/hooks/usePlayer';
import { formatTime } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { useUi } from '@/state/contexts';
import type { QueueItem, Track } from '@/types';
import { artistName, formatTotalDuration, rich, useI18n } from '@/i18n';

/**
 * Collapsible queue: the current track plus drag-to-reorder "Next up".
 * `variant="panel"` sits beside the content (desktop); `"sheet"` overlays it (mobile).
 */
export function QueueDrawer({ variant }: { variant: 'panel' | 'sheet' }) {
  const { queueOpen, setQueueOpen } = useUi();
  const {
    queue,
    index,
    current,
    currentTrack,
    isPlaying,
    jumpTo,
    removeFromQueue,
    moveInQueue,
    clearQueue,
  } = usePlayer();
  const { byId } = useLibrary();
  const { t } = useI18n();
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Move focus into the sheet when it opens; Escape closes it.
  useEffect(() => {
    if (!queueOpen || variant !== 'sheet') return;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQueueOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [queueOpen, variant, setQueueOpen]);

  if (!queueOpen) return null;

  const upcoming = queue.slice(index + 1);
  const offset = index + 1;
  const upcomingDuration = upcoming.reduce((s, it) => s + (byId.get(it.trackId)?.duration ?? 0), 0);

  const body = (
    <>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-bold focus-visible:ring-0">
          {t('queue.title')}
        </h2>
        <div className="flex items-center gap-1">
          {upcoming.length > 0 && (
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={clearQueue}>
              <ListX className="h-4 w-4" aria-hidden />
              {t('queue.clear')}
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => setQueueOpen(false)}
            aria-label={t('queue.close')}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!current || !currentTrack ? (
          <div className="px-4 py-10 text-center text-sm text-muted">
            <p className="font-medium text-fg">{t('queue.empty')}</p>
            <p className="mt-1">
              {rich(t('queue.emptyHint'), {
                songs: (c) => (
                  <Link className="text-accent underline" to="/songs">
                    {c}
                  </Link>
                ),
                playlists: (c) => (
                  <Link className="text-accent underline" to="/playlists">
                    {c}
                  </Link>
                ),
              })}
            </p>
          </div>
        ) : (
          <>
            <h3 className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">
              {t('queue.nowPlaying')}
            </h3>
            <QueueRow item={current} track={currentTrack} active playing={isPlaying} />

            <h3 className="flex items-baseline justify-between px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">
              <span>{t('queue.nextUp')}</span>
              {upcoming.length > 0 && (
                <span className="normal-case tracking-normal">
                  {t('common.songs', { count: upcoming.length })} ·{' '}
                  {formatTotalDuration(upcomingDuration)}
                </span>
              )}
            </h3>
            {upcoming.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">{t('queue.nothingQueued')}</p>
            ) : (
              <ol aria-label={t('queue.nextUp')}>
                <SortableList
                  items={upcoming}
                  getId={(it) => it.uid}
                  getLabel={(it) => byId.get(it.trackId)?.title ?? t('common.song')}
                  onReorder={(from, to) => moveInQueue(from + offset, to + offset)}
                  renderItem={(item, i, s) => {
                    const track = byId.get(item.trackId);
                    if (!track) return null;
                    return (
                      <li
                        ref={s.setNodeRef}
                        style={s.style}
                        key={item.uid}
                        className={cn(s.isDragging && 'rounded-md bg-elevated shadow-xl')}
                      >
                        <QueueRow
                          item={item}
                          track={track}
                          onPlay={() => jumpTo(i + offset)}
                          onRemove={() => removeFromQueue(item.uid)}
                          handle={
                            <button
                              type="button"
                              ref={s.setHandleRef}
                              {...s.handleProps}
                              {...s.handleListeners}
                              aria-label={t('common.reorder', { name: track.title })}
                              className="grid h-8 w-6 cursor-grab touch-none place-items-center rounded text-muted hover:text-fg active:cursor-grabbing"
                            >
                              <GripVertical className="h-4 w-4" aria-hidden />
                            </button>
                          }
                        />
                      </li>
                    );
                  }}
                />
              </ol>
            )}
          </>
        )}
      </div>
    </>
  );

  if (variant === 'panel') {
    return (
      <aside
        id="queue-panel"
        aria-label={t('queue.title')}
        className="flex w-80 shrink-0 flex-col border-l border-border bg-surface xl:w-96"
      >
        {body}
      </aside>
    );
  }
  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => setQueueOpen(false)}
        aria-hidden
      />
      <section
        id="queue-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('queue.title')}
        className="pb-safe absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl bg-surface shadow-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted/40" aria-hidden />
        {body}
      </section>
    </div>
  );
}

interface QueueRowProps {
  item: QueueItem;
  track: Track;
  active?: boolean;
  playing?: boolean;
  onPlay?: () => void;
  onRemove?: () => void;
  handle?: React.ReactNode;
}

function QueueRow({ track, active, playing, onPlay, onRemove, handle }: QueueRowProps) {
  const { t } = useI18n();
  return (
    <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated/70">
      {handle}
      <Artwork track={track} size="xs" />
      <div className="min-w-0 flex-1">
        {onPlay ? (
          <button
            type="button"
            onClick={onPlay}
            className="block max-w-full truncate text-left text-sm font-medium hover:underline"
            aria-label={t('queue.playNow', { name: track.title })}
          >
            {track.title}
          </button>
        ) : (
          <p
            className={cn(
              'flex items-center gap-2 truncate text-sm font-medium',
              active && 'text-accent',
            )}
          >
            {playing && <EqBars />}
            <span className="truncate">{track.title}</span>
          </p>
        )}
        <p className="truncate text-xs text-muted">{artistName(track.artist)}</p>
      </div>
      <span className="text-xs tabular-nums text-muted">{formatTime(track.duration)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="icon-btn h-8 w-8 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
          aria-label={t('queue.remove', { name: track.title })}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
