/**
 * Minimal i18n: typed message keys, {placeholders}, CLDR plurals (Intl.PluralRules)
 * and locale-aware number/size/duration formatting. No dependency.
 *
 * - English (en.ts) defines every key; French (fr.ts) is typed against it, so a
 *   missing or extra translation fails the type check.
 * - Components use `useI18n()` (re-renders on language change). Non-React code
 *   (toasts built in lib/, error messages) calls `t()` at the moment it runs.
 */
import { en } from '@/i18n/en';
import { fr } from '@/i18n/fr';

export type Locale = 'en' | 'fr';
export type LanguagePreference = 'auto' | Locale;
export const LOCALES: Locale[] = ['en', 'fr'];
/** Native names, shown in the language menu whatever the current language. */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', fr: 'Français' };

/* ------------------------------- message types ------------------------------- */

export interface Plural {
  one: string;
  other: string;
}
type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** Same tree as English, with every leaf widened to a string (or plural pair). */
export type Messages<T = typeof en> = {
  [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : Messages<T[K]>;
};
export type MessageKey = Leaves<typeof en>;
export type Params = Record<string, string | number>;

const DICTS: Record<Locale, Messages> = { en, fr };

/* -------------------------------- locale store -------------------------------- */

const STORAGE_KEY = 'tunebox-language';

/** The best supported language from the browser/OS preferences. */
export function detectLocale(): Locale {
  const prefs =
    typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const tag of prefs) {
    const base = tag.toLowerCase().split('-')[0] as Locale;
    if (LOCALES.includes(base)) return base;
  }
  return 'en';
}

export function resolveLocale(pref: LanguagePreference | undefined): Locale {
  return pref && pref !== 'auto' ? pref : detectLocale();
}

function readStoredPreference(): LanguagePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'en' || v === 'fr' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

let current: Locale = resolveLocale(readStoredPreference());
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Applies a language preference: <html lang>, the pre-paint mirror, and every subscriber. */
export function applyLanguage(pref: LanguagePreference): void {
  try {
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* the language just won't be known before the settings load */
  }
  const next = resolveLocale(pref);
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  if (next === current) return;
  current = next;
  listeners.forEach((fn) => fn());
}

/* ------------------------------------ t() ------------------------------------ */

const pluralRules = new Map<Locale, Intl.PluralRules>();
const numberFormats = new Map<Locale, Intl.NumberFormat>();

export function formatNumber(n: number, locale: Locale = current): string {
  let f = numberFormats.get(locale);
  if (!f) numberFormats.set(locale, (f = new Intl.NumberFormat(locale)));
  return f.format(n);
}

function lookup(dict: Messages, key: string): string | Plural | undefined {
  let node: unknown = dict;
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  return node as string | Plural | undefined;
}

/** Translates `key` in `locale` (default: the current language). */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  const value = lookup(DICTS[locale], key) ?? lookup(en, key) ?? key;
  let text: string;
  if (typeof value === 'string') text = value;
  else {
    let rules = pluralRules.get(locale);
    if (!rules) pluralRules.set(locale, (rules = new Intl.PluralRules(locale)));
    text = rules.select(Number(params?.count ?? 0)) === 'one' ? value.one : value.other;
  }
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    return v === undefined ? m : typeof v === 'number' ? formatNumber(v, locale) : v;
  });
}

export function t(key: MessageKey, params?: Params): string {
  return translate(current, key, params);
}
