import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileUp, ListMusic, Plus } from 'lucide-react';
import { PlaylistCard } from '@/components/PlaylistCard';
import { PlaylistNameDialog } from '@/components/PlaylistNameDialog';
import { TopBar } from '@/components/TopBar';
import { Dialog } from '@/components/ui/Dialog';
import { createPlaylist, deletePlaylist, renamePlaylist } from '@/db/library';
import { describeDbError } from '@/db/indexedDb';
import { useLibrary, usePlaylists } from '@/hooks/useIndexedDb';
import { describeEntry, matchEntries, parsePlaylistFile } from '@/lib/playlistFiles';
import { pluralize } from '@/lib/utils';
import { useToast } from '@/state/contexts';
import type { Playlist } from '@/types';

type Editing = { mode: 'create' } | { mode: 'rename'; playlist: Playlist } | null;

export default function Playlists() {
  const playlists = usePlaylists();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const { tracks } = useLibrary();
  const fileInput = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    try {
      const parsed = await parsePlaylistFile(file);
      if (!parsed.entries.length) throw new Error(`${file.name} has no songs in it.`);
      const { trackIds, missing } = matchEntries(parsed.entries, tracks ?? []);
      if (!trackIds.length)
        throw new Error(
          `None of the ${pluralize(parsed.entries.length, 'song')} in ${file.name} are in your library. Import the music first.`,
        );
      const p = await createPlaylist(parsed.name, trackIds);
      navigate(`/playlists/${p.id}`);
      if (missing.length) {
        const sample = missing.slice(0, 3).map(describeEntry).join(', ');
        const more = missing.length > 3 ? ` and ${missing.length - 3} more` : '';
        toast({
          tone: 'info',
          message: `Imported ${pluralize(trackIds.length, 'song')} into ${p.name}. Not in your library: ${sample}${more}.`,
        });
      } else {
        toast({
          tone: 'success',
          message: `Imported ${p.name} (${pluralize(trackIds.length, 'song')}).`,
        });
      }
    } catch (err) {
      toast({ tone: 'error', message: describeDbError(err) });
    }
  };

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast({ tone: 'success', message: success });
    } catch (err) {
      toast({ tone: 'error', message: describeDbError(err) });
    }
  };

  return (
    <>
      <TopBar
        title="Playlists"
        subtitle={playlists ? pluralize(playlists.length, 'playlist') : undefined}
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInput.current?.click()}
              disabled={!tracks}
              title="Import an M3U or Tunebox JSON playlist"
            >
              <FileUp className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Import</span>
              <span className="sr-only sm:hidden">Import playlist</span>
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setEditing({ mode: 'create' })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">New playlist</span>
              <span className="sr-only sm:hidden">New playlist</span>
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".m3u,.m3u8,.json,audio/x-mpegurl,audio/mpegurl,application/vnd.apple.mpegurl,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void importFile(file);
              }}
            />
          </>
        }
      />

      {playlists?.length === 0 ? (
        <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-elevated">
            <ListMusic className="h-9 w-9 text-muted" aria-hidden />
          </div>
          <h2 className="mt-5 text-xl font-bold">No playlists yet</h2>
          <p className="mt-2 text-muted">
            Create one here, import an M3U or JSON playlist, or select songs in your library and
            choose “Add to playlist”.
          </p>
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={() => setEditing({ mode: 'create' })}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create playlist
          </button>
        </div>
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6"
          aria-label="Playlists"
        >
          {(playlists ?? []).map((p) => (
            <li key={p.id}>
              <PlaylistCard
                playlist={p}
                onRename={(pl) => setEditing({ mode: 'rename', playlist: pl })}
                onDelete={setDeleting}
              />
            </li>
          ))}
        </ul>
      )}

      <PlaylistNameDialog
        key={editing ? (editing.mode === 'rename' ? editing.playlist.id : 'new') : 'closed'}
        open={!!editing}
        mode={editing?.mode ?? 'create'}
        initialName={editing?.mode === 'rename' ? editing.playlist.name : ''}
        onClose={() => setEditing(null)}
        onSubmit={async (name) => {
          if (editing?.mode === 'rename') {
            await run(() => renamePlaylist(editing.playlist.id, name), 'Playlist renamed.');
          } else {
            try {
              const p = await createPlaylist(name);
              navigate(`/playlists/${p.id}`);
            } catch (err) {
              toast({ tone: 'error', message: describeDbError(err) });
            }
          }
          setEditing(null);
        }}
      />

      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete “${deleting?.name ?? ''}”?`}
        description="The songs stay in your library."
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={async () => {
                if (deleting)
                  await run(() => deletePlaylist(deleting.id), `Deleted ${deleting.name}.`);
                setDeleting(null);
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">This can't be undone.</p>
      </Dialog>
    </>
  );
}
