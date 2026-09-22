// web/src/main.tsx
import { StrictMode, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider, type Lang } from './lib/i18n';
import { loadPreferences, savePreferences } from './lib/preferences';

/*
 * The language lives above <App> because the provider has to wrap everything
 * that calls useI18n(), App included. Keeping it here also means switching
 * language re-renders the whole tree from one state change, rather than App
 * having to thread a locale through its children by hand.
 */
function Root() {
  const [lang, setLangState] = useState<Lang>(() => loadPreferences().lang);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    // Merge rather than overwrite: App owns topics and the last selection, and
    // must not have them clobbered by a language change.
    savePreferences({ ...loadPreferences(), lang: next });
    document.documentElement.lang = next;
  }, []);

  // Keep the document in step on first paint too, for screen readers and for
  // the browser's own translation prompt.
  if (document.documentElement.lang !== lang) document.documentElement.lang = lang;

  return (
    <I18nProvider lang={lang}>
      <App lang={lang} onLanguageChange={setLang} />
    </I18nProvider>
  );
}

const host = document.getElementById('root');
if (!host) throw new Error('#root is missing from index.html');

createRoot(host).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
