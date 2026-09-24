/**
 * Playback engine: wires the pure queue model (lib/queue.ts) to a native
 * <audio> element, persists the session, and integrates the Media Session API.
 *
 * `usePlayerEngine` runs once inside PlayerProvider; components call `usePlayer()`.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { getSettings, updateSettings } from '@/db/indexedDb';
import { recordPlay } from '@/db/library';
import { acquireBlobUrl, releaseBlobUrl } from '@/lib/audio';
import { EMPTY_QUEUE, nextIndex, prevIndex, queueReducer } from '@/lib/queue';
import { useLibrary } from '@/hooks/useIndexedDb';
import {
  PlayerContext,
  required,
  useToast,
  type PlayerValue,
  type PlayOptions,
} from '@/state/contexts';
import type { RepeatMode } from '@/types';

export const usePlayer = () => required(PlayerContext, 'usePlayer');

const RESTART_THRESHOLD = 3; // seconds: "previous" restarts the track after this
const POSITION_SAVE_MS = 5000;

/** Keeps a ref pointing at the latest value, for use inside long-lived event handlers. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function usePlayerEngine(audio: HTMLAudioElement | null): PlayerValue {
  const { tracks, byId } = useLibrary();
  const toast = useToast();

  const [queue, dispatch] = useReducer(queueReducer, EMPTY_QUEUE);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [shuffle, setShuffle] = useState(false);
  const [volume, setVolumeState] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [restored, setRestored] = useState(false);

  const current = queue.items[queue.index] ?? null;
  const currentTrack = current ? (byId.get(current.trackId) ?? null) : null;

  /** Whether audio should start as soon as the current source is ready. */
  const wantPlay = useRef(false);
  /** Position to seek to once metadata loads (session restore). */
  const pendingSeek = useRef<number | null>(null);
  /** Consecutive failures, so a queue full of broken files can't loop forever. */
  const errorStreak = useRef(0);
  /** Queue item uid whose play has been counted. */
  const counted = useRef<string | null>(null);
  const lastPositionSave = useRef(0);

  const latest = useLatest({ queue, repeat, shuffle, currentTrack, byId, tracks, isPlaying });

  /* ---------------------------- primitives ---------------------------- */

  const savePosition = useCallback(() => {
    if (!audio || !latest.current.currentTrack) return;
    lastPositionSave.current = Date.now();
    void updateSettings({ lastPosition: audio.currentTime || 0 });
  }, [audio, latest]);

  const startAudio = useCallback(() => {
    if (!audio) return;
    wantPlay.current = true;
    if (!audio.getAttribute('src')) return; // the load effect will start it
    audio.play().catch((err: unknown) => {
      const name = err instanceof Error ? err.name : '';
      if (name === 'AbortError') return; // a newer load interrupted this one
      wantPlay.current = false;
      setIsPlaying(false);
      if (name !== 'NotAllowedError')
        toast({ tone: 'error', message: 'Playback could not start.' });
    });
  }, [audio, toast]);

  const goTo = useCallback(
    (index: number, play: boolean) => {
      wantPlay.current = play;
      if (index === latest.current.queue.index && audio) {
        audio.currentTime = 0;
        if (play) startAudio();
        return;
      }
      dispatch({ type: 'jump', index });
    },
    [audio, latest, startAudio],
  );

  const stopAtEnd = useCallback(() => {
    wantPlay.current = false;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, [audio]);

  const next = useCallback(
    (auto = false) => {
      const { queue: q, repeat: r } = latest.current;
      if (auto && r === 'one' && audio) {
        audio.currentTime = 0;
        startAudio();
        return;
      }
      const n = nextIndex(q, r);
      if (n === null) {
        if (auto) stopAtEnd();
        return;
      }
      goTo(n, auto || wantPlay.current);
    },
    [audio, goTo, latest, startAudio, stopAtEnd],
  );

  const prev = useCallback(() => {
    if (audio && audio.currentTime > RESTART_THRESHOLD) {
      audio.currentTime = 0;
      return;
    }
    const p = prevIndex(latest.current.queue, latest.current.repeat);
    if (p === null) {
      if (audio) audio.currentTime = 0;
      return;
    }
    goTo(p, wantPlay.current);
  }, [audio, goTo, latest]);

  /** Skip a track that can't be played, or stop if nothing playable is left. */
  const failCurrent = useCallback(
    (message: string) => {
      toast({ tone: 'error', message });
      errorStreak.current++;
      const { queue: q, repeat: r } = latest.current;
      const n = nextIndex(q, r);
      if (n !== null && errorStreak.current < q.items.length) goTo(n, wantPlay.current);
      else {
        wantPlay.current = false;
        setIsPlaying(false);
      }
    },
    [goTo, latest, toast],
  );

  /* ------------------------- session restore -------------------------- */

  useEffect(() => {
    if (restored || tracks === undefined) return;
    let cancelled = false;
    void getSettings().then((s) => {
      if (cancelled) return;
      setRepeat(s.repeat);
      setShuffle(s.shuffle);
      setVolumeState(s.volume);
      setMuted(s.muted);
      const valid = s.lastQueue.filter((id) => byId.has(id));
      if (valid.length) {
        // Where the saved index lands after dropping deleted tracks.
        const index = s.lastQueue
          .slice(0, Math.max(0, s.lastIndex))
          .filter((id) => byId.has(id)).length;
        const idx = Math.min(index, valid.length - 1);
        if (valid[idx] === s.lastTrackId && s.lastPosition > 0)
          pendingSeek.current = s.lastPosition;
        dispatch({ type: 'restore', trackIds: valid, index: idx });
      }
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [byId, restored, tracks]);

  // Tracks deleted from the library disappear from the queue.
  useEffect(() => {
    if (restored && tracks) dispatch({ type: 'prune', validIds: new Set(tracks.map((t) => t.id)) });
  }, [restored, tracks]);

  /* --------------------------- load source ---------------------------- */

  const currentUid = current?.uid;
  const audioBlobId = currentTrack?.audioBlobId;
  const audioMissing = !!currentTrack?.audioMissing;

  useEffect(() => {
    if (!audio) return;
    if (!currentUid || !audioBlobId) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    const title = latest.current.currentTrack?.title ?? 'This song';
    if (audioMissing) {
      failCurrent(`“${title}” isn't stored on this device. Import the file again to relink it.`);
      return;
    }
    let cancelled = false;
    let acquired = false;
    counted.current = null;
    acquireBlobUrl(audioBlobId)
      .then((url) => {
        if (cancelled) {
          if (url) releaseBlobUrl(audioBlobId);
          return;
        }
        if (!url) {
          failCurrent(`The audio for “${title}” is missing. Try importing it again.`);
          return;
        }
        acquired = true;
        audio.src = url;
        const seekTo = pendingSeek.current;
        pendingSeek.current = null;
        if (seekTo) {
          audio.addEventListener('loadedmetadata', () => (audio.currentTime = seekTo), {
            once: true,
          });
        }
        if (wantPlay.current) startAudio();
      })
      .catch(() => failCurrent(`“${title}” could not be loaded from storage.`));
    return () => {
      cancelled = true;
      if (acquired) releaseBlobUrl(audioBlobId);
    };
  }, [audio, currentUid, audioBlobId, audioMissing, failCurrent, latest, startAudio]);

  /* --------------------------- audio events --------------------------- */

  useEffect(() => {
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => {
      setIsPlaying(false);
      savePosition();
    };
    const onPlaying = () => {
      setIsBuffering(false);
      errorStreak.current = 0;
    };
    const onWaiting = () => setIsBuffering(true);
    const onEnded = () => next(true);
    const onError = () => {
      if (!audio.getAttribute('src')) return;
      const title = latest.current.currentTrack?.title ?? 'this song';
      failCurrent(`Couldn't play “${title}”. The file may be damaged or in an unsupported format.`);
    };
    const onTimeUpdate = () => {
      const t = latest.current.currentTrack;
      const uidNow = latest.current.queue.items[latest.current.queue.index]?.uid ?? null;
      // Count a play after 30s (or half of a short track).
      if (t && uidNow && counted.current !== uidNow) {
        const threshold = Math.min(30, (audio.duration || t.duration || 60) / 2);
        if (audio.currentTime >= threshold) {
          counted.current = uidNow;
          void recordPlay(t.id);
        }
      }
      if (!audio.paused && Date.now() - lastPositionSave.current > POSITION_SAVE_MS) savePosition();
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [audio, failCurrent, latest, next, savePosition]);

  // Save the position when the tab is hidden or closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') savePosition();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', savePosition);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', savePosition);
    };
  }, [savePosition]);

  /* ---------------------------- persistence --------------------------- */

  useEffect(() => {
    if (!restored) return;
    const timer = setTimeout(() => {
      void updateSettings({
        lastQueue: queue.items.map((i) => i.trackId),
        lastIndex: queue.index,
        lastTrackId: queue.items[queue.index]?.trackId,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [queue, restored]);

  useEffect(() => {
    if (restored) void updateSettings({ repeat, shuffle, volume, muted });
  }, [repeat, shuffle, volume, muted, restored]);

  useEffect(() => {
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [audio, volume, muted]);

  /* --------------------------- media session -------------------------- */

  const ms =
    typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
  const trackId = currentTrack?.id;
  const artworkBlobId = currentTrack?.artworkBlobId;

  useEffect(() => {
    if (!ms) return;
    const t = latest.current.currentTrack;
    if (!t) {
      ms.metadata = null;
      return;
    }
    let cancelled = false;
    let acquired = false;
    const fallback = [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ];
    const apply = (artwork: MediaImage[]) => {
      ms.metadata = new MediaMetadata({
        title: t.title,
        artist: t.artist,
        album: t.album,
        artwork,
      });
    };
    apply(fallback);
    if (artworkBlobId) {
      void acquireBlobUrl(artworkBlobId).then((url) => {
        if (cancelled) {
          if (url) releaseBlobUrl(artworkBlobId);
          return;
        }
        acquired = !!url;
        if (url) apply([{ src: url, sizes: '512x512' }]);
      });
    }
    return () => {
      cancelled = true;
      if (acquired && artworkBlobId) releaseBlobUrl(artworkBlobId);
    };
  }, [ms, trackId, artworkBlobId, latest]);

  useEffect(() => {
    if (ms) ms.playbackState = currentTrack ? (isPlaying ? 'playing' : 'paused') : 'none';
  }, [ms, isPlaying, currentTrack]);

  useEffect(() => {
    if (!ms || !audio) return;
    const updatePosition = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
      try {
        ms.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(audio.currentTime, audio.duration),
        });
      } catch {
        /* some browsers reject position updates mid-load */
      }
    };
    const seekBy = (delta: number) => {
      audio.currentTime = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + delta));
      updatePosition();
    };
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ['play', () => startAudio()],
      [
        'pause',
        () => {
          wantPlay.current = false;
          audio.pause();
        },
      ],
      ['previoustrack', () => prev()],
      ['nexttrack', () => next()],
      ['seekbackward', (d) => seekBy(-(d.seekOffset ?? 10))],
      ['seekforward', (d) => seekBy(d.seekOffset ?? 10)],
      [
        'seekto',
        (d) => {
          if (d.seekTime == null) return;
          if (d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime);
          else audio.currentTime = d.seekTime;
          updatePosition();
        },
      ],
      [
        'stop',
        () => {
          wantPlay.current = false;
          audio.pause();
          audio.currentTime = 0;
        },
      ],
    ];
    for (const [action, handler] of handlers) {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        /* action not supported in this browser */
      }
    }
    audio.addEventListener('loadedmetadata', updatePosition);
    audio.addEventListener('seeked', updatePosition);
    audio.addEventListener('play', updatePosition);
    audio.addEventListener('ratechange', updatePosition);
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* ignore */
        }
      }
      audio.removeEventListener('loadedmetadata', updatePosition);
      audio.removeEventListener('seeked', updatePosition);
      audio.removeEventListener('play', updatePosition);
      audio.removeEventListener('ratechange', updatePosition);
    };
  }, [ms, audio, next, prev, startAudio]);

  /* ------------------------------ public API ------------------------------ */

  const playTracks = useCallback(
    (trackIds: string[], startIndex = 0, opts: PlayOptions = {}) => {
      const ids = trackIds.filter((id) => !latest.current.byId.get(id)?.audioMissing);
      if (ids.length === 0) {
        toast({ tone: 'error', message: 'None of these songs have audio on this device.' });
        return;
      }
      const shuffleOn = opts.shuffle ?? shuffle;
      if (opts.shuffle !== undefined) setShuffle(opts.shuffle);
      // Keep the chosen track even if missing ones before it were filtered out.
      const chosen = trackIds[startIndex];
      const start =
        opts.shuffle && startIndex === 0
          ? Math.floor(Math.random() * ids.length)
          : Math.max(0, chosen ? ids.indexOf(chosen) : 0);
      errorStreak.current = 0;
      wantPlay.current = true;
      dispatch({ type: 'set', trackIds: ids, startIndex: start, shuffle: shuffleOn });
    },
    [latest, shuffle, toast],
  );

  return useMemo<PlayerValue>(
    () => ({
      audio,
      queue: queue.items,
      index: queue.index,
      current,
      currentTrack,
      isPlaying,
      isBuffering,
      repeat,
      shuffle,
      volume,
      muted,
      play: () => {
        if (latest.current.queue.items.length === 0 && latest.current.tracks?.length) {
          playTracks(latest.current.tracks.map((t) => t.id));
          return;
        }
        startAudio();
      },
      pause: () => {
        wantPlay.current = false;
        audio?.pause();
      },
      toggle: () => {
        if (latest.current.isPlaying) {
          wantPlay.current = false;
          audio?.pause();
        } else if (latest.current.queue.items.length === 0 && latest.current.tracks?.length) {
          playTracks(latest.current.tracks.map((t) => t.id));
        } else startAudio();
      },
      next: () => next(false),
      prev,
      seek: (seconds) => {
        if (!audio || !Number.isFinite(seconds)) return;
        audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || seconds));
      },
      setVolume: (v) => {
        setVolumeState(Math.max(0, Math.min(1, v)));
        if (v > 0) setMuted(false);
      },
      toggleMute: () => setMuted((m) => !m),
      cycleRepeat: () => setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')),
      toggleShuffle: () => {
        const on = !latest.current.shuffle;
        setShuffle(on);
        dispatch({ type: 'setShuffle', on });
      },
      playTracks,
      enqueue: (trackIds) => dispatch({ type: 'enqueue', trackIds }),
      playNext: (trackIds) => dispatch({ type: 'playNext', trackIds }),
      removeFromQueue: (uid) => dispatch({ type: 'remove', uid }),
      moveInQueue: (from, to) => dispatch({ type: 'move', from, to }),
      jumpTo: (index) => goTo(index, true),
      clearQueue: () => dispatch({ type: 'clearUpcoming' }),
    }),
    [
      audio,
      queue,
      current,
      currentTrack,
      isPlaying,
      isBuffering,
      repeat,
      shuffle,
      volume,
      muted,
      latest,
      next,
      prev,
      goTo,
      playTracks,
      startAudio,
    ],
  );
}
