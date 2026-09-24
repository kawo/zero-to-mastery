import { memo, useRef, type CSSProperties, type ReactNode } from 'react';
import { AlertTriangle, Clock, GripVertical, Play } from 'lucide-react';
import { Artwork } from '@/components/Artwork';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { SortableList, type SortableRenderProps } from '@/components/ui/Sortable';
import { usePlayer } from '@/hooks/usePlayer';
import { formatTime } from '@/lib/audio';
import { cn } from '@/lib/utils';
import type { Track } from '@/types';

export interface SongListProps {
  tracks: Track[];
  /** Accessible name of the list, e.g. "Songs" or "Tracks in Road trip". */
  label: string;
  /** Play from `index` (index into `tracks`). */
  onPlay: (index: number) => void;
  rowActions: (track: Track, index: number) => MenuItem[];
  selection?: { selected: ReadonlySet<string>; onChange: (next: Set<string>) => void };
  /** Enables drag-and-drop reordering. */
  reorder?: { onReorder: (from: number, to: number) => void; disabled?: boolean };
  showAlbum?: boolean;
}

const GRID =
  'grid items-center gap-3 grid-cols-[auto_minmax(0,1fr)_auto_auto] md:grid-cols-[auto_minmax(0,3fr)_minmax(0,2fr)_auto_auto]';

export function SongList({
  tracks,
  label,
  onPlay,
  rowActions,
  selection,
  reorder,
  showAlbum = true,
}: SongListProps) {
  const { currentTrack, isPlaying } = usePlayer();
  const anchor = useRef<number | null>(null);

  const toggle = (index: number, shift: boolean) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    const id = tracks[index]!.id;
    if (shift && anchor.current !== null) {
      // Shift-click selects the range from the last clicked row.
      const [a, b] = [anchor.current, index].sort((x, y) => x - y) as [number, number];
      const on = !selection.selected.has(id);
      for (let i = a; i <= b; i++) {
        if (on) next.add(tracks[i]!.id);
        else next.delete(tracks[i]!.id);
      }
    } else if (next.has(id)) next.delete(id);
    else next.add(id);
    anchor.current = index;
    selection.onChange(next);
  };

  const allSelected =
    !!selection && tracks.length > 0 && tracks.every((t) => selection.selected.has(t.id));

  const row = (track: Track, index: number, sortable?: SortableRenderProps) => (
    <SongRow
      key={track.id}
      track={track}
      index={index}
      isCurrent={currentTrack?.id === track.id}
      isPlaying={isPlaying}
      showAlbum={showAlbum}
      selected={selection?.selected.has(track.id)}
      onToggle={selection ? toggle : undefined}
      onPlay={onPlay}
      actions={rowActions(track, index)}
      sortable={sortable}
    />
  );

  return (
    <div>
      <div
        className={cn(
          GRID,
          'border-b border-border px-2 py-2 text-xs font-medium uppercase tracking-wider text-muted',
        )}
        aria-hidden={!selection}
      >
        <div className="flex items-center gap-2">
          {reorder && <span className="w-6" />}
          {selection ? (
            <input
              type="checkbox"
              className="h-4 w-4 accent-[rgb(var(--accent))]"
              checked={allSelected}
              aria-label={allSelected ? 'Deselect all songs' : 'Select all songs'}
              onChange={() =>
                selection.onChange(allSelected ? new Set() : new Set(tracks.map((t) => t.id)))
              }
            />
          ) : null}
          <span className="w-10" />
        </div>
        <span>Title</span>
        <span className="hidden md:block">{showAlbum ? 'Album' : ''}</span>
        <Clock className="h-4 w-4 justify-self-end" aria-label="Duration" />
        <span className="w-10" />
      </div>
      <ul aria-label={label} className="mt-1">
        {reorder ? (
          <SortableList
            items={tracks}
            getId={(t) => t.id}
            getLabel={(t) => t.title}
            onReorder={reorder.onReorder}
            disabled={reorder.disabled}
            renderItem={(t, i, s) => row(t, i, s)}
          />
        ) : (
          tracks.map((t, i) => row(t, i))
        )}
      </ul>
    </div>
  );
}

