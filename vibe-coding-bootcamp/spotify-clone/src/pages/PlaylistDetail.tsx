import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { FileDown, ListMinus, Pencil, Plus, Shuffle, Trash2 } from 'lucide-react';
import { Artwork, ArtworkMosaic } from '@/components/Artwork';
import { ListPlayButton } from '@/components/ListPlayButton';
import { PlaylistNameDialog } from '@/components/PlaylistNameDialog';
import { SearchBar } from '@/components/SearchBar';
import { SelectionBar } from '@/components/SelectionBar';
import { SongList } from '@/components/SongList';
import { TopBar } from '@/components/TopBar';
import { Dialog } from '@/components/ui/Dialog';
import { Menu } from '@/components/ui/Menu';
import {
  addToPlaylist,
  deletePlaylist,
  removeFromPlaylist,
  renamePlaylist,
  setPlaylistOrder,
} from '@/db/library';
import { describeDbError } from '@/db/indexedDb';
import { useLibrary, usePlaylist, useTracksByIds } from '@/hooks/useIndexedDb';
import { usePlayer } from '@/hooks/usePlayer';
import { useTrackActions } from '@/hooks/useTrackActions';
import { formatTime, formatTotalDuration } from '@/lib/audio';
import { exportPlaylist, type PlaylistFormat } from '@/lib/playlistFiles';
import { cn, downloadBlob, moveItem, normalize, pluralize } from '@/lib/utils';
import { useToast } from '@/state/contexts';
import type { Playlist, Track } from '@/types';

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const playlist = usePlaylist(id);

  if (playlist === undefined) {
    return (
      <p className="py-10 text-center text-muted" role="status">
        Loading playlist…
      </p>
    );
  }
  if (playlist === null) {
    return (
      <>
        <TopBar title="Playlist not found" />
        <p className="text-muted">It may have been deleted.</p>
        <Link to="/playlists" className="btn-secondary mt-4">
          Back to playlists
        </Link>
      </>
    );
  }
  return <PlaylistView playlist={playlist} />;
}

