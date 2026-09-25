import type { ReactNode } from 'react';
import { ListEnd, ListPlus, ListStart, Play, X } from 'lucide-react';
import { useTrackActions } from '@/hooks/useTrackActions';
import { usePlayer } from '@/hooks/usePlayer';
import { useI18n } from '@/i18n';

interface SelectionBarProps {
  /** Selected IDs in display order. */
  ids: string[];
  onClear: () => void;
  /** Extra page-specific actions (delete, remove from playlist). */
  extra?: ReactNode;
}

/** Bulk actions for multi-selected songs. */
export function SelectionBar({ ids, onClear, extra }: SelectionBarProps) {
  const { playTracks } = usePlayer();
  const { playNext, enqueue, addToPlaylist } = useTrackActions();
  const { t } = useI18n();
  if (ids.length === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label={t('common.selected', { count: ids.length })}
      className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-border bg-elevated/95 p-2 shadow-lg backdrop-blur"
    >
      <span className="px-2 text-sm font-semibold" aria-live="polite">
        {t('common.selected', { count: ids.length })}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-1">
        <button type="button" className="btn-primary px-3 py-1.5" onClick={() => playTracks(ids)}>
          <Play className="h-4 w-4 fill-current" aria-hidden />
          {t('common.play')}
        </button>
        <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => playNext(ids)}>
          <ListStart className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t('selection.playNext')}</span>
          <span className="sr-only sm:hidden">{t('selection.playNext')}</span>
        </button>
        <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => enqueue(ids)}>
          <ListEnd className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t('selection.addToQueue')}</span>
          <span className="sr-only sm:hidden">{t('selection.addToQueue')}</span>
        </button>
        <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => addToPlaylist(ids)}>
          <ListPlus className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">{t('selection.addToPlaylist')}</span>
          <span className="sr-only sm:hidden">{t('selection.addToPlaylist')}</span>
        </button>
        {extra}
        <button
          type="button"
          className="icon-btn h-9 w-9"
          onClick={onClear}
          aria-label={t('selection.clear')}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
