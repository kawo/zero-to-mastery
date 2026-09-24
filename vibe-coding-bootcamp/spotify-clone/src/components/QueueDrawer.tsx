import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, ListX, X } from 'lucide-react';
import { Artwork } from '@/components/Artwork';
import { EqBars } from '@/components/SongList';
import { SortableList } from '@/components/ui/Sortable';
import { useLibrary } from '@/hooks/useIndexedDb';
import { usePlayer } from '@/hooks/usePlayer';
import { formatTime, formatTotalDuration } from '@/lib/audio';
import { cn, pluralize } from '@/lib/utils';
import { useUi } from '@/state/contexts';
import type { QueueItem, Track } from '@/types';

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
          Queue
        </h2>
        <div className="flex items-center gap-1">
          {upcoming.length > 0 && (
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={clearQueue}>
              <ListX className="h-4 w-4" aria-hidden />
              Clear
            </button>
          )}
          <button
            type="button"
            className="icon-btn"
            onClick={() => setQueueOpen(false)}
            aria-label="Close queue"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {!current || !currentTrack ? (
          <div className="px-4 py-10 text-center text-sm text-muted">
            <p className="font-medium text-fg">Your queue is empty</p>
            <p className="mt-1">
              Add songs from{' '}
              <Link className="text-accent hover:underline" to="/songs">
                Songs
              </Link>{' '}
              or a{' '}
              <Link className="text-accent hover:underline" to="/playlists">
                playlist
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            <h3 className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Now playing
            </h3>
            <QueueRow item={current} track={currentTrack} active playing={isPlaying} />

            <h3 className="flex items-baseline justify-between px-2 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">
              <span>Next up</span>
              {upcoming.length > 0 && (
                <span className="normal-case tracking-normal">
                  {pluralize(upcoming.length, 'song')} · {formatTotalDuration(upcomingDuration)}
                </span>
              )}
            </h3>
            {upcoming.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">
                Nothing queued. Use “Add to queue” or “Play next” on any song.
              </p>
            ) : (
              <ol aria-label="Next up">
                <SortableList
                  items={upcoming}
                  getId={(it) => it.uid}
                  getLabel={(it) => byId.get(it.trackId)?.title ?? 'Song'}
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
                              aria-label={`Reorder ${track.title}`}
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
        aria-label="Queue"
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
        aria-label="Queue"
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
            aria-label={`Play ${track.title} now`}
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
        <p className="truncate text-xs text-muted">{track.artist}</p>
      </div>
      <span className="text-xs tabular-nums text-muted">{formatTime(track.duration)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="icon-btn h-8 w-8 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100"
          aria-label={`Remove ${track.title} from queue`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
