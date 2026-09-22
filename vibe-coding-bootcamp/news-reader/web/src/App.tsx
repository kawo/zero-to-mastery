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
  DEFAULT_CATEGORY,
  PAGE_SIZE,
  fetchNews,
  NewsError,
  type Article,
  type Category,
} from './lib/newsapi';
import './styles.css';

const FAVORITES_KEY = 'news-reader:favorites:v1';
const SEARCH_DEBOUNCE_MS = 400;

export default function App() {
  /* ---- query ---- */
  const [category, setCategory] = useState<Category>(DEFAULT_CATEGORY);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');

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

  /* The committed query. Changing it resets everything downstream. */
  const queryKey = search ? `s:${search}` : `c:${category}`;

  /* Debounce typing so a search does not fire a request per keystroke — the
     free plan is metered per day, not per minute. */
  useEffect(() => {
    const id = window.setTimeout(() => setSearch(searchDraft.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchDraft]);

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
          category,
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
    [queryKey, search, category],
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

  /* ---- filters ---- */

  const pickCategory = (next: Category) => {
    setSearchDraft('');
    setSearch('');
    setCategory(next);
    setShowFavorites(false);
    setFiltersOpen(false);
  };

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <span className="header__mark" aria-hidden="true">
            ◆
          </span>
          <div>
            <h1>News Reader</h1>
            <p>One story at a time</p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--ghost header__filters-toggle"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls="filters"
        >
          {filtersOpen ? 'Hide Filters' : 'Show Filters'}
        </button>
      </header>

      <div className="layout">
        <aside
          id="filters"
          className={`sidebar${filtersOpen ? ' is-open' : ''}`}
          aria-label="Filters"
        >
          <div className="sidebar__body">
            <div className="field">
              <label className="field__label" htmlFor="search">
                Search
              </label>
              <input
                id="search"
                className="field__input"
                type="search"
                placeholder="Search all news…"
                value={searchDraft}
                onChange={(event) => {
                  setSearchDraft(event.target.value);
                  setShowFavorites(false);
                }}
                autoComplete="off"
              />
              <p className="field__hint">
                {search
                  ? 'Searching across every category.'
                  : 'Leave empty to browse by category.'}
              </p>
            </div>

            <nav className="categories" aria-label="Categories">
              <h2 className="field__label">Categories</h2>
              <ul>
                {CATEGORIES.map((name) => {
                  const active = !search && !showFavorites && name === category;
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        className={`chip${active ? ' is-active' : ''}`}
                        onClick={() => pickCategory(name)}
                        aria-current={active ? 'true' : undefined}
                        disabled={Boolean(search)}
                      >
                        {name}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
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
            {showFavorites ? 'Back to News' : `Favorites (${favorites.length})`}
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
            emptyMessage={
              showFavorites
                ? 'No saved articles yet. Use “Save to Favorites” on any story.'
                : undefined
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
