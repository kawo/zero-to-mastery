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
import {
  getResumePosition,
  recordPlay,
  RESUME_MIN_DURATION,
  saveResumePosition,
} from '@/db/library';
import { acquireBlobUrl, formatTime, releaseBlobUrl } from '@/lib/audio';
import { DEFAULT_EQ, MAX_SPEED, MIN_SPEED, type EqSettings } from '@/lib/eq';
import { normalizationGainDb, queueLoudnessAnalysis } from '@/lib/loudness';
import { noteMediaSessionAction } from '@/lib/mediaSession';
import {
  ensureSoundGraph,
  resumeSoundGraph,
  setDeckGain,
  setEqualizer,
  soundGraphActive,
} from '@/lib/soundGraph';
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
export const MAX_CROSSFADE = 12; // seconds
const FADE_STEP_MS = 40;

type Deck = 0 | 1;
const other = (d: Deck): Deck => (d === 0 ? 1 : 0);

/** iOS ignores `audio.volume` (hardware buttons only), so fades are impossible there. */
function volumeIsControllable(): boolean {
  if (typeof document === 'undefined') return false;
  const probe = document.createElement('audio');
  probe.volume = 0.5;
  return probe.volume === 0.5;
}

/** Keeps a ref pointing at the latest value, for use inside long-lived event handlers. */
function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

