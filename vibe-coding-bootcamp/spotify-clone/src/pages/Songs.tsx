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
import { formatTotalDuration } from '@/lib/audio';
import { normalize, pluralize } from '@/lib/utils';
import { useToast } from '@/state/contexts';
import type { SortDir, SortKey, Track } from '@/types';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'createdAt', label: 'Date added' },
  { key: 'title', label: 'Title' },
  { key: 'artist', label: 'Artist' },
  { key: 'album', label: 'Album' },
  { key: 'duration', label: 'Duration' },
  { key: 'playCount', label: 'Most played' },
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
      toast({ tone: 'success', message: `Deleted ${pluralize(ids.length, 'song')}.` });
    } catch (err) {
      toast({ tone: 'error', message: describeDbError(err) });
    }
    setConfirmDelete(null);
  };

  if (tracks === undefined) {
    return (
      <>
        <TopBar title="Songs" />
        <p className="py-10 text-center text-muted" role="status">
          Loading your library…
        </p>
      </>
    );
  }

  if (tracks.length === 0) {
    return (
      <>
        <TopBar title="Songs" />
        <EmptyLibrary />
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Songs"
        subtitle={`${pluralize(tracks.length, 'song')} · ${formatTotalDuration(totalDuration)}`}
        actions={
          <>
            <ListPlayButton
              trackIds={shown.map((t) => t.id)}
              label={filtered ? 'Play matching songs' : 'Play all songs'}
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
          placeholder="Search title, artist, album  ( / )"
          label="Search songs"
          className="w-full sm:w-80"
          hotkey
        />
        <label className="sr-only" htmlFor="filter-artist">
          Filter by artist
        </label>
        <select
          id="filter-artist"
          className="input w-auto max-w-[12rem]"
          value={artist}
          onChange={(e) => setParam('artist', e.target.value)}
        >
          <option value="">All artists</option>
          {artists.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {genres.length > 0 && (
          <>
            <label className="sr-only" htmlFor="filter-genre">
              Filter by genre
            </label>
            <select
              id="filter-genre"
              className="input w-auto max-w-[10rem]"
              value={genre}
              onChange={(e) => setParam('genre', e.target.value)}
            >
              <option value="">All genres</option>
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
            Sort by
          </label>
          <select
            id="sort-by"
            className="input w-auto"
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setParam('dir', dir === 'asc' ? 'desc' : 'asc')}
            aria-label={
              dir === 'asc'
                ? 'Sorted ascending. Switch to descending.'
                : 'Sorted descending. Switch to ascending.'
            }
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
        {filtered ? `${pluralize(shown.length, 'song')} found` : ''}
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
            <span className="hidden sm:inline">Delete</span>
            <span className="sr-only sm:hidden">Delete</span>
          </button>
        }
      />

      {shown.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-semibold">No songs match your filters.</p>
          <button
            type="button"
            className="btn-secondary mt-4"
            onClick={() => setParams({}, { replace: true })}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <SongList
          tracks={shown}
          label="Songs"
          onPlay={(i) =>
            playTracks(
              shown.map((t) => t.id),
              i,
            )
          }
          selection={{ selected, onChange: setSelected }}
          rowActions={(t) => [
            ...menuItems([t.id]),
            {
              label: 'Delete from library',
              icon: <Trash2 />,
              danger: true,
              onSelect: () => setConfirmDelete([t.id]),
            },
          ]}
        />
      )}

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={`Delete ${pluralize(confirmDelete?.length ?? 0, 'song')}?`}
        description="The audio is removed from this device and from every playlist. This can't be undone."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={() => confirmDelete && void doDelete(confirmDelete)}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Tip: export a full backup first from the Import page if you might want them back.
        </p>
      </Dialog>
    </>
  );
}

function EmptyLibrary() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-elevated">
        <Music2 className="h-9 w-9 text-muted" aria-hidden />
      </div>
      <h2 className="mt-5 text-xl font-bold">Your library is empty</h2>
      <p className="mt-2 text-muted">
        Import MP3s from your device. They're stored in this browser, so they play even when you're
        offline.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/upload" className="btn-primary">
          <Upload className="h-4 w-4" aria-hidden />
          Import songs
        </Link>
        <DemoSeedButton />
      </div>
    </div>
  );
}
