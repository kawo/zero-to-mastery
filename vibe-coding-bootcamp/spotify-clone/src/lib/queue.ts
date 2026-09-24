/**
 * Pure play-queue model: an ordered list of items plus the index of the current one.
 * Kept free of React/audio so it is easy to reason about and test.
 */
import { moveItem, shuffleArray, uid } from '@/lib/utils';
import type { QueueItem, QueueState, RepeatMode } from '@/types';

export const EMPTY_QUEUE: QueueState = { items: [], index: -1 };

const toItems = (trackIds: string[]): QueueItem[] =>
  trackIds.map((trackId) => ({ uid: uid(), trackId }));

export type QueueAction =
  /** Replace the queue (e.g. "play this album from track 3"). */
  | { type: 'set'; trackIds: string[]; startIndex: number; shuffle: boolean }
  /** Restore a saved session without touching shuffle order. */
  | { type: 'restore'; trackIds: string[]; index: number }
  | { type: 'enqueue'; trackIds: string[] }
  | { type: 'playNext'; trackIds: string[] }
  | { type: 'remove'; uid: string }
  | { type: 'move'; from: number; to: number }
  | { type: 'jump'; index: number }
  /** Remove everything after the current item. */
  | { type: 'clearUpcoming' }
  | { type: 'clearAll' }
  | { type: 'setShuffle'; on: boolean }
  /** Drop items whose tracks were deleted from the library. */
  | { type: 'prune'; validIds: ReadonlySet<string> };

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'set': {
      if (action.trackIds.length === 0) return EMPTY_QUEUE;
      const start = clamp(action.startIndex, 0, action.trackIds.length - 1);
      const items = toItems(action.trackIds);
      if (!action.shuffle) return { items, index: start };
      // Shuffle: chosen track first, the rest random; remember the natural order.
      const unshuffled = items.map((i) => i.uid);
      const [first] = items.splice(start, 1);
      return { items: [first!, ...shuffleArray(items)], index: 0, unshuffled };
    }
    case 'restore':
      return action.trackIds.length
        ? {
            items: toItems(action.trackIds),
            index: clamp(action.index, 0, action.trackIds.length - 1),
          }
        : EMPTY_QUEUE;
    case 'enqueue': {
      const added = toItems(action.trackIds);
      return {
        ...state,
        items: [...state.items, ...added],
        index: state.index < 0 ? 0 : state.index,
        unshuffled: state.unshuffled && [...state.unshuffled, ...added.map((i) => i.uid)],
      };
    }
    case 'playNext': {
      const added = toItems(action.trackIds);
      const at = state.index + 1;
      const items = [...state.items.slice(0, at), ...added, ...state.items.slice(at)];
      return { ...state, items, index: state.index < 0 ? 0 : state.index };
    }
    case 'remove': {
      const i = state.items.findIndex((it) => it.uid === action.uid);
      if (i < 0) return state;
      const items = state.items.filter((_, j) => j !== i);
      let index = state.index;
      if (i < index) index--;
      else if (i === index) index = Math.min(index, items.length - 1);
      return {
        items,
        index: items.length ? index : -1,
        unshuffled: state.unshuffled?.filter((u) => u !== action.uid),
      };
    }
    case 'move': {
      const { from, to } = action;
      if (from === to || !state.items[from] || to < 0 || to >= state.items.length) return state;
      const current = state.items[state.index]?.uid;
      const items = moveItem(state.items, from, to);
      return { ...state, items, index: items.findIndex((it) => it.uid === current) };
    }
    case 'jump':
      return state.items[action.index] ? { ...state, index: action.index } : state;
    case 'clearUpcoming': {
      if (state.index < 0) return state;
      const items = state.items.slice(0, state.index + 1);
      const keep = new Set(items.map((i) => i.uid));
      return { ...state, items, unshuffled: state.unshuffled?.filter((u) => keep.has(u)) };
    }
    case 'clearAll':
      return EMPTY_QUEUE;
    case 'setShuffle': {
      if (state.items.length === 0) return state;
      const current = state.items[state.index];
      if (action.on) {
        // Keep history and the current track in place, shuffle only what's upcoming.
        const head = state.items.slice(0, state.index + 1);
        const tail = shuffleArray(state.items.slice(state.index + 1));
        return { ...state, items: [...head, ...tail], unshuffled: state.items.map((i) => i.uid) };
      }
      const order = state.unshuffled;
      if (!order) return state;
      const rank = new Map(order.map((u, i) => [u, i]));
      const items = state.items
        .map((it, i) => ({ it, r: rank.get(it.uid) ?? order.length + i }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.it);
      return { items, index: items.findIndex((it) => it.uid === current?.uid) };
    }
    case 'prune': {
      if (state.items.every((it) => action.validIds.has(it.trackId))) return state;
      const current = state.items[state.index];
      const items = state.items.filter((it) => action.validIds.has(it.trackId));
      let index = items.findIndex((it) => it.uid === current?.uid);
      if (index < 0) {
        // The current track was deleted: continue with whatever came after it.
        const before = state.items
          .slice(0, state.index)
          .filter((it) => action.validIds.has(it.trackId)).length;
        index = Math.min(before, items.length - 1);
      }
      return {
        items,
        index: items.length ? index : -1,
        unshuffled: state.unshuffled?.filter((u) => items.some((it) => it.uid === u)),
      };
    }
  }
}

/**
 * Index to move to on "next". `null` means the queue has finished.
 * With repeat 'one' a manual skip still advances; only natural ends loop the track.
 */
export function nextIndex(state: QueueState, repeat: RepeatMode): number | null {
  if (state.items.length === 0) return null;
  if (state.index + 1 < state.items.length) return state.index + 1;
  return repeat === 'all' ? 0 : null;
}

export function prevIndex(state: QueueState, repeat: RepeatMode): number | null {
  if (state.items.length === 0) return null;
  if (state.index > 0) return state.index - 1;
  return repeat === 'all' ? state.items.length - 1 : null;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