export function usePlayerEngine(
  decks: readonly [HTMLAudioElement | null, HTMLAudioElement | null],
): PlayerValue {
  const { tracks, byId } = useLibrary();
  const toast = useToast();

  // Two decks: `audio` plays the current track, the other preloads the next one.
  const [activeDeck, setActiveDeck] = useState<Deck>(0);
  const audio = decks[activeDeck];
  const standby = decks[other(activeDeck)];
  const [canCrossfade] = useState(volumeIsControllable);
  const [crossfade, setCrossfadeState] = useState(0);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [normalize, setNormalize] = useState(false);
  const [eq, setEqState] = useState<EqSettings>(DEFAULT_EQ);
  /** Track id loaded in each deck, so each gets its own normalization gain. */
  const deckTracks = useRef<[string | null, string | null]>([null, null]);

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
  /**
   * The long track now loaded in <audio>, once any resume seek has been applied.
   * Null while a source is loading, so a half-loaded track never overwrites its saved spot.
   */
  const resumable = useRef<{ uid: string; trackId: string } | null>(null);
  /** The next track, already loaded into the standby deck. */
  const preload = useRef<{ uid: string; blobId: string; deck: Deck; handedOff?: boolean } | null>(
    null,
  );
  /** A preloaded track that just became current: the load effect adopts it instead of loading. */
  const handoff = useRef<{ uid: string; deck: Deck } | null>(null);
  /** A running crossfade: `from` fades out while `to` (now the active deck) fades in. */
  const fade = useRef<{ from: HTMLAudioElement; to: HTMLAudioElement; timer: number } | null>(null);
  /** True between starting an automatic transition and adopting the new deck. */
  const switching = useRef(false);
  /** Bumped when a fade ends, so the freed deck can preload again. */
  const [fadeEnded, setFadeEnded] = useState(0);

  const latest = useLatest({
    queue,
    repeat,
    shuffle,
    currentTrack,
    byId,
    tracks,
    isPlaying,
    volume,
    muted,
    crossfade: canCrossfade ? crossfade : 0,
    normalize,
  });

  /* ---------------------------- primitives ---------------------------- */

  /** Records which track a deck holds and sets its normalization gain. */
  const assignDeck = useCallback(
    (deck: Deck, trackId: string | null) => {
      deckTracks.current[deck] = trackId;
      const t = trackId ? latest.current.byId.get(trackId) : undefined;
      setDeckGain(decks[deck], latest.current.normalize ? normalizationGainDb(t?.loudness) : 0);
    },
    [decks, latest],
  );

  const saveResume = useCallback(() => {
    const r = resumable.current;
    if (!audio || !r || !audio.duration) return;
    void saveResumePosition(r.trackId, audio.currentTime, audio.duration);
  }, [audio]);

  const savePosition = useCallback(() => {
    if (!audio || !latest.current.currentTrack) return;
    lastPositionSave.current = Date.now();
    void updateSettings({ lastPosition: audio.currentTime || 0 });
    saveResume();
  }, [audio, latest, saveResume]);

  const startAudio = useCallback(() => {
    if (!audio) return;
    wantPlay.current = true;
    if (!audio.getAttribute('src')) return; // the load effect will start it
    void resumeSoundGraph();
    audio.play().catch((err: unknown) => {
      const name = err instanceof Error ? err.name : '';
      if (name === 'AbortError') return; // a newer load interrupted this one
      wantPlay.current = false;
      setIsPlaying(false);
      if (name !== 'NotAllowedError')
        toast({ tone: 'error', message: 'Playback could not start.' });
    });
  }, [audio, toast]);

  /** Finishes a crossfade now: silences the outgoing deck and restores full volume. */
  const endFade = useCallback(() => {
    const f = fade.current;
    if (!f) return;
    clearInterval(f.timer);
    fade.current = null;
    f.from.pause();
    f.from.removeAttribute('src');
    f.from.load();
    f.to.volume = latest.current.volume;
    setFadeEnded((n) => n + 1);
  }, [latest]);

  /**
   * If `uid` is the preloaded track, switch decks so it plays from there (no load gap).
   * Must run in the same update as the queue change, before the preload effect cleans up.
   */
  const takeHandoff = useCallback(
    (uid: string | undefined): boolean => {
      const p = preload.current;
      if (!uid || !p || p.uid !== uid || p.deck === activeDeck) return false;
      p.handedOff = true;
      handoff.current = { uid, deck: p.deck };
      setActiveDeck(p.deck);
      return true;
    },
    [activeDeck],
  );

  const goTo = useCallback(
    (index: number, play: boolean) => {
      wantPlay.current = play;
      if (index === latest.current.queue.index && audio) {
        audio.currentTime = 0;
        if (play) startAudio();
        return;
      }
      endFade();
      takeHandoff(latest.current.queue.items[index]?.uid);
      dispatch({ type: 'jump', index });
    },
    [audio, endFade, latest, startAudio, takeHandoff],
  );

  /**
   * Automatic advance to the preloaded next track: gapless, or overlapping the
   * last `crossfade` seconds with an equal-power fade. False if nothing is preloaded.
   */
  const beginTransition = useCallback((): boolean => {
    const { queue: q, repeat: r, crossfade: xf } = latest.current;
    const p = preload.current;
    const n = nextIndex(q, r);
    const from = audio;
    const to = p ? decks[p.deck] : null;
    if (!p || !from || !to || r === 'one' || n === null || q.items[n]?.uid !== p.uid) return false;
    if (p.handedOff) return true; // already switching (timer and 'ended' both fired)
    switching.current = true;

    const remaining = (from.duration || 0) - from.currentTime;
    const length = Math.max(0, Math.min(xf, remaining));
    endFade();
    to.currentTime = 0;
    to.muted = latest.current.muted;
    if (length > 0.05) {
      const start = performance.now();
      to.volume = 0;
      const timer = window.setInterval(() => {
        const g = Math.min(1, (performance.now() - start) / (length * 1000));
        const v = latest.current.volume;
        from.volume = v * Math.cos((g * Math.PI) / 2);
        to.volume = v * Math.sin((g * Math.PI) / 2);
        if (g >= 1) endFade();
      }, FADE_STEP_MS);
      fade.current = { from, to, timer };
    } else {
      to.volume = latest.current.volume;
      from.pause();
    }
    wantPlay.current = true;
    void resumeSoundGraph();
    to.play().catch(() => {});
    takeHandoff(p.uid);
    dispatch({ type: 'jump', index: n });
    return true;
  }, [audio, decks, endFade, latest, takeHandoff]);

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
      setCrossfadeState(s.crossfade);
      setPlaybackRateState(s.playbackRate);
      setNormalize(s.normalize);
      setEqState({ ...DEFAULT_EQ, ...s.eq });
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
      endFade();
      audio.removeAttribute('src');
      audio.load();
      return;
    }
    const track = latest.current.currentTrack;
    const title = track?.title ?? 'This song';
    const long = !!track && track.duration >= RESUME_MIN_DURATION;
    resumable.current = null;
    if (audioMissing) {
      failCurrent(`“${title}” isn't stored on this device. Import the file again to relink it.`);
      return;
    }

    // The preloaded deck already holds this track: adopt it instead of loading (gapless).
    const h = handoff.current;
    if (h && h.uid === currentUid && decks[h.deck] === audio) {
      handoff.current = null;
      switching.current = false;
      const previous = decks[other(h.deck)];
      if (previous && fade.current?.from !== previous) {
        previous.pause();
        previous.removeAttribute('src');
        previous.load();
      }
      const onReady = () => {
        if (long) resumable.current = { uid: currentUid, trackId: track.id };
      };
      if (audio.error) {
        // It failed while preloading, before anything was listening for its errors.
        failCurrent(
          `Couldn't play “${title}”. The file may be damaged or in an unsupported format.`,
        );
        return () => releaseBlobUrl(audioBlobId);
      }
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) onReady();
      else audio.addEventListener('loadedmetadata', onReady, { once: true });
      if (wantPlay.current && audio.paused) startAudio();
      setIsPlaying(!audio.paused || wantPlay.current);
      return () => {
        if (resumable.current?.uid === currentUid) saveResume();
        resumable.current = null;
        audio.removeEventListener('loadedmetadata', onReady);
        releaseBlobUrl(audioBlobId); // acquired by the preload, handed over with the deck
      };
    }
    endFade();

    let cancelled = false;
    let acquired = false;
    let onMetadata: (() => void) | null = null;
    counted.current = null;
    // A session restore already knows where to seek; otherwise long tracks resume where they stopped.
    const sessionSeek = pendingSeek.current;
    pendingSeek.current = null;
    Promise.all([
      acquireBlobUrl(audioBlobId),
      long && !sessionSeek ? getResumePosition(track.id).catch(() => null) : null,
    ])
      .then(([url, resumeAt]) => {
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
        assignDeck(activeDeck, track?.id ?? null);
        const seekTo = sessionSeek ?? resumeAt;
        onMetadata = () => {
          if (seekTo) audio.currentTime = seekTo;
          if (long) resumable.current = { uid: currentUid, trackId: track.id };
        };
        audio.addEventListener('loadedmetadata', onMetadata, { once: true });
        if (resumeAt)
          toast({
            tone: 'info',
            message: `Resuming “${title}” at ${formatTime(resumeAt)}. Press Previous to start over.`,
          });
        if (wantPlay.current) startAudio();
      })
      .catch(() => failCurrent(`“${title}” could not be loaded from storage.`));
    return () => {
      cancelled = true;
      // Leaving a long track: remember where it stopped (or forget it if it finished).
      if (resumable.current?.uid === currentUid) saveResume();
      resumable.current = null;
      // A source that never loaded must not seek the next one.
      if (onMetadata) audio.removeEventListener('loadedmetadata', onMetadata);
      if (acquired) releaseBlobUrl(audioBlobId);
    };
  }, [
    audio,
    activeDeck,
    assignDeck,
    decks,
    currentUid,
    audioBlobId,
    audioMissing,
    endFade,
    failCurrent,
    latest,
    saveResume,
    startAudio,
    toast,
  ]);

  /* ------------------------ preload the next track ------------------------ */

  const upcomingIndex = repeat === 'one' ? null : nextIndex(queue, repeat);
  const upcoming = upcomingIndex === null ? null : queue.items[upcomingIndex];
  const upcomingUid = upcoming && upcoming.uid !== currentUid ? upcoming.uid : undefined;
  const upcomingTrack = upcoming ? byId.get(upcoming.trackId) : undefined;
  const upcomingBlobId =
    upcomingTrack && !upcomingTrack.audioMissing ? upcomingTrack.audioBlobId : undefined;

  useEffect(() => {
    // While a crossfade runs, the standby deck is the one fading out; wait for it.
    if (!standby || !upcomingUid || !upcomingBlobId || fade.current) return;
    const entry: NonNullable<typeof preload.current> = {
      uid: upcomingUid,
      blobId: upcomingBlobId,
      deck: other(activeDeck),
    };
    let cancelled = false;
    let acquired = false;
    acquireBlobUrl(upcomingBlobId)
      .then((url) => {
        if (cancelled) {
          if (url) releaseBlobUrl(upcomingBlobId);
          return;
        }
        if (!url) return;
        acquired = true;
        standby.src = url;
        assignDeck(entry.deck, upcomingTrack?.id ?? null);
        preload.current = entry;
      })
      .catch(() => {
        /* the track will load normally when it becomes current */
      });
    return () => {
      cancelled = true;
      if (preload.current === entry) preload.current = null;
      if (entry.handedOff) return; // the load effect owns the deck and URL now
      if (acquired) {
        if (fade.current?.from !== standby) {
          standby.removeAttribute('src');
          standby.load();
        }
        releaseBlobUrl(upcomingBlobId);
      }
    };
    // upcomingTrack is read when the source is set; its identity changes with every library update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standby, activeDeck, assignDeck, upcomingUid, upcomingBlobId, fadeEnded]);

  /* ---------------------------- sound effects ---------------------------- */

  // Speed. Loading a new source resets playbackRate to defaultPlaybackRate, so set both.
  useEffect(() => {
    for (const d of decks) {
      if (!d) continue;
      d.defaultPlaybackRate = playbackRate;
      d.playbackRate = playbackRate;
      d.preservesPitch = true;
    }
  }, [decks, playbackRate]);

  // Web Audio only once the EQ or normalization is actually used (see soundGraph.ts).
  useEffect(() => {
    if ((eq.enabled || normalize) && decks[0] && decks[1]) ensureSoundGraph(decks);
    if (soundGraphActive()) setEqualizer(eq.enabled, eq.gains);
  }, [decks, eq, normalize]);

  // Normalization gains follow the setting and newly measured tracks.
  useEffect(() => {
    if (!soundGraphActive()) return;
    decks.forEach((d, i) => {
      const id = deckTracks.current[i as Deck];
      const t = id ? byId.get(id) : undefined;
      setDeckGain(d, normalize ? normalizationGainDb(t?.loudness) : 0);
    });
  }, [decks, byId, normalize, eq.enabled]);

  // Measure the current and next track (once each) while normalization is on.
  useEffect(() => {
    if (!normalize) return;
    if (currentTrack) queueLoudnessAnalysis(currentTrack);
    if (upcomingTrack) queueLoudnessAnalysis(upcomingTrack);
  }, [normalize, currentTrack, upcomingTrack]);

  /* --------------------------- audio events --------------------------- */

  useEffect(() => {
    if (!audio) return;
    const onPlay = () => setIsPlaying(true);
    // Start the next track `crossfade` seconds before the end (or right at it, gapless).
    let transitionTimer = 0;
    const scheduleTransition = () => {
      clearTimeout(transitionTimer);
      if (audio.paused || !preload.current || fade.current) return;
      const d = audio.duration;
      if (!Number.isFinite(d) || d <= 0) return;
      const lead = Math.min(latest.current.crossfade, d / 3);
      const wait = (d - audio.currentTime - lead) / (audio.playbackRate || 1);
      if (wait > 2) return; // a later timeupdate schedules it more precisely
      transitionTimer = window.setTimeout(
        () => {
          if (!audio.paused) beginTransition();
        },
        Math.max(0, wait * 1000),
      );
    };
    const onPause = () => {
      clearTimeout(transitionTimer);
      if (switching.current) return; // the outgoing deck stopping during a gapless switch
      if (fade.current?.to === audio) endFade(); // pausing mid-crossfade stops both tracks
      setIsPlaying(false);
      savePosition();
    };
    const onPlaying = () => {
      setIsBuffering(false);
      errorStreak.current = 0;
    };
    const onWaiting = () => setIsBuffering(true);
    const onEnded = () => {
      if (!beginTransition()) next(true);
    };
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
      scheduleTransition();
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('seeked', scheduleTransition);
    return () => {
      clearTimeout(transitionTimer);
      audio.removeEventListener('seeked', scheduleTransition);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [audio, beginTransition, endFade, failCurrent, latest, next, savePosition]);

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
    if (restored)
      void updateSettings({
        repeat,
        shuffle,
        volume,
        muted,
        crossfade,
        playbackRate,
        normalize,
        eq,
      });
  }, [repeat, shuffle, volume, muted, crossfade, playbackRate, normalize, eq, restored]);

  useEffect(() => {
    for (const d of decks) if (d) d.muted = muted;
    if (audio && !fade.current) audio.volume = volume; // during a fade the fade sets volumes
  }, [audio, decks, volume, muted]);

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
        ms.setActionHandler(action, (details) => {
          noteMediaSessionAction();
          handler(details);
        });
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
      crossfade,
      canCrossfade,
      playbackRate,
      normalize,
      eq,
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
      setPlaybackRate: (rate) =>
        setPlaybackRateState(
          Math.round(Math.max(MIN_SPEED, Math.min(MAX_SPEED, rate)) * 100) / 100,
        ),
      setNormalize,
      setEq: (patch) => setEqState((e) => ({ ...e, ...patch })),
      setCrossfade: (seconds) =>
        setCrossfadeState(Math.round(Math.max(0, Math.min(MAX_CROSSFADE, seconds)))),
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
      crossfade,
      canCrossfade,
      playbackRate,
      normalize,
      eq,
      latest,
      next,
      prev,
      goTo,
      playTracks,
      startAudio,
    ],
  );
}
