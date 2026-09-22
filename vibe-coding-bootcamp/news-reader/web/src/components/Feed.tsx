// web/src/components/Feed.tsx
/*
 * The phone reading surface: full-height cards you swipe through, one at a time,
 * with more loaded as you approach the end.
 *
 * It keeps the one-story-at-a-time idea of the desktop reader — each card fills
 * the viewport and scroll-snap stops exactly on it — but the gesture is a swipe
 * instead of a pager tap, which is what a phone is for.
 *
 * Accessibility follows the WAI-ARIA feed pattern, which exists for precisely
 * this: `role="feed"` on the container, `aria-busy` while more is loading, and
 * each article carrying its position (`aria-posinset`) out of the total
 * (`aria-setsize`). Scrolling is not something a keyboard does, so there is
 * always a real Load more button at the end, and every card is focusable.
 */

import { useEffect, useRef } from 'react';
import type { Article } from '../lib/newsapi';
import { useI18n } from '../lib/i18n';
import ArticleCard from './ArticleCard';

export type MoreState = 'idle' | 'loading' | 'error' | 'end';

export interface FeedProps {
  articles: Article[];
  /** Total the query found, for aria-setsize. 0 means unknown. */
  total: number;
  moreState: MoreState;
  /** Omitted when there is nothing more to fetch (the favourites list). */
  onLoadMore?: () => void;
  favoriteIds: Set<string>;
  onToggleFavorite: (article: Article) => void;
  onFilterSource?: (domain: string) => void;
  activeSource?: string;
}

/* How long the sentinel must stay in view before it counts. A fast fling can
   pass the end of the list for a single frame on its way somewhere else; that
   is not a request for more, and on a per-day quota it is not free. */
const SETTLE_MS = 150;

export default function Feed({
  articles,
  total,
  moreState,
  onLoadMore,
  favoriteIds,
  onToggleFavorite,
  onFilterSource,
  activeSource,
}: FeedProps) {
  const { t } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  /* Keep the latest callback without re-creating the observer every render. */
  const latest = useRef(onLoadMore);
  latest.current = onLoadMore;

  const canLoad = Boolean(onLoadMore) && moreState === 'idle';

  useEffect(() => {
    const root = scroller.current;
    const target = sentinel.current;
    if (!root || !target || !canLoad) return undefined;
    // No IntersectionObserver: the Load more button below still works.
    if (typeof IntersectionObserver === 'undefined') return undefined;

    let timer: number | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(timer);
        if (!entry?.isIntersecting) return;
        timer = window.setTimeout(() => latest.current?.(), SETTLE_MS);
      },
      {
        root,
        // Start fetching a full card before the reader reaches the end, so the
        // next one is usually there by the time they swipe to it.
        rootMargin: '0px 0px 100% 0px',
      },
    );

    observer.observe(target);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [canLoad, articles.length]);

  return (
    <div
      ref={scroller}
      className="feed"
      role="feed"
      aria-label={t('feed.label')}
      aria-busy={moreState === 'loading'}
    >
      {articles.map((article, index) => (
        <div
          key={article.uuid}
          className="feed__item"
          // Focusable, so a keyboard can move card to card and the browser
          // scrolls each into view, snapping it into place.
          tabIndex={0}
          aria-posinset={index + 1}
          aria-setsize={total > 0 ? total : -1}
        >
          <ArticleCard
            article={article}
            isFavorite={favoriteIds.has(article.uuid)}
            onToggleFavorite={onToggleFavorite}
            onFilterSource={onFilterSource}
            activeSource={activeSource}
            headingId={`feed-title-${article.uuid}`}
            eager={index === 0}
            className="card--feed"
          />
        </div>
      ))}

      <div ref={sentinel} className="feed__end">
        {moreState === 'loading' && (
          <p className="feed__status" role="status">
            <span className="feed__spinner" aria-hidden="true" />
            {t('feed.loading')}
          </p>
        )}

        {moreState === 'error' && (
          <div className="feed__status" role="alert">
            <p>{t('feed.error')}</p>
            {onLoadMore && (
              <button type="button" className="btn btn--sm" onClick={onLoadMore}>
                {t('feed.retry')}
              </button>
            )}
          </div>
        )}

        {moreState === 'end' && <p className="feed__status">{t('feed.end')}</p>}

        {/* The fallback, and the keyboard path. Always offered while there is
            more to fetch, not only when the observer is unavailable: the reader
            who does not scroll should not have to discover that they could. */}
        {moreState === 'idle' && onLoadMore && (
          <button type="button" className="btn feed__more" onClick={onLoadMore}>
            {t('feed.loadMore')}
          </button>
        )}
      </div>
    </div>
  );
}