interface SongRowProps {
  track: Track;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  showAlbum: boolean;
  selected?: boolean;
  onToggle?: (index: number, shift: boolean) => void;
  onPlay: (index: number) => void;
  actions: MenuItem[];
  sortable?: SortableRenderProps;
}

const SongRow = memo(function SongRow({
  track,
  index,
  isCurrent,
  isPlaying,
  showAlbum,
  selected,
  onToggle,
  onPlay,
  actions,
  sortable,
}: SongRowProps) {
  const style: CSSProperties | undefined = sortable?.style;
  const play = () => onPlay(index);
  return (
    <li
      ref={sortable?.setNodeRef}
      style={style}
      aria-current={isCurrent ? 'true' : undefined}
      onDoubleClick={play}
      className={cn(
        GRID,
        'group rounded-md px-2 py-1.5 hover:bg-elevated/70',
        !sortable && 'cv-auto',
        selected && 'bg-accent/10 hover:bg-accent/15',
        sortable?.isDragging && 'bg-elevated shadow-xl ring-1 ring-border',
        track.audioMissing && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        {sortable && (
          <button
            type="button"
            ref={sortable.setHandleRef}
            {...sortable.handleProps}
            {...sortable.handleListeners}
            aria-label={`Reorder ${track.title}`}
            className="-ml-1 grid h-8 w-6 cursor-grab touch-none place-items-center rounded text-muted hover:text-fg active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" aria-hidden />
          </button>
        )}
        {onToggle && (
          <input
            type="checkbox"
            className="h-4 w-4 accent-[rgb(var(--accent))]"
            checked={!!selected}
            aria-label={`Select ${track.title}`}
            onChange={(e) => onToggle(index, (e.nativeEvent as MouseEvent).shiftKey)}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={play}
          className="relative h-10 w-10 shrink-0 overflow-hidden rounded"
        >
          <Artwork track={track} size="xs" />
          <span
            className={cn(
              'absolute inset-0 grid place-items-center bg-black/50 text-white',
              isCurrent && isPlaying ? 'grid' : 'hidden group-hover:grid',
            )}
          >
            {isCurrent && isPlaying ? <EqBars /> : <Play className="h-4 w-4 fill-current" />}
          </span>
        </button>
      </div>

      <div className="min-w-0">
        <button
          type="button"
          onClick={play}
          className={cn(
            'block max-w-full truncate text-left font-medium hover:underline',
            isCurrent && 'text-accent',
          )}
          aria-label={`Play ${track.title} by ${track.artist}${track.audioMissing ? ' (audio not on this device)' : ''}`}
        >
          {track.title}
        </button>
        <p className="flex items-center gap-1 truncate text-sm text-muted">
          {track.audioMissing && (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-danger" aria-hidden>
              <title>Audio not on this device. Import the file to relink.</title>
            </AlertTriangle>
          )}
          <span className="truncate">{track.artist}</span>
          {showAlbum && <span className="truncate md:hidden"> · {track.album}</span>}
        </p>
      </div>

      <p className="hidden truncate text-sm text-muted md:block">{showAlbum ? track.album : ''}</p>
      <p className="text-right text-sm tabular-nums text-muted">{formatTime(track.duration)}</p>
      <Menu
        label={`More options for ${track.title}`}
        items={actions}
        className="opacity-100 md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100 md:aria-expanded:opacity-100"
      />
    </li>
  );
});

/** Animated equalizer shown on the playing row (static under reduced motion). */
export function EqBars({ className }: { className?: string }): ReactNode {
  return (
    <span className={cn('flex h-3.5 items-end gap-[2px]', className)} aria-hidden>
      {[0, 200, 400].map((d) => (
        <span
          key={d}
          className="h-full w-[3px] origin-bottom animate-eq rounded-sm bg-accent"
          style={{ animationDelay: `${d}ms` }}
        />
      ))}
    </span>
  );
}
