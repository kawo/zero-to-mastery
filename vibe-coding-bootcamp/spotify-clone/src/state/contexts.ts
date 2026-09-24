/**
 * React contexts live here (not next to their providers) so provider files
 * only export components, which keeps Vite fast-refresh happy.
 */
import { createContext, useContext } from 'react';
import type { QueueItem, RepeatMode, Track } from '@/types';

/* ------------------------------ Library ----------------------------- */

export interface LibraryValue {
  /** Undefined while the first query is loading. */
  tracks: Track[] | undefined;
  byId: ReadonlyMap<string, Track>;
  error: string | null;
}
export const LibraryContext = createContext<LibraryValue | null>(null);

/* ------------------------------- Player ----------------------------- */

export interface PlayOptions {
  /** Start with shuffle order (turns shuffle on). */
  shuffle?: boolean;
}

export interface PlayerValue {
  audio: HTMLAudioElement | null;
  queue: QueueItem[];
  index: number;
  current: QueueItem | null;
  currentTrack: Track | null;
  isPlaying: boolean;
  isBuffering: boolean;
  repeat: RepeatMode;
  shuffle: boolean;
  volume: number;
  muted: boolean;

  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  cycleRepeat: () => void;
  toggleShuffle: () => void;

  /** Replace the queue with `trackIds` and start at `startIndex`. */
  playTracks: (trackIds: string[], startIndex?: number, opts?: PlayOptions) => void;
  enqueue: (trackIds: string[]) => void;
  playNext: (trackIds: string[]) => void;
  removeFromQueue: (uid: string) => void;
  moveInQueue: (from: number, to: number) => void;
  jumpTo: (index: number) => void;
  /** Clears upcoming tracks, keeps the current one. */
  clearQueue: () => void;
}
export const PlayerContext = createContext<PlayerValue | null>(null);

/* ------------------------------- Toasts ----------------------------- */

export type ToastTone = 'info' | 'success' | 'error';
export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  /** ms; 0 keeps it until dismissed. */
  duration?: number;
}
export interface ToastValue {
  toast: (t: ToastInput | string) => void;
}
export const ToastContext = createContext<ToastValue | null>(null);

/* --------------------------------- UI -------------------------------- */

export interface UiValue {
  queueOpen: boolean;
  setQueueOpen: (open: boolean) => void;
  toggleQueue: () => void;
  /** Opens the "Add to playlist" dialog for these tracks. */
  addToPlaylist: (trackIds: string[]) => void;
}
export const UiContext = createContext<UiValue | null>(null);

export function required<T>(ctx: React.Context<T | null>, name: string): T {
  // eslint-disable-next-line react-hooks/rules-of-hooks -- called only from the hooks below
  const value = useContext(ctx);
  if (!value) throw new Error(`${name} must be used inside its provider.`);
  return value;
}

export const useToast = () => required(ToastContext, 'useToast').toast;
export const useUi = () => required(UiContext, 'useUi');
