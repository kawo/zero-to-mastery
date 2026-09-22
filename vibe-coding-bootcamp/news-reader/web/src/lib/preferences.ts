// web/src/lib/preferences.ts
/*
 * What the reader has told us they care about, remembered between visits.
 *
 * localStorage for now. The shape is deliberately small and versioned so that
 * moving it behind an account later is a matter of swapping load/save for
 * fetch calls — nothing else in the app touches the storage key.
 *
 * Every read is defensive. A hand-edited entry, a value left over from an older
 * build, or a browser that refuses storage entirely all have to degrade to the
 * defaults rather than stop the app from rendering.
 */

import { CATEGORIES, DEFAULT_CATEGORY, type Category } from './newsapi';
import { detectLang, isLang, type Lang } from './i18n';

const KEY = 'news-reader:preferences:v1';

/** More than this and "my topics" stops meaning anything. */
export const MAX_TOPICS = 6;

/** What the reader was last looking at: one category, or their topic mix. */
export type Selection = { kind: 'category'; category: Category } | { kind: 'topics' };

export interface Preferences {
  /** Pinned categories, in the order they were pinned. */
  topics: Category[];
  /** Restored on the next visit. */
  last: Selection;
  /** Interface and content language. */
  lang: Lang;
}

/* `lang` has no fixed default: an unset preference means "whatever the browser
   asked for", which is the only sensible first impression for a reader who has
   never chosen. */
export const DEFAULTS: Preferences = {
  topics: [],
  last: { kind: 'category', category: DEFAULT_CATEGORY },
  lang: 'en',
};

const isCategory = (value: unknown): value is Category =>
  typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);

/**
 * Read stored preferences, dropping anything that no longer makes sense.
 * Never throws.
 */
export function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, lang: detectLang() };

    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS, lang: detectLang() };
    const record = parsed as Record<string, unknown>;
    const lang: Lang = isLang(record.lang) ? record.lang : detectLang();

    // Unknown or removed categories are dropped rather than sent to the API.
    const topics = Array.isArray(record.topics)
      ? [...new Set(record.topics.filter(isCategory))].slice(0, MAX_TOPICS)
      : [];

    let last: Selection = { ...DEFAULTS.last };
    const stored = record.last as Record<string, unknown> | undefined;
    if (stored?.kind === 'topics') {
      // Pointing at a topic mix that no longer exists would render an empty
      // feed with no obvious way back, so fall back to a plain category.
      last = topics.length ? { kind: 'topics' } : { ...DEFAULTS.last };
    } else if (stored?.kind === 'category' && isCategory(stored.category)) {
      last = { kind: 'category', category: stored.category };
    }

    return { topics, last, lang };
  } catch {
    return { ...DEFAULTS, lang: detectLang() };
  }
}

/** Persist preferences. Failure is silent: losing a preference is not worth an error. */
export function savePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(preferences));
  } catch {
    /* private windows and full quotas both throw */
  }
}

/**
 * Add or remove a topic, keeping pin order and the cap.
 * @returns the new list, or the old one unchanged if the cap is already met
 */
export function toggleTopic(topics: Category[], category: Category): Category[] {
  if (topics.includes(category)) return topics.filter((t) => t !== category);
  if (topics.length >= MAX_TOPICS) return topics;
  return [...topics, category];
}

/**
 * The `categories` parameter for a selection.
 * A topic mix becomes a comma list, which TheNewsApi treats as OR.
 */
export function categoriesFor(selection: Selection, topics: Category[]): string {
  if (selection.kind === 'topics') {
    return topics.length ? topics.join(',') : DEFAULT_CATEGORY;
  }
  return selection.category;
}

/** Stable identity for a selection, used to key the page cache. */
export function selectionKey(selection: Selection, topics: Category[]): string {
  return selection.kind === 'topics' ? `t:${topics.join(',')}` : `c:${selection.category}`;
}
