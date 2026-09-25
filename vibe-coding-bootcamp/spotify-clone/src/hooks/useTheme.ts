import { useCallback, useEffect, useState } from 'react';
import { updateSettings } from '@/db/indexedDb';
import { useSettings } from '@/hooks/useIndexedDb';
import { applyLanguage, getLocale, type LanguagePreference } from '@/i18n/core';
import type { ContrastPreference, ThemePreference } from '@/types';

/** Mirrored in localStorage so index.html can apply them before first paint. */
const THEME_KEY = 'tunebox-theme';
const CONTRAST_KEY = 'tunebox-contrast';

function readLocal<T extends string>(key: string, allowed: T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: the setting just won't be known before the settings load */
  }
}

function apply(theme: ThemePreference, contrast: ContrastPreference) {
  const dark =
    theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const high =
    contrast === 'high' ||
    (contrast === 'system' && matchMedia('(prefers-contrast: more)').matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.classList.toggle('hc', high);
  const color = dark ? (high ? '#000000' : '#121212') : high ? '#ffffff' : '#f7f7f5';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', color);
  });
}

/**
 * Theme (light / dark / system) and contrast (standard / high / system), persisted in
 * IndexedDB settings. "System" follows prefers-color-scheme and prefers-contrast live.
 */
export function useTheme() {
  const settings = useSettings();
  // IndexedDB is the source of truth (a restored backup can change it);
  // the localStorage mirror covers the moment before the settings load.
  const [initialTheme] = useState(() =>
    readLocal<ThemePreference>(THEME_KEY, ['light', 'dark', 'system'], 'system'),
  );
  const [initialContrast] = useState(() =>
    readLocal<ContrastPreference>(CONTRAST_KEY, ['standard', 'high', 'system'], 'system'),
  );
  const theme = settings?.theme ?? initialTheme;
  const contrast = settings?.contrast ?? initialContrast;

  useEffect(() => {
    apply(theme, contrast);
    writeLocal(THEME_KEY, theme);
    writeLocal(CONTRAST_KEY, contrast);
    if (theme !== 'system' && contrast !== 'system') return;
    const queries = [
      matchMedia('(prefers-color-scheme: dark)'),
      matchMedia('(prefers-contrast: more)'),
    ];
    const onChange = () => apply(theme, contrast);
    queries.forEach((q) => q.addEventListener('change', onChange));
    return () => queries.forEach((q) => q.removeEventListener('change', onChange));
  }, [theme, contrast]);

  const setTheme = useCallback((next: ThemePreference) => void updateSettings({ theme: next }), []);
  const setContrast = useCallback(
    (next: ContrastPreference) => void updateSettings({ contrast: next }),
    [],
  );

  return { theme, contrast, setTheme, setContrast };
}

/** Language preference (auto / en / fr), persisted in settings and applied to the app. */
export function useLanguage() {
  const settings = useSettings();
  const language: LanguagePreference = settings?.language ?? 'auto';

  useEffect(() => {
    if (!settings) return; // keep the pre-paint choice until the settings load
    applyLanguage(language);
    if (language !== 'auto') return;
    const onChange = () => applyLanguage('auto');
    window.addEventListener('languagechange', onChange);
    return () => window.removeEventListener('languagechange', onChange);
  }, [settings, language]);

  const setLanguage = useCallback(
    (next: LanguagePreference) => void updateSettings({ language: next }),
    [],
  );

  return { language, locale: getLocale(), setLanguage };
}

/** Keeps theme, contrast and language applied app-wide (rendered once, near the root). */
export function Preferences(): null {
  useTheme();
  useLanguage();
  return null;
}
