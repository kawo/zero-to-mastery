import { useMemo, useState, type ReactNode } from 'react';
import { usePlayerEngine } from '@/hooks/usePlayer';
import { PlayerContext } from '@/state/contexts';

/**
 * Owns the app's two <audio> elements ("decks"). One plays the current track while
 * the other preloads the next, for gapless playback and crossfades. They live above
 * the router so navigation never interrupts playback.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  // Callback refs via state: the engine re-subscribes when the elements mount.
  const [a, setA] = useState<HTMLAudioElement | null>(null);
  const [b, setB] = useState<HTMLAudioElement | null>(null);
  const decks = useMemo(() => [a, b] as const, [a, b]);
  const player = usePlayerEngine(decks);
  return (
    <PlayerContext.Provider value={player}>
      <audio ref={setA} preload="auto" hidden />
      <audio ref={setB} preload="auto" hidden />
      {children}
    </PlayerContext.Provider>
  );
}
