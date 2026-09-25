import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { usePlayer } from '@/hooks/usePlayer';
import { formatTime } from '@/lib/audio';
import { stepSpeed } from '@/lib/eq';
import { MEDIA_KEY_GRACE_MS, mediaSessionActedSince } from '@/lib/mediaSession';
import { isInteractiveTarget, isTypingTarget, usesArrowKeys } from '@/lib/utils';
import { useUi } from '@/state/contexts';
import type { RepeatMode } from '@/types';
import { formatPercent, formatSpeed, useI18n, type MessageKey } from '@/i18n';

const SEEK_SMALL = 5; // seconds for ← / →
const SEEK_LARGE = 10; // seconds for J / L
const VOLUME_STEP = 0.1;

const NEXT_REPEAT: Record<RepeatMode, RepeatMode> = { off: 'all', all: 'one', one: 'off' };
const REPEAT_LABEL = {
  off: 'player.repeatOff',
  all: 'player.repeatAll',
  one: 'player.repeatOne',
} as const satisfies Record<RepeatMode, MessageKey>;

/**
 * Shown in the help dialog and the README; keep in sync with the handler below.
 * {space}, {shift} and {esc} are replaced with the key names in the current language.
 */
const SHORTCUTS: { keys: string[]; action: MessageKey; params?: Record<string, number> }[] = [
  { keys: ['{space}', 'K'], action: 'shortcuts.playPause' },
  { keys: ['{shift} + →', 'N'], action: 'shortcuts.next' },
  { keys: ['{shift} + ←', 'P'], action: 'shortcuts.previous' },
  { keys: ['←', '→'], action: 'shortcuts.seekBy', params: { s: SEEK_SMALL } },
  { keys: ['J', 'L'], action: 'shortcuts.seekBy', params: { s: SEEK_LARGE } },
  { keys: ['0 – 9'], action: 'shortcuts.jump' },
  { keys: ['{shift} + ↑', '{shift} + ↓', '+', '−'], action: 'shortcuts.volume' },
  { keys: ['M'], action: 'shortcuts.mute' },
  { keys: ['S'], action: 'shortcuts.shuffle' },
  { keys: ['R'], action: 'shortcuts.repeat' },
  { keys: ['<', '>'], action: 'shortcuts.speed' },
  { keys: ['Q'], action: 'shortcuts.queue' },
  { keys: ['/'], action: 'shortcuts.search' },
  { keys: ['?'], action: 'shortcuts.help' },
  { keys: ['{esc}'], action: 'shortcuts.escape' },
];

/** Hardware media keys. The Media Session normally handles them; see src/lib/mediaSession.ts. */
const MEDIA_KEYS = new Set(['MediaPlayPause', 'MediaTrackNext', 'MediaTrackPrevious', 'MediaStop']);

/**
 * Global keyboard shortcuts. Ignored while typing, while a dialog is open, and for
 * keys a focused control uses itself (Space on buttons, arrows on sliders and menus).
 * Returns a short message describing the last change, for the on-screen indicator.
 */
