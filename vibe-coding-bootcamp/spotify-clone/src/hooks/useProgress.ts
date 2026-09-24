import { useEffect, useState } from 'react';

export interface Progress {
  current: number;
  duration: number;
  buffered: number;
}

/**
 * Playback position of an <audio> element. While playing it samples on
 * requestAnimationFrame (smooth timeline); while paused it only listens for
 * seeks/loads. Local to the component that uses it, so the rest of the tree
 * doesn't re-render every frame.
 */
export function useProgress(audio: HTMLAudioElement | null, fallbackDuration = 0): Progress {
  const [p, setP] = useState<Progress>({ current: 0, duration: fallbackDuration, buffered: 0 });

  useEffect(() => {
    if (!audio) return;
    let frame = 0;
    const read = () => {
      const duration =
        Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : fallbackDuration;
      const b = audio.buffered;
      const buffered = b.length ? b.end(b.length - 1) : 0;
      setP((prev) =>
        Math.abs(prev.current - audio.currentTime) < 0.05 &&
        prev.duration === duration &&
        prev.buffered === buffered
          ? prev
          : { current: audio.currentTime, duration, buffered },
      );
    };
    const loop = () => {
      read();
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(loop);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      read();
    };
    const events = [
      'loadedmetadata',
      'durationchange',
      'seeked',
      'seeking',
      'emptied',
      'progress',
      'timeupdate',
    ];
    events.forEach((e) => audio.addEventListener(e, read));
    audio.addEventListener('play', start);
    audio.addEventListener('pause', stop);
    audio.addEventListener('ended', stop);
    read();
    if (!audio.paused) start();
    return () => {
      cancelAnimationFrame(frame);
      events.forEach((e) => audio.removeEventListener(e, read));
      audio.removeEventListener('play', start);
      audio.removeEventListener('pause', stop);
      audio.removeEventListener('ended', stop);
    };
  }, [audio, fallbackDuration]);

  return p;
}
