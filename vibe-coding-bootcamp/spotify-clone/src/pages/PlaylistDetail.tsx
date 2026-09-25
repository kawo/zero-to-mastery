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
import { formatTime } from '@/lib/audio';
import { exportPlaylist, type PlaylistFormat } from '@/lib/playlistFiles';
import { cn, downloadBlob, moveItem, normalize } from '@/lib/utils';
import { useToast } from '@/state/contexts';
import type { Playlist, Track } from '@/types';
import { artistName, formatTotalDuration, useI18n } from '@/i18n';

export default function PlaylistDetail() {
  const { id } = useParams<{ id: string }>();
  const playlist = usePlaylist(id);
  const { t } = useI18n();

  if (playlist === undefined) {
    return (
      <p className="py-10 text-center text-muted" role="status">
        {t('playlist.loading')}
      </p>
    );
  }
  if (playlist === null) {
    return (
      <>
        <TopBar title={t('playlist.notFound')} />
        <p className="text-muted">{t('playlist.maybeDeleted')}</p>
        <Link to="/playlists" className="btn-secondary mt-4">
          {t('playlist.back')}
        </Link>
      </>
    );
  }
  return <PlaylistView playlist={playlist} />;
}

function PlaylistView({ playlist }: { playlist: Playlist }) {
  const { playTracks, shuffle, toggleShuffle } = usePlayer();
  const { t } = useI18n();
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
      t('playlist.removed', { count: ids.length, name: playlist.name }),
    );
  };

  return (
    <>
      <TopBar
        title={playlist.name}
        actions={
          <Menu
            label={t('common.moreOptions', { name: playlist.name })}
            items={[
              { label: t('playlist.addSongs'), icon: <Plus />, onSelect: () => setDialog('add') },
              { label: t('common.rename'), icon: <Pencil />, onSelect: () => setDialog('rename') },
              {
                label: t('playlist.exportM3u'),
                icon: <FileDown />,
                disabled: !tracks.length,
                onSelect: () => exportAs('m3u'),
              },
              {
                label: t('playlist.exportJson'),
                icon: <FileDown />,
                disabled: !tracks.length,
                onSelect: () => exportAs('json'),
              },
              {
                label: t('playlist.deletePlaylist'),
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
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">
            {t('playlist.label')}
          </p>
          <p className="text-sm text-muted">
            {t('common.songs', { count: tracks.length })}
            {total > 0 && ` · ${formatTotalDuration(total)}`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <ListPlayButton
              trackIds={tracks.map((t) => t.id)}
              label={t('common.playItem', { name: playlist.name })}
            />
            <button
              type="button"
              className={cn('btn-secondary', shuffle && 'border-accent text-accent')}
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              title={shuffle ? t('player.shuffleOn') : t('player.shuffleOff')}
            >
              <Shuffle className="h-4 w-4" aria-hidden />
              {t('common.shuffle')}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setDialog('add')}>
              <Plus className="h-4 w-4" aria-hidden />
              {t('playlist.addSongs')}
            </button>
          </div>
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <p className="font-semibold">{t('playlist.empty')}</p>
          <p className="mt-1 text-sm text-muted">{t('playlist.emptyHelp')}</p>
          <button type="button" className="btn-primary mt-4" onClick={() => setDialog('add')}>
            <Plus className="h-4 w-4" aria-hidden />
            {t('playlist.addSongs')}
          </button>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <SearchBar
              value={query}
              onChange={setQuery}
              placeholder={t('playlist.find')}
              label={t('playlist.find')}
              className="w-full sm:w-72"
              hotkey
            />
            <p className="text-xs text-muted">
              {needle ? t('playlist.reorderBlocked') : t('playlist.reorderHelp')}
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
                <span className="hidden sm:inline">{t('playlist.remove')}</span>
                <span className="sr-only sm:hidden">{t('playlist.removeFromPlaylist')}</span>
              </button>
            }
          />

          {shown.length === 0 ? (
            <p className="py-10 text-center text-muted">{t('playlist.noMatch', { query })}</p>
          ) : (
            <SongList
              tracks={shown}
              label={t('playlist.songsIn', { name: playlist.name })}
              onPlay={(i) =>
                playTracks(
                  shown.map((t) => t.id),
                  i,
                )
              }
              selection={{ selected, onChange: setSelected }}
              reorder={{ onReorder: reorder, disabled: !!needle }}
              rowActions={(track) => [
                ...menuItems([track.id]),
                {
                  label: t('playlist.removeFromPlaylist'),
                  icon: <ListMinus />,
                  onSelect: () => remove([track.id]),
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
        title={t('playlists.confirmDelete', { name: playlist.name })}
        description={t('playlist.confirmDeleteHelp')}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={async () => {
                setDialog(null);
                navigate('/playlists');
                await safely(
                  () => deletePlaylist(playlist.id),
                  t('playlists.deleted', { name: playlist.name }),
                );
              }}
            >
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          {t('playlist.inThisPlaylist', { count: tracks.length })}
        </p>
      </Dialog>

      <AddSongsDialog
        open={dialog === 'add'}
        playlist={playlist}
        onClose={() => setDialog(null)}
        onAdd={async (ids) => {
          await safely(
            () => addToPlaylist(playlist.id, ids),
            t('playlist.added', { count: ids.length }),
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
  const { t: tr } = useI18n();
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
      title={tr('playlist.addTitle', { name: playlist.name })}
      className="w-[min(94vw,36rem)]"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={close}>
            {tr('common.cancel')}
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
            {picked.size ? tr('playlist.addCount', { count: picked.size }) : tr('playlist.add')}
          </button>
        </>
      }
    >
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={tr('playlist.searchLibrary')}
        label={tr('playlist.searchLibrary')}
      />
      <ul className="mt-3 space-y-0.5" aria-label={tr('playlist.candidates')}>
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
                <span className="block truncate text-xs text-muted">{artistName(t.artist)}</span>
              </span>
              <span className="text-xs tabular-nums text-muted">{formatTime(t.duration)}</span>
            </label>
          </li>
        ))}
        {candidates.length === 0 && (
          <li className="py-8 text-center text-sm text-muted">
            {tracks?.length
              ? needle
                ? tr('playlist.noSongsMatch')
                : tr('playlist.allHere')
              : tr('playlist.libraryEmpty')}
          </li>
        )}
      </ul>
    </Dialog>
  );
}
