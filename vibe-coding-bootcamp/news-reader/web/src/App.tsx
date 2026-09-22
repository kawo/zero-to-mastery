// web/src/App.tsx
/*
 * Owns everything stateful: the query, the page cache, prefetching and favourites.
 *
 * Paging model
 * ------------
 * The API returns three articles per page and the reader sees one at a time, so
 * a position is (page, indexInPage). Moving past either end of a page steps the
 * page number and lands on the far edge of the next one.
 *
 * Pages already fetched live in `pages`, keyed by page number. Navigating to a
 * cached page swaps instantly — no spinner, no flash of the old article —
 * because the render reads straight out of that map. Only an uncached page
 * shows the skeleton, and only when nothing is on screen yet.
 *
 * The cache is rebuilt whenever the query changes, which is what makes
 * "jumping back to page 1" free while keeping results honest.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeadlinesList from './components/HeadlinesList';
import {
  CATEGORIES,
  PAGE_SIZE,
  fetchNews,
  filterKey,
  hasFilters,
  NewsError,
  type Article,
  type Category,
  type Filters,
} from './lib/newsapi';
import {
  MAX_TOPICS,
  categoriesFor,
  loadPreferences,
  savePreferences,
  selectionKey,
  toggleTopic,
  type Selection,
} from './lib/preferences';
import { LANGUAGES, LANG_CODES, useI18n, type Lang } from './lib/i18n';
import './styles.css';

const FAVORITES_KEY = 'news-reader:favorites:v1';

export interface AppProps {
  lang: Lang;
  onLanguageChange: (lang: Lang) => void;
}

export default function App({ lang, onLanguageChange }: AppProps) {
  const { t } = useI18n();
  /* Read once. Everything after this is React state; preferences are written
     back on change rather than read again. */
  const stored = useRef(loadPreferences()).current;

  /* ---- query ---- */
  const [topics, setTopics] = useState<Category[]>(stored.topics);
  const [selection, setSelection] = useState<Selection>(stored.last);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');

  /* Filters are committed, like the search: a half-typed domain or date should
     not fire a request. `draft` is what the form holds, `filters` is what is
     being asked for. */
  const [filterDraft, setFilterDraft] = useState<Filters>({});
  const [filters, setFilters] = useState<Filters>({});

  /* ---- position ---- */
  const [page, setPage] = useState(1);
  const [indexInPage, setIndexInPage] = useState(0);

  /* ---- results ---- */
  const [pages, setPages] = useState<Map<number, Article[]>>(() => new Map());
  const [found, setFound] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ---- shell ---- */
  const [favorites, setFavorites] = useState<Article[]>(loadFavorites);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favIndex, setFavIndex] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  /* The categories parameter for the current selection: one category, or the
     reader's pinned topics as a comma list, which TheNewsApi ORs together. */
  const categories = categoriesFor(selection, topics);

  /* The committed query. Changing it resets everything downstream — which is
     what carries the filters across pagination: the cache is keyed by this, so
     paging never loses them and changing one starts a clean set of pages. */
  const queryKey = `${search ? `s:${search}` : selectionKey(selection, topics)}|${filterKey(filters)}|${lang}`;

  /* Persist what they picked, so the next visit opens where they left off.
     `lang` is included because this writes the whole record: omitting it would
     reset the language every time a topic was pinned. */
  useEffect(() => {
    savePreferences({ topics, last: selection, lang });
  }, [topics, selection, lang]);

  /* A new query invalidates the cache and puts the reader back at article 1. */
  useEffect(() => {
    setPages(new Map());
    setFound(0);
    setPage(1);
    setIndexInPage(0);
    setError(null);
    setLoading(true);
  }, [queryKey]);

  /* In-flight requests, so a fast category switch cannot have a stale response
     overwrite a newer one. */
  const inFlight = useRef(new Map<string, AbortController>());

  useEffect(
    () => () => {
      inFlight.current.forEach((controller) => controller.abort());
      inFlight.current.clear();
    },
    [],
  );

  /**
   * Fetch one page into the cache.
   * `background` is a prefetch: it must never touch the spinner or the error banner.
   */
  const load = useCallback(
    async (target: number, background: boolean) => {
      const requestKey = `${queryKey}|${target}`;
      if (inFlight.current.has(requestKey)) return;

      const controller = new AbortController();
      inFlight.current.set(requestKey, controller);

      try {
        const response = await fetchNews({
          page: target,
          search: search || undefined,
          categories,
          filters,
          language: lang,
          signal: controller.signal,
        });

        setPages((previous) => {
          const next = new Map(previous);
          next.set(target, response.data);
          return next;
        });
        setFound(response.meta.found ?? 0);
        if (!background) setError(null);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // A failed prefetch is invisible on purpose: the reader has not asked
        // for that page yet, and there is nothing useful to say about it.
        if (background) return;
        setError(err instanceof NewsError ? err.message : 'Unexpected error loading articles.');
      } finally {
        inFlight.current.delete(requestKey);
        if (!background) setLoading(false);
      }
    },
    [queryKey, search, categories, filters, lang],
  );

  /* Load the page being read, unless it is already cached. */
  useEffect(() => {
    if (showFavorites) return;
    if (pages.has(page)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void load(page, false);
  }, [page, queryKey, pages, showFavorites, load]);

  /* Prefetch, exactly where the brief asks for it: forward once the reader is on
     the second article of a page, backward while sitting on the first. */
  useEffect(() => {
    if (showFavorites || loading) return;

    if (indexInPage === 1) {
      const next = page + 1;
      const withinResults = found === 0 || (next - 1) * PAGE_SIZE < found;
      if (withinResults && !pages.has(next)) void load(next, true);
    }

    if (indexInPage === 0 && page > 1 && !pages.has(page - 1)) {
      void load(page - 1, true);
    }
  }, [indexInPage, page, pages, found, loading, showFavorites, load]);

  /* ---- what is on screen ---- */

  const livePageArticles = pages.get(page) ?? [];
  const liveArticle = livePageArticles[indexInPage] ?? null;

  const favorite = favorites[favIndex] ?? null;
  const favPageArticles = useMemo(
    () => favorites.slice(Math.floor(favIndex / PAGE_SIZE) * PAGE_SIZE, Math.floor(favIndex / PAGE_SIZE) * PAGE_SIZE + PAGE_SIZE),
    [favorites, favIndex],
  );

  const article = showFavorites ? favorite : liveArticle;
  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.uuid)), [favorites]);
  const isFavorite = article ? favoriteIds.has(article.uuid) : false;

  /* ---- favourites ---- */

  useEffect(() => {
    try {
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {
      /* private windows and full quotas both throw; losing a bookmark is not
         worth interrupting the reader over */
    }
  }, [favorites]);

  const toggleFavorite = useCallback((item: Article) => {
    setFavorites((previous) => {
      const exists = previous.some((f) => f.uuid === item.uuid);
      return exists ? previous.filter((f) => f.uuid !== item.uuid) : [item, ...previous];
    });
  }, []);

  /* Removing the last favourite while reading it must not strand the pager. */
  useEffect(() => {
    if (favIndex > 0 && favIndex >= favorites.length) {
      setFavIndex(Math.max(0, favorites.length - 1));
    }
  }, [favorites.length, favIndex]);

  /* ---- navigation ---- */

  const goFirst = useCallback(() => {
    if (showFavorites) {
      setFavIndex(0);
      return;
    }
    setPage(1);
    setIndexInPage(0);
  }, [showFavorites]);

  /* Both of these read the current position and set the next one outright,
     rather than nesting one setter inside another's updater. An updater must be
     pure: StrictMode runs it twice in development, so a setPage() hidden inside
     one would advance the page by two. */
  const goPrev = useCallback(() => {
    if (showFavorites) {
      setFavIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (indexInPage > 0) {
      setIndexInPage(indexInPage - 1);
      return;
    }
    // Stepping off the front of a page lands on the last article of the one before.
    if (page > 1) {
      setPage(page - 1);
      setIndexInPage(PAGE_SIZE - 1);
    }
  }, [showFavorites, indexInPage, page]);

  const goNext = useCallback(() => {
    if (showFavorites) {
      setFavIndex((i) => Math.min(favorites.length - 1, i + 1));
      return;
    }
    if (indexInPage < livePageArticles.length - 1) {
      setIndexInPage(indexInPage + 1);
      return;
    }
    setPage(page + 1);
    setIndexInPage(0);
  }, [showFavorites, favorites.length, indexInPage, livePageArticles.length, page]);

  const select = useCallback(
    (slot: number) => {
      if (showFavorites) {
        const base = Math.floor(favIndex / PAGE_SIZE) * PAGE_SIZE;
        if (base + slot < favorites.length) setFavIndex(base + slot);
        return;
      }
      if (slot < livePageArticles.length) setIndexInPage(slot);
    },
    [showFavorites, favIndex, favorites.length, livePageArticles.length],
  );

  /* ---- search ---- */

  /* Searching is deliberate rather than live. Typing no longer queries: a
     request per keystroke spends a daily-metered quota on half-typed words, and
     results rearranging under the reader mid-word is its own kind of unpleasant.
     Enter (or the button) commits; nothing else does. */
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setShowFavorites(false);
    setSearch(searchDraft.trim());
  };

  /* ---- filters ---- */

  const applyFilters = (event: React.FormEvent) => {
    event.preventDefault();
    setShowFavorites(false);
    // Trim to undefined rather than '' so an empty box is absent, not blank.
    setFilters({
      from: filterDraft.from || undefined,
      to: filterDraft.to || undefined,
      domains: filterDraft.domains?.trim() || undefined,
    });
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setFilterDraft({});
    setFilters({});
  };

  /** "More from this source", from the article on screen. */
  const filterToSource = (domain: string) => {
    const next = { ...filters, domains: domain };
    setFilterDraft(next);
    setFilters(next);
    setShowFavorites(false);
  };

  const clearSearch = () => {
    setSearchDraft('');
    setSearch('');
    setShowFavorites(false);
  };

  /* ---- filters ---- */

  /* Picking anything from the sidebar clears a running search: the two are
     mutually exclusive, and leaving a search committed would make the tap look
     like it did nothing. */
  const choose = (next: Selection) => {
    setSearchDraft('');
    setSearch('');
    setSelection(next);
    setShowFavorites(false);
    setFiltersOpen(false);
  };

  const pickCategory = (next: Category) => choose({ kind: 'category', category: next });

  /**
   * Pin or unpin a topic.
   *
   * Unpinning the last one while reading the topic mix would leave the reader
   * on a feed with nothing in it, so the selection falls back to the category
   * that was just unpinned — the thing they were most recently looking at.
   */
  const pinTopic = (name: Category) => {
    const next = toggleTopic(topics, name);
    if (next === topics) return; // at the cap
    setTopics(next);
    if (selection.kind === 'topics' && next.length === 0) {
      setSelection({ kind: 'category', category: name });
    }
  };

  const atTopicCap = topics.length >= MAX_TOPICS;

  /* Pinned topics first, each group otherwise in its original order, so the
     list is predictable rather than reshuffling as things are pinned. */
  const orderedCategories = useMemo(
    () => [...CATEGORIES].sort((a, b) => Number(topics.includes(b)) - Number(topics.includes(a))),
    [topics],
  );

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <span className="header__mark" aria-hidden="true">
            ◆
          </span>
          <div>
            <h1>{t('app.title')}</h1>
            <p>{t('app.tagline')}</p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--ghost header__filters-toggle"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="filters"
        >
          {filtersOpen ? t('filters.hide') : t('filters.show')}
        </button>
      </header>

      <div className="layout">
        <aside
          id="filters"
          className={`sidebar${filtersOpen ? ' is-open' : ''}`}
          aria-label={t('refine.label')}
        >
          <div className="sidebar__body">
            {/* One control for both: the interface and the news it fetches. */}
            <div className="field">
              <label className="field__label" htmlFor="language">
                {t('language.label')}
              </label>
              <select
                id="language"
                className="field__input"
                value={lang}
                onChange={(event) => onLanguageChange(event.target.value as Lang)}
              >
                {LANG_CODES.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGES[code].label}
                  </option>
                ))}
              </select>
              <p className="field__hint">{t('language.hint')}</p>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="search">
                {t('search.label')}
              </label>
              {/* A real <form>, so Enter submits for free and mobile keyboards
                  show a "Search" key instead of a newline. */}
              <form className="field__search" onSubmit={submitSearch} role="search">
                <input
                  id="search"
                  className="field__input"
                  type="search"
                  placeholder={t('search.placeholder')}
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  autoComplete="off"
                />
                <button type="submit" className="btn btn--search" aria-label={t('search.submit')}>
                  <span aria-hidden="true">⏎</span>
                </button>
              </form>
              <p className="field__hint">
                {search ? (
                  <>
                    {t('search.hintActive', { term: search })}{' '}
                    <button type="button" className="linkish" onClick={clearSearch}>
                      {t('search.clear')}
                    </button>
                  </>
                ) : (
                  t('search.hintIdle')
                )}
              </p>
            </div>

            <nav className="categories" aria-label={t('categories.label')}>
              <h2 className="field__label">{t('categories.label')}</h2>

              {topics.length > 0 && (
                <button
                  type="button"
                  className={`chip chip--topics${
                    !search && !showFavorites && selection.kind === 'topics' ? ' is-active' : ''
                  }`}
                  onClick={() => choose({ kind: 'topics' })}
                  aria-current={
                    !search && !showFavorites && selection.kind === 'topics' ? 'true' : undefined
                  }
                >
                  <span aria-hidden="true">★</span>
                  {t('categories.myTopics')}
                  <span className="chip__count">{topics.length}</span>
                </button>
              )}

              <ul>
                {orderedCategories.map((name) => {
                  const active =
                    !search
                    && !showFavorites
                    && selection.kind === 'category'
                    && name === selection.category;
                  const pinned = topics.includes(name);
                  return (
                    <li key={name} className="topic">
                      <button
                        type="button"
                        className={`chip${active ? ' is-active' : ''}`}
                        onClick={() => pickCategory(name)}
                        aria-current={active ? 'true' : undefined}
                      >
                        {t(`category.${name}` as Parameters<typeof t>[0])}
                      </button>
                      {/* A separate control, not a nested one: selecting a
                          category and pinning it are different intents. */}
                      <button
                        type="button"
                        className={`topic__pin${pinned ? ' is-pinned' : ''}`}
                        onClick={() => pinTopic(name)}
                        aria-pressed={pinned}
                        disabled={!pinned && atTopicCap}
                        title={
                          pinned
                            ? t('categories.pinRemove', { name })
                            : atTopicCap
                              ? t('categories.pinFull', { max: MAX_TOPICS })
                              : t('categories.pinAdd', { name })
                        }
                      >
                        <span aria-hidden="true">{pinned ? '★' : '☆'}</span>
                        <span className="sr-only">
                          {pinned
                            ? t('categories.pinRemove', { name })
                            : t('categories.pinAdd', { name })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <p className="field__hint">
                {topics.length === 0
                  ? t('categories.hintEmpty')
                  : atTopicCap
                    ? t('categories.hintFull', { max: MAX_TOPICS })
                    : t('categories.hintMix', { list: topics.join(', ') })}
              </p>
            </nav>

            {/* Narrowing, rather than choosing. These apply on top of whatever
                is selected above — a search or a category alike. */}
            <form className="filters" onSubmit={applyFilters}>
              <h2 className="field__label">{t('refine.label')}</h2>

              <div className="filters__dates">
                <label className="filters__date">
                  <span>{t('refine.from')}</span>
                  <input
                    type="date"
                    className="field__input"
                    value={filterDraft.from ?? ''}
                    max={filterDraft.to || undefined}
                    onChange={(e) => setFilterDraft((f) => ({ ...f, from: e.target.value }))}
                  />
                </label>
                <label className="filters__date">
                  <span>{t('refine.to')}</span>
                  <input
                    type="date"
                    className="field__input"
                    value={filterDraft.to ?? ''}
                    min={filterDraft.from || undefined}
                    onChange={(e) => setFilterDraft((f) => ({ ...f, to: e.target.value }))}
                  />
                </label>
              </div>

              <label className="filters__source">
                <span className="sr-only">{t('refine.source')}</span>
                <input
                  type="text"
                  className="field__input"
                  placeholder={t('refine.sourcePlaceholder')}
                  value={filterDraft.domains ?? ''}
                  onChange={(e) => setFilterDraft((f) => ({ ...f, domains: e.target.value }))}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              <div className="filters__actions">
                <button type="submit" className="btn btn--sm">{t('refine.apply')}</button>
                {hasFilters(filters) && (
                  <button type="button" className="linkish" onClick={clearFilters}>
                    {t('refine.clear')}
                  </button>
                )}
              </div>

              <p className="field__hint">
                {hasFilters(filters) ? t('refine.hintActive') : t('refine.hintIdle')}
              </p>
            </form>
          </div>

          <button
            type="button"
            className={`btn btn--favorites${showFavorites ? ' is-active' : ''}`}
            onClick={() => {
              setShowFavorites((on) => !on);
              setFavIndex(0);
              setFiltersOpen(false);
            }}
            aria-pressed={showFavorites}
          >
            <span aria-hidden="true">★</span>
            {showFavorites
              ? t('favorites.back')
              : t('favorites.open', { count: favorites.length })}
          </button>
        </aside>

        <main className="content">
          <HeadlinesList
            article={article}
            pageArticles={showFavorites ? favPageArticles : livePageArticles}
            page={showFavorites ? Math.floor(favIndex / PAGE_SIZE) + 1 : page}
            indexInPage={showFavorites ? favIndex % PAGE_SIZE : indexInPage}
            found={showFavorites ? favorites.length : found}
            loading={showFavorites ? false : loading}
            error={showFavorites ? null : error}
            isFavorite={isFavorite}
            onToggleFavorite={toggleFavorite}
            onFirst={goFirst}
            onPrev={goPrev}
            onNext={goNext}
            onSelect={select}
            onFilterSource={showFavorites ? undefined : filterToSource}
            activeSource={filters.domains}
            emptyMessage={
              showFavorites ? t('state.favEmpty') : undefined
            }
          />
        </main>
      </div>
    </div>
  );
}

/** Favourites survive a reload; a corrupt entry is dropped rather than fatal. */
function loadFavorites(): Article[] {
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is Article =>
        Boolean(item) && typeof item === 'object' && typeof (item as Article).uuid === 'string',
    );
  } catch {
    return [];
  }
}
