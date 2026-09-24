import { useCallback, useEffect, useState } from 'react';
import { updateSettings } from '@/db/indexedDb';
import { useSettings } from '@/hooks/useIndexedDb';
import type { ThemePreference } from '@/types';

/** Mirrored in localStorage so index.html can apply it before first paint. */
const STORAGE_KEY = 'tunebox-theme';

function readLocal(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply(pref: ThemePreference) {
  const dark =
    pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', dark ? '#121212' : '#f7f7f5');
  });
}

/** Theme preference (light / dark / follow system), persisted in IndexedDB settings. */
export function useTheme() {
  const settings = useSettings();
  // IndexedDB is the source of truth (a restored backup can change it);
  // the localStorage mirror covers the moment before the settings load.
  const [initial] = useState<ThemePreference>(readLocal);
  const pref = settings?.theme ?? initial;

  useEffect(() => {
    apply(pref);
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* storage blocked: theme just won't survive reloads */
    }
    if (pref !== 'system') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [pref]);

  const setTheme = useCallback((next: ThemePreference) => {
    void updateSettings({ theme: next });
  }, []);

  return { theme: pref, setTheme };
}
