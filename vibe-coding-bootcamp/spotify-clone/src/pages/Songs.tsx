import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Music2, Trash2, Upload } from 'lucide-react';
import { DemoSeedButton } from '@/components/DemoSeedButton';
import { ListPlayButton } from '@/components/ListPlayButton';
import { ShuffleButton } from '@/components/PlayerControls';
import { SearchBar } from '@/components/SearchBar';
import { SelectionBar } from '@/components/SelectionBar';
import { SongList } from '@/components/SongList';
import { TopBar } from '@/components/TopBar';
import { Dialog } from '@/components/ui/Dialog';
import { deleteTracks } from '@/db/library';
import { describeDbError } from '@/db/indexedDb';
import { useLibrary } from '@/hooks/useIndexedDb';
import { usePlayer } from '@/hooks/usePlayer';
import { useTrackActions } from '@/hooks/useTrackActions';

import { normalize } from '@/lib/utils';
import { useToast } from '@/state/contexts';
import type { SortDir, SortKey, Track } from '@/types';
import { artistName, formatTotalDuration, useI18n, type MessageKey } from '@/i18n';

const SORTS: { key: SortKey; label: MessageKey }[] = [
  { key: 'createdAt', label: 'songs.sortDateAdded' },
  { key: 'title', label: 'songs.sortTitle' },
  { key: 'artist', label: 'songs.sortArtist' },
  { key: 'album', label: 'songs.sortAlbum' },
  { key: 'duration', label: 'songs.sortDuration' },
  { key: 'playCount', label: 'songs.sortMostPlayed' },
];

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compare(a: Track, b: Track, key: SortKey): number {
  switch (key) {
    case 'title':
      return collator.compare(a.title, b.title);
    case 'artist':
      return (
        collator.compare(a.artist, b.artist) ||
        collator.compare(a.album, b.album) ||
        (a.trackNo ?? 0) - (b.trackNo ?? 0)
      );
    case 'album':
      return (
        collator.compare(a.album, b.album) ||
        (a.trackNo ?? 0) - (b.trackNo ?? 0) ||
        collator.compare(a.title, b.title)
      );
    case 'duration':
      return a.duration - b.duration;
    case 'createdAt':
      return a.createdAt - b.createdAt;
    case 'playCount':
      return (
        (a.playCount ?? 0) - (b.playCount ?? 0) || (a.lastPlayedAt ?? 0) - (b.lastPlayedAt ?? 0)
      );
  }
}