function PlaylistView({ playlist }: { playlist: Playlist }) {
  const { playTracks, shuffle, toggleShuffle } = usePlayer();
  const { menuItems } = useTrackActions();
  const toast = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'rename' | 'delete' | 'add' | null>(null);

  // Optimistic order while the reorder is written, keyed to the version it was based on.
  const [optimistic, setOptimistic] = useState<{ base: string[]; ids: string[] } | null>(null);
  const orderedIds =
    optimistic && optimistic.base === playlist.trackIds ? optimistic.ids : playlist.trackIds;
  const tracks = useTracksByIds(orderedIds);

  const needle = normalize(deferredQuery.trim());
  const shown = useMemo(
    () =>
      needle
        ? tracks.filter((t) => normalize(`${t.title} ${t.artist} ${t.album}`).includes(needle))
        : tracks,
    [tracks, needle],
  );
  const total = tracks.reduce((s, t) => s + t.duration, 0);
  const selectedIds = shown.filter((t) => selected.has(t.id)).map((t) => t.id);

  const safely = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      if (success) toast({ tone: 'success', message: success });
    } catch (err) {
      toast({ tone: 'error', message: describeDbError(err) });
    }
  };

  const reorder = (from: number, to: number) => {
    const ids = moveItem(
      tracks.map((t) => t.id),
      from,
      to,
    );
    setOptimistic({ base: playlist.trackIds, ids });
    void safely(() => setPlaylistOrder(playlist.id, ids));
  };

  const exportAs = (format: PlaylistFormat) => {
    const { blob, fileName } = exportPlaylist(playlist, tracks, format);
    downloadBlob(blob, fileName);
  };

  const remove = (ids: string[]) => {
    setSelected((s) => new Set([...s].filter((x) => !ids.includes(x))));
    void safely(
      () => removeFromPlaylist(playlist.id, ids),
      `Removed ${pluralize(ids.length, 'song')} from ${playlist.name}.`,
    );
  };

  return (
    <>
      <TopBar
        title={playlist.name}
        actions={
          <Menu
            label={`More options for ${playlist.name}`}
            items={[
              { label: 'Add songs', icon: <Plus />, onSelect: () => setDialog('add') },
              { label: 'Rename', icon: <Pencil />, onSelect: () => setDialog('rename') },
              {
                label: 'Export as M3U',
                icon: <FileDown />,
                disabled: !tracks.length,
                onSelect: () => exportAs('m3u'),
              },
              {
                label: 'Export as JSON',
                icon: <FileDown />,
                disabled: !tracks.length,
                onSelect: () => exportAs('json'),
              },
              {
                label: 'Delete playlist',
                icon: <Trash2 />,
                danger: true,
                onSelect: () => setDialog('delete'),
              },
            ]}
          />
        }
      />

      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end">
        <ArtworkMosaic tracks={tracks} className="w-40 shrink-0 shadow-2xl sm:w-48" />
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">Playlist</p>
          <p className="text-sm text-muted">
            {pluralize(tracks.length, 'song')}
            {total > 0 && ` · ${formatTotalDuration(total)}`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ListPlayButton trackIds={tracks.map((t) => t.id)} label={`Play ${playlist.name}`} />
            <button
              type="button"
              className={cn('btn-secondary', shuffle && 'border-accent text-accent')}
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              title={shuffle ? 'Shuffle on' : 'Shuffle off'}
            >
              <Shuffle className="h-4 w-4" aria-hidden />
              Shuffle
            </button>
            <button type="button" className="btn-secondary" onClick={() => setDialog('add')}>
              <Plus className="h-4 w-4" aria-hidden />
              Add songs
            </button>
          </div>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <p className="font-semibold">This playlist is empty</p>
          <p className="mt-1 text-sm text-muted">
            Add songs here, or from the Songs page with “Add to playlist”.
          </p>
          <button type="button" className="btn-primary mt-4" onClick={() => setDialog('add')}>
            <Plus className="h-4 w-4" aria-hidden />
            Add songs
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder="Find in playlist"
              label="Find in playlist"
              className="w-full sm:w-72"
              hotkey
            />
            <p className="text-xs text-muted">
              {needle
                ? 'Clear the search to reorder songs.'
                : 'Drag the handle, or focus it and press Space, to reorder.'}
            </p>
          </div>

          <SelectionBar
            ids={selectedIds}
            onClear={() => setSelected(new Set())}
            extra={
              <button
                type="button"
                className="btn-ghost px-3 py-1.5"
                onClick={() => remove(selectedIds)}
              >
                <ListMinus className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Remove</span>
                <span className="sr-only sm:hidden">Remove from playlist</span>
              </button>
            }
          />

          {shown.length === 0 ? (
            <p className="py-10 text-center text-muted">
              No songs in this playlist match “{query}”.
            </p>
          ) : (
            <SongList
              tracks={shown}
              label={`Songs in ${playlist.name}`}
              onPlay={(i) =>
                playTracks(
                  shown.map((t) => t.id),
                  i,
                )
              }
              selection={{ selected, onChange: setSelected }}
              reorder={{ onReorder: reorder, disabled: !!needle }}
              rowActions={(t) => [
                ...menuItems([t.id]),
                {
                  label: 'Remove from playlist',
                  icon: <ListMinus />,
                  onSelect: () => remove([t.id]),
                },
              ]}
            />
          )}
        </>
      )}

      <PlaylistNameDialog
        key={dialog === 'rename' ? 'rename-open' : 'rename-closed'}
        open={dialog === 'rename'}
        mode="rename"
        initialName={playlist.name}
        onClose={() => setDialog(null)}
        onSubmit={async (name) => {
          await safely(() => renamePlaylist(playlist.id, name));
          setDialog(null);
        }}
      />

      <Dialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title={`Delete “${playlist.name}”?`}
        description="The songs stay in your library. This can't be undone."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDialog(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={async () => {
                setDialog(null);
                navigate('/playlists');
                await safely(() => deletePlaylist(playlist.id), `Deleted ${playlist.name}.`);
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">{pluralize(tracks.length, 'song')} in this playlist.</p>
      </Dialog>

      <AddSongsDialog
        open={dialog === 'add'}
        playlist={playlist}
        onClose={() => setDialog(null)}
        onAdd={async (ids) => {
          await safely(
            () => addToPlaylist(playlist.id, ids),
            `Added ${pluralize(ids.length, 'song')}.`,
          );
          setDialog(null);
        }}
      />
    </>
  );
}

/** Pick library songs that aren't in the playlist yet. */
function AddSongsDialog({
  open,
  playlist,
  onClose,
  onAdd,
}: {
  open: boolean;
  playlist: Playlist;
  onClose: () => void;
  onAdd: (ids: string[]) => void | Promise<void>;
}) {
  const { tracks } = useLibrary();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const inPlaylist = useMemo(() => new Set(playlist.trackIds), [playlist.trackIds]);
  const needle = normalize(query.trim());
  const candidates = useMemo(
    () =>
      (tracks ?? [])
        .filter((t) => !inPlaylist.has(t.id))
        .filter((t) => !needle || normalize(`${t.title} ${t.artist} ${t.album}`).includes(needle))
        .sort((a, b) => a.title.localeCompare(b.title)),
    [tracks, inPlaylist, needle],
  );

  const close = () => {
    setQuery('');
    setPicked(new Set());
    onClose();
  };

  const toggle = (t: Track) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(t.id)) n.delete(t.id);
      else n.add(t.id);
      return n;
    });

  return (
    <Dialog
      open={open}
      onClose={close}
      title={`Add songs to ${playlist.name}`}
      className="w-[min(94vw,36rem)]"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={picked.size === 0}
            onClick={async () => {
              // Picks can be hidden by the current search; add them all, alphabetically.
              const ids = (tracks ?? [])
                .filter((t) => picked.has(t.id))
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((t) => t.id);
              await onAdd(ids);
              setPicked(new Set());
              setQuery('');
            }}
          >
            Add {picked.size || ''}
          </button>
        </>
      }
    >
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder="Search your library"
        label="Search your library"
      />
      <ul className="mt-3 space-y-0.5" aria-label="Songs you can add">
        {candidates.map((t) => (
          <li key={t.id}>
            <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-elevated">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[rgb(var(--accent))]"
                checked={picked.has(t.id)}
                onChange={() => toggle(t)}
              />
              <Artwork track={t} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{t.title}</span>
                <span className="block truncate text-xs text-muted">{t.artist}</span>
              </span>
              <span className="text-xs tabular-nums text-muted">{formatTime(t.duration)}</span>
            </label>
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="py-8 text-center text-sm text-muted">
            {tracks?.length
              ? needle
                ? 'No songs match.'
                : 'Every song in your library is already here.'
              : 'Your library is empty.'}
          </li>
        )}
      </ul>
    </Dialog>
  );
}
