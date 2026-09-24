import { useState } from 'react';
import { ListMusic, Plus } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { SearchBar } from '@/components/SearchBar';
import { addToPlaylist, createPlaylist } from '@/db/library';
import { describeDbError } from '@/db/indexedDb';
import { usePlaylists } from '@/hooks/useIndexedDb';
import { normalize, pluralize } from '@/lib/utils';
import { useToast } from '@/state/contexts';

interface Props {
  /** Tracks to add; `null` keeps the dialog closed. */
  trackIds: string[] | null;
  onClose: () => void;
}

export function AddToPlaylistDialog({ trackIds, onClose }: Props) {
  const playlists = usePlaylists();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [newName, setNewName] = useState('');
  const count = trackIds?.length ?? 0;

  const close = () => {
    setQuery('');
    setNewName('');
    onClose();
  };

  const addTo = async (id: string, name: string) => {
    if (!trackIds) return;
    try {
      const added = await addToPlaylist(id, trackIds);
      const skipped = trackIds.length - added;
      toast({
        tone: added ? 'success' : 'info',
        message: added
          ? `Added ${pluralize(added, 'song')} to ${name}${skipped ? ` (${skipped} already there)` : ''}.`
          : `Already in ${name}.`,
      });
      close();
    } catch (err) {
      toast({ tone: 'error', message: describeDbError(err) });
    }
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackIds || !newName.trim()) return;
    try {
      const p = await createPlaylist(newName, trackIds);
      toast({
        tone: 'success',
        message: `Created ${p.name} with ${pluralize(p.trackIds.length, 'song')}.`,
      });
      close();
    } catch (err) {
      toast({ tone: 'error', message: describeDbError(err) });
    }
  };

  const q = normalize(query.trim());
  const shown = (playlists ?? []).filter((p) => !q || normalize(p.name).includes(q));

  return (
    <Dialog
      open={!!trackIds}
      onClose={close}
      title="Add to playlist"
      description={`${pluralize(count, 'song')} selected`}
    >
      <form onSubmit={create} className="flex gap-2">
        <label htmlFor="new-playlist-name" className="sr-only">
          New playlist name
        </label>
        <input
          id="new-playlist-name"
          className="input"
          placeholder="New playlist name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={100}
        />
        <button type="submit" className="btn-primary shrink-0" disabled={!newName.trim()}>
          <Plus className="h-4 w-4" aria-hidden />
          Create
        </button>
      </form>

      {(playlists?.length ?? 0) > 5 && (
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Find a playlist"
          label="Find a playlist"
          className="mt-4"
        />
      )}

      <ul className="mt-3 space-y-1" aria-label="Your playlists">
        {shown.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => void addTo(p.id, p.name)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-elevated"
            >
              <span className="grid h-10 w-10 place-items-center rounded bg-elevated text-muted">
                <ListMusic className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{p.name}</span>
                <span className="block text-xs text-muted">
                  {pluralize(p.trackIds.length, 'song')}
                </span>
              </span>
            </button>
          </li>
        ))}
        {playlists && shown.length === 0 && (
          <li className="px-2 py-4 text-center text-sm text-muted">
            {playlists.length
              ? 'No playlists match.'
              : 'No playlists yet. Name one above to create it.'}
          </li>
        )}
      </ul>
    </Dialog>
  );
}
