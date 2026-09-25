import { Link } from 'react-router-dom';
import { Pencil, Play, Trash2 } from 'lucide-react';
import { ArtworkMosaic } from '@/components/Artwork';
import { Menu } from '@/components/ui/Menu';
import { useTracksByIds } from '@/hooks/useIndexedDb';
import { usePlayer } from '@/hooks/usePlayer';

import type { Playlist } from '@/types';
import { formatTotalDuration, useI18n } from '@/i18n';

interface PlaylistCardProps {
  playlist: Playlist;
  onRename: (p: Playlist) => void;
  onDelete: (p: Playlist) => void;
}

export function PlaylistCard({ playlist, onRename, onDelete }: PlaylistCardProps) {
  const tracks = useTracksByIds(playlist.trackIds);
  const { playTracks } = usePlayer();
  const { t } = useI18n();
  const total = tracks.reduce((s, t) => s + t.duration, 0);

  return (
    <article className="group relative rounded-xl bg-surface p-3 transition-colors hover:bg-elevated">
      <div className="relative">
        <ArtworkMosaic tracks={tracks} />
        {tracks.length > 0 && (
          <button
            type="button"
            onClick={() => playTracks(tracks.map((t) => t.id))}
            className="absolute bottom-2 right-2 z-10 grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-fg opacity-100 shadow-xl transition hover:scale-105 focus-visible:opacity-100 md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
            aria-label={t('common.playItem', { name: playlist.name })}
          >
            <Play className="h-5 w-5 fill-current" aria-hidden />
          </button>
        )}
      </div>
      <div className="mt-3 flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold">
            {/* Stretched link: the whole card opens the playlist. */}
            <Link
              to={`/playlists/${playlist.id}`}
              className="after:absolute after:inset-0 after:rounded-xl focus-visible:ring-0 focus-visible:after:ring-2 focus-visible:after:ring-accent"
            >
              {playlist.name}
            </Link>
          </h2>
          <p className="truncate text-sm text-muted">
            {t('common.songs', { count: tracks.length })}
            {total > 0 && ` · ${formatTotalDuration(total)}`}
          </p>
        </div>
        <div className="relative z-10">
          <Menu
            label={t('common.moreOptions', { name: playlist.name })}
            items={[
              { label: t('common.rename'), icon: <Pencil />, onSelect: () => onRename(playlist) },
              {
                label: t('common.delete'),
                icon: <Trash2 />,
                danger: true,
                onSelect: () => onDelete(playlist),
              },
            ]}
          />
        </div>
      </div>
    </article>
  );
}
