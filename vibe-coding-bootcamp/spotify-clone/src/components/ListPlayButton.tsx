import { Play, Square } from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';
import { startIndex } from '@/lib/utils';
import { useI18n } from '@/i18n';

/**
 * "Play" for a list of songs. While one of them is playing it becomes "Stop",
 * which pauses and rewinds the current track.
 */
export function ListPlayButton({
  trackIds,
  label,
  textClassName,
}: {
  trackIds: string[];
  /** Accessible name for the Play state, e.g. "Play all songs". */
  label: string;
  textClassName?: string;
}) {
  const { playTracks, pause, seek, isPlaying, currentTrack, shuffle } = usePlayer();
  const { t } = useI18n();
  const playing = isPlaying && !!currentTrack && trackIds.includes(currentTrack.id);

  return (
    <button
      type="button"
      className="btn-primary"
      onClick={() => {
        if (playing) {
          pause();
          seek(0);
        } else {
          playTracks(trackIds, startIndex(trackIds.length, shuffle));
        }
      }}
      disabled={!trackIds.length}
      aria-label={playing ? t('common.stop') : label}
    >
      {playing ? (
        <Square className="h-4 w-4 fill-current" aria-hidden />
      ) : (
        <Play className="h-4 w-4 fill-current" aria-hidden />
      )}
      <span className={textClassName}>{playing ? t('common.stop') : t('common.play')}</span>
    </button>
  );
}
