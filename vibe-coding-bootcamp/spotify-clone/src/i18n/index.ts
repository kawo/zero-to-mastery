import { useCallback, useSyncExternalStore } from 'react';
import { UNKNOWN_ALBUM, UNKNOWN_ARTIST } from '@/lib/id3';
import {
  formatNumber,
  getLocale,
  subscribeLocale,
  t,
  translate,
  type Locale,
  type MessageKey,
  type Params,
} from '@/i18n/core';

export {
  applyLanguage,
  detectLocale,
  formatNumber,
  getLocale,
  LOCALE_NAMES,
  LOCALES,
  resolveLocale,
  t,
  type LanguagePreference,
  type Locale,
  type MessageKey,
} from '@/i18n/core';
export * from '@/i18n/format';
export { rich } from '@/i18n/rich';

/** Tag placeholders stored for untagged files, shown in the current language. */
export function artistName(artist: string): string {
  return artist === UNKNOWN_ARTIST ? t('common.unknownArtist') : artist;
}
export function albumName(album: string): string {
  return album === UNKNOWN_ALBUM ? t('common.unknownAlbum') : album;
}

/** `t` bound to the current language; the component re-renders when it changes. */
export function useI18n(): {
  t: (key: MessageKey, params?: Params) => string;
  locale: Locale;
  num: (n: number) => string;
} {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  const t = useCallback(
    (key: MessageKey, params?: Params) => translate(locale, key, params),
    [locale],
  );
  const num = useCallback((n: number) => formatNumber(n, locale), [locale]);
  return { t, locale, num };
}
