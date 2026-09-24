import { useState, type ReactNode } from 'react';
import { usePlayerEngine } from '@/hooks/usePlayer';
import { PlayerContext } from '@/state/contexts';

/**
 * Owns the single <audio> element for the whole app. It lives above the router
 * so navigation never interrupts playback.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  // Callback ref via state: the engine re-subscribes when the element mounts.
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const player = usePlayerEngine(audio);
  return (
    <PlayerContext.Provider value={player}>
      <audio ref={setAudio} preload="auto" hidden />
      {children}
    </PlayerContext.Provider>
  );
}
