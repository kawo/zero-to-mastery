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

import { useToast } from '@/state/contexts';
import type { Playlist } from '@/types';
import { useI18n } from '@/i18n';

type Editing = { mode: 'create' } | { mode: 'rename'; playlist: Playlist } | null;

export default function Playlists() {
  const playlists = usePlaylists();
  const toast = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Playlist | null>(null);
  const { tracks } = useLibrary();
  const fileInput = useRef<HTMLInputElement>(null);

  const importFile = async (file: File) => {
    try {
      const parsed = await parsePlaylistFile(file);
      if (!parsed.entries.length) throw new Error(t('playlists.fileEmpty', { name: file.name }));
      const { trackIds, missing } = matchEntries(parsed.entries, tracks ?? []);
      if (!trackIds.length)
        throw new Error(
          t('playlists.noneInLibrary', { count: parsed.entries.length, name: file.name }),
        );
      const p = await createPlaylist(parsed.name, trackIds);
      navigate(`/playlists/${p.id}`);
      if (missing.length) {
        const sample = missing.slice(0, 3).map(describeEntry).join(', ');
        const list =
          missing.length > 3
            ? t('playlists.andMore', { list: sample, count: missing.length - 3 })
            : sample;
        toast({
          tone: 'info',
          message: t('playlists.importedSome', {
            count: trackIds.length,
            name: p.name,
            missing: list,
          }),
        });
      } else {
        toast({
          tone: 'success',
          message: t('playlists.imported', { name: p.name, count: trackIds.length }),
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
        title={t('playlists.title')}
        subtitle={playlists ? t('common.playlists', { count: playlists.length }) : undefined}
        actions={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fileInput.current?.click()}
              disabled={!tracks}
              title={t('playlists.importTooltip')}
            >
              <FileUp className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t('playlists.import')}</span>
              <span className="sr-only sm:hidden">{t('playlists.importPlaylist')}</span>
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setEditing({ mode: 'create' })}
            >
              <Plus className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">{t('playlists.newPlaylist')}</span>
              <span className="sr-only sm:hidden">{t('playlists.newPlaylist')}</span>
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
          <h2 className="mt-5 text-xl font-bold">{t('playlists.emptyTitle')}</h2>
          <p className="mt-2 text-muted">{t('playlists.emptyHelp')}</p>
          <button
            type="button"
            className="btn-primary mt-6"
            onClick={() => setEditing({ mode: 'create' })}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t('playlists.createPlaylist')}
          </button>
        </div>
      ) : (
        <ul
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6"
          aria-label={t('playlists.title')}
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
            await run(() => renamePlaylist(editing.playlist.id, name), t('playlists.renamed'));
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
        title={t('playlists.confirmDelete', { name: deleting?.name ?? '' })}
        description={t('playlists.confirmDeleteHelp')}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeleting(null)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn-danger"
              onClick={async () => {
                if (deleting)
                  await run(
                    () => deletePlaylist(deleting.id),
                    t('playlists.deleted', { name: deleting.name }),
                  );
                setDeleting(null);
              }}
            >
              {t('common.delete')}
            </button>
          </>
        }
      >
        <p className="text-sm text-muted">{t('playlists.cannotUndo')}</p>
      </Dialog>
    </>
  );
}