function useKeyboardShortcuts(onHelp: () => void): { text: string; n: number } | null {
  const player = usePlayer();
  const { toggleQueue } = useUi();
  const { t: tr } = useI18n();
  const [hud, setHud] = useState<{ text: string; n: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const mediaKeyTimers = new Set<ReturnType<typeof setTimeout>>();
    const show = (text: string) => {
      setHud((h) => ({ text, n: (h?.n ?? 0) + 1 }));
      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setHud(null), 1200);
    };
    const seekTo = (seconds: number) => {
      const { audio, currentTrack } = player;
      if (!audio || !currentTrack) return;
      const duration = audio.duration || currentTrack.duration;
      const t = Math.max(0, Math.min(seconds, duration));
      player.seek(t);
      show(`${formatTime(t)} / ${formatTime(duration)}`);
    };
    const seekBy = (delta: number) => {
      if (player.audio) seekTo(player.audio.currentTime + delta);
    };
    const changeVolume = (delta: number) => {
      const base = player.muted ? 0 : player.volume;
      const v = Math.round(Math.max(0, Math.min(1, base + delta)) * 100) / 100;
      player.setVolume(v);
      if (v === 0 && !player.muted) player.toggleMute();
      show(
        v === 0
          ? tr('shortcuts.hudMuted')
          : tr('shortcuts.hudVolume', { percent: formatPercent(v) }),
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;

      if (MEDIA_KEYS.has(e.key)) {
        e.preventDefault();
        const act = () => {
          if (e.key === 'MediaPlayPause') player.toggle();
          else if (e.key === 'MediaTrackNext') player.next();
          else if (e.key === 'MediaTrackPrevious') player.prev();
          else {
            player.pause();
            player.seek(0);
          }
        };
        if (!('mediaSession' in navigator)) return act();
        // The key may also reach our Media Session (just before or after this event).
        // Only act if it didn't, e.g. because another tab or app holds the media keys.
        const pressedAt = performance.now() - MEDIA_KEY_GRACE_MS;
        mediaKeyTimers.add(
          setTimeout(() => {
            if (!mediaSessionActedSince(pressedAt)) act();
          }, MEDIA_KEY_GRACE_MS),
        );
        return;
      }

      if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return;
      const arrow = e.key.startsWith('Arrow');
      if (arrow && usesArrowKeys(e.target)) return;
      // Space activates a focused button/checkbox/slider; only take it when nothing else would.
      if (e.key === ' ' && isInteractiveTarget(e.target)) return;

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      let handled = true;
      if (key === ' ' || key === 'k') player.toggle();
      else if ((key === 'ArrowRight' && e.shiftKey) || key === 'n') player.next();
      else if ((key === 'ArrowLeft' && e.shiftKey) || key === 'p') player.prev();
      else if (key === 'ArrowRight') seekBy(SEEK_SMALL);
      else if (key === 'ArrowLeft') seekBy(-SEEK_SMALL);
      else if (key === 'l') seekBy(SEEK_LARGE);
      else if (key === 'j') seekBy(-SEEK_LARGE);
      else if (/^[0-9]$/.test(key) && !e.shiftKey) {
        const d = player.audio?.duration || player.currentTrack?.duration || 0;
        seekTo((d * Number(key)) / 10);
      } else if ((key === 'ArrowUp' && e.shiftKey) || key === '+' || key === '=')
        changeVolume(VOLUME_STEP);
      else if ((key === 'ArrowDown' && e.shiftKey) || key === '-') changeVolume(-VOLUME_STEP);
      else if (key === 'm') {
        player.toggleMute();
        show(
          player.muted
            ? tr('shortcuts.hudVolume', { percent: formatPercent(player.volume) })
            : tr('shortcuts.hudMuted'),
        );
      } else if (key === 's') {
        player.toggleShuffle();
        show(player.shuffle ? tr('player.shuffleOff') : tr('player.shuffleOn'));
      } else if (key === 'r') {
        player.cycleRepeat();
        show(tr(REPEAT_LABEL[NEXT_REPEAT[player.repeat]]));
      } else if (key === '<' || key === '>') {
        const rate = stepSpeed(player.playbackRate, key === '>' ? 1 : -1);
        player.setPlaybackRate(rate);
        show(tr('shortcuts.hudSpeed', { speed: formatSpeed(rate) }));
      } else if (key === 'q') toggleQueue();
      else if (key === '?') onHelp();
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      mediaKeyTimers.forEach(clearTimeout);
    };
  }, [player, toggleQueue, onHelp, tr]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  return hud;
}

/** Keyboard shortcuts, their on-screen feedback, and the "?" help dialog. */
export function Shortcuts({
  helpOpen,
  onHelp,
  onClose,
}: {
  helpOpen: boolean;
  /** Must be stable (useCallback). */
  onHelp: () => void;
  onClose: () => void;
}) {
  const hud = useKeyboardShortcuts(onHelp);
  const { t } = useI18n();
  const keyName = (k: string) =>
    k
      .replace('{space}', t('shortcuts.keySpace'))
      .replace('{shift}', t('shortcuts.keyShift'))
      .replace('{esc}', t('shortcuts.keyEsc'));

  return (
    <>
      {/* Visual feedback for volume, seek, shuffle and repeat keys; also read by screen readers. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center"
      >
        {hud && (
          // Keyed by count so pressing the same key twice is announced again.
          <span
            key={hud.n}
            className="rounded-full bg-elevated px-4 py-2 text-sm font-semibold shadow-2xl ring-1 ring-border"
          >
            {hud.text}
          </span>
        )}
      </div>

      <Dialog
        open={helpOpen}
        onClose={onClose}
        title={t('shortcuts.title')}
        description={t('shortcuts.description')}
      >
        <table className="w-full text-sm">
          <thead className="sr-only">
            <tr>
              <th scope="col">{t('shortcuts.keysHeader')}</th>
              <th scope="col">{t('shortcuts.actionHeader')}</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map(({ keys, action, params }) => (
              <tr key={keys.join()} className="border-b border-border last:border-0">
                <td className="py-2 pr-4 align-top">
                  <span className="flex flex-wrap gap-1">
                    {keys.map((k) => (
                      <kbd
                        key={k}
                        className="rounded border border-border bg-elevated px-1.5 py-0.5 font-mono text-xs"
                      >
                        {keyName(k)}
                      </kbd>
                    ))}
                  </span>
                </td>
                <td className="py-2 text-muted">{t(action, params)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Dialog>
    </>
  );
}