/** Library: search, filter by artist/genre, sort, multi-select. State lives in the URL. */
export default function Songs() {
  const { tracks } = useLibrary();
  const { playTracks } = usePlayer();
  const { menuItems } = useTrackActions();
  const toast = useToast();
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);

  const q = params.get('q') ?? '';
  const artist = params.get('artist') ?? '';
  const genre = params.get('genre') ?? '';
  const sort = (params.get('sort') as SortKey | null) ?? 'createdAt';
  const dir: SortDir =
    params.get('dir') === 'asc'
      ? 'asc'
      : params.get('dir') === 'desc'
        ? 'desc'
        : sort === 'createdAt' || sort === 'playCount'
          ? 'desc'
          : 'asc';
  const deferredQ = useDeferredValue(q);

  const setParam = (key: string, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key === 'sort') next.delete('dir');
        return next;
      },
      { replace: true },
    );
  };

  const artists = useMemo(
    () => [...new Set((tracks ?? []).map((t) => t.artist))].sort(collator.compare),
    [tracks],
  );
  const genres = useMemo(
    () =>
      [...new Set((tracks ?? []).map((t) => t.genre).filter((g): g is string => !!g))].sort(
        collator.compare,
      ),
    [tracks],
  );

  const shown = useMemo(() => {
    const needle = normalize(deferredQ.trim());
    const list = (tracks ?? []).filter(
      (t) =>
        (!artist || t.artist === artist) &&
        (!genre || t.genre === genre) &&
        (!needle ||
          normalize(`${t.title} ${t.artist} ${t.album} ${t.genre ?? ''}`).includes(needle)),
    );
    const sign = dir === 'asc' ? 1 : -1;
    return list.sort((a, b) => sign * compare(a, b, sort));
  }, [tracks, deferredQ, artist, genre, sort, dir]);

  const selectedIds = shown.filter((t) => selected.has(t.id)).map((t) => t.id);
  const totalDuration = (tracks ?? []).reduce((s, t) => s + t.duration, 0);
  const filtered = !!(q || artist || genre);

  const doDelete = async (ids: string[]) => {
    try {
      await deleteTracks(ids);
      setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
      toast({ tone: 'success', message: t('songs.deleted', { count: ids.length }) });
    } catch (err) {
      toast({ tone: 'error', message: describeDbError(err) });
    }
    setConfirmDelete(null);
  };

  if (tracks === undefined) {
    return (
      <>
        <TopBar title={t('songs.title')} />
        <p className="py-10 text-center text-muted" role="status">
          {t('songs.loading')}
        </p>
      </>
    );
  }

  if (tracks.length === 0) {
    return (
      <>
        <TopBar title={t('songs.title')} />
        <EmptyLibrary />
      </>
    );
  }

  return (
    <>
      <TopBar
        title={t('songs.title')}
        subtitle={`${t('common.songs', { count: tracks.length })} · ${formatTotalDuration(totalDuration)}`}
        actions={
          <>
            <ListPlayButton
              trackIds={shown.map((t) => t.id)}
              label={filtered ? t('songs.playMatching') : t('songs.playAll')}
              textClassName="hidden sm:inline"
            />
            <ShuffleButton />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBar
          value={q}
          onChange={(v) => setParam('q', v)}
          placeholder={t('songs.searchPlaceholder')}
          label={t('songs.searchLabel')}
          className="w-full sm:w-80"
          hotkey
        />
        <label className="sr-only" htmlFor="filter-artist">
          {t('songs.filterArtist')}
        </label>
        <select
          id="filter-artist"
          className="input w-auto max-w-[12rem]"
          value={artist}
          onChange={(e) => setParam('artist', e.target.value)}
        >
          <option value="">{t('songs.allArtists')}</option>
          {artists.map((a) => (
            <option key={a} value={a}>
              {artistName(a)}
            </option>
          ))}
        </select>
        {genres.length > 0 && (
          <>
            <label className="sr-only" htmlFor="filter-genre">
              {t('songs.filterGenre')}
            </label>
            <select
              id="filter-genre"
              className="input w-auto max-w-[10rem]"
              value={genre}
              onChange={(e) => setParam('genre', e.target.value)}
            >
              <option value="">{t('songs.allGenres')}</option>
              {genres.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="flex items-center gap-1 sm:ml-auto">
          <label className="sr-only" htmlFor="sort-by">
            {t('songs.sortBy')}
          </label>
          <select
            id="sort-by"
            className="input w-auto"
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {t(s.label)}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setParam('dir', dir === 'asc' ? 'desc' : 'asc')}
            aria-label={dir === 'asc' ? t('songs.sortAscending') : t('songs.sortDescending')}
          >
            {dir === 'asc' ? (
              <ArrowUpNarrowWide className="h-5 w-5" aria-hidden />
            ) : (
              <ArrowDownWideNarrow className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {filtered ? t('songs.found', { count: shown.length }) : ''}
      </p>

      <SelectionBar
        ids={selectedIds}
        onClear={() => setSelected(new Set())}
        extra={
          <button
            type="button"
            className="btn-ghost px-3 py-1.5 text-danger hover:text-danger"
            onClick={() => setConfirmDelete(selectedIds)}
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{t('common.delete')}</span>
            <span className="sr-only sm:hidden">{t('common.delete')}</span>
          </button>
        }
      />

      {shown.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-semibold">{t('songs.noMatch')}</p>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => setParams({}, { replace: true })}
          >
            {t('songs.clearFilters')}
          </button>
        </div>
      ) : (
        <SongList
          tracks={shown}
          label={t('songs.title')}
          onPlay={(i) =>
            playTracks(
              shown.map((t) => t.id),
              i,
            )
          }
          selection={{ selected, onChange: setSelected }}
          rowActions={(track) => [
            ...menuItems([track.id]),
            {
              label: t('songs.deleteFromLibrary'),
              icon: <Trash2 />,
              danger: true,
              onSelect: () => setConfirmDelete([track.id]),
            },
          ]}
        />
      )}

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('songs.confirmDelete', { count: confirmDelete?.length ?? 0 })}
        description={t('songs.confirmDeleteHelp')}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => confirmDelete && void doDelete(confirmDelete)}
            >
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('songs.backupTip')}</p>
      </Dialog>
    </>
  );
}

function EmptyLibrary() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-elevated">
        <Music2 className="h-9 w-9 text-muted" aria-hidden />
      </div>
      <h2 className="mt-5 text-xl font-bold">{t('songs.emptyTitle')}</h2>
      <p className="mt-2 text-muted">{t('songs.emptyHelp')}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/upload" className="btn-primary">
          <Upload className="h-4 w-4" aria-hidden />
          {t('songs.importSongs')}
        </Link>
        <DemoSeedButton />
      </div>
    </div>
  );
}
