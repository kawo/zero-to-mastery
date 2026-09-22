// web/src/components/HeadlinesList.tsx
/*
 * The reading surface: one large article card, and the pager under it.
 *
 * This component is presentational. It is told which article to show and which
 * moves are legal; App owns the paging, the cache and the prefetching.
 */

import type { Article } from '../lib/newsapi';
import { absoluteNumber, PAGE_SIZE } from '../lib/newsapi';
import { useI18n } from '../lib/i18n';

const PLACEHOLDER = '/placeholder.png';

export interface HeadlinesListProps {
  article: Article | null;
  /** Articles on the current page, so the pager can label its three dots. */
  pageArticles: Article[];
  page: number;
  indexInPage: number;
  /** Total articles the query found, used to stop the pager at the end. */
  found: number;
  loading: boolean;
  error: string | null;
  isFavorite: boolean;
  onToggleFavorite: (article: Article) => void;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (indexInPage: number) => void;
  /**
   * Narrow to this article's source. Omitted in the favourites view, where
   * filtering the live feed from a saved article would be a non-sequitur.
   */
  onFilterSource?: (domain: string) => void;
  /** The source currently filtered on, if any. */
  activeSource?: string;
  /** Shown instead of the pager when the favourites list is empty. */
  emptyMessage?: string;
}

export default function HeadlinesList({
  article,
  pageArticles,
  page,
  indexInPage,
  found,
  loading,
  error,
  isFavorite,
  onToggleFavorite,
  onFirst,
  onPrev,
  onNext,
  onSelect,
  onFilterSource,
  activeSource,
  emptyMessage,
}: HeadlinesListProps) {
  const { t, formatDate } = useI18n();

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="state state--error" role="alert">
        <h2>{t('state.errorTitle')}</h2>
        <p>{error}</p>
      </div>
    );
  }

  if (!article) {
    return (
      <div className="state" role="status">
        <h2>{t('state.emptyTitle')}</h2>
        <p>{emptyMessage ?? t('state.emptyBody')}</p>
      </div>
    );
  }

  const current = absoluteNumber(page, indexInPage);
  const isFirst = current === 1;
  const isLast = found > 0 ? current >= found : indexInPage >= pageArticles.length - 1;

  return (
    <>
      <article className="card" aria-labelledby="featured-title">
        <img
          className="card__image"
          src={article.image_url || PLACEHOLDER}
          alt={article.title ? `Illustration for: ${article.title}` : 'Article illustration'}
          loading="eager"
          onError={(event) => {
            // A broken remote image is common in news feeds; swap once and stop,
            // so a failing placeholder cannot loop.
            const img = event.currentTarget;
            if (img.src.endsWith(PLACEHOLDER)) return;
            img.src = PLACEHOLDER;
          }}
        />

        <div className="card__panel">
          <div className="card__meta">
            {/* The source doubles as a filter: it is the one piece of metadata
                a reader is likely to want more of. */}
            {onFilterSource && article.source ? (
              <button
                type="button"
                className={`card__source card__source--action${
                  activeSource === article.source ? ' is-active' : ''
                }`}
                onClick={() => onFilterSource(article.source)}
                title={
                  activeSource === article.source
                    ? t('card.sourceActive', { source: article.source })
                    : t('card.sourceFilter', { source: article.source })
                }
              >
                {article.source}
              </button>
            ) : (
              <span className="card__source">{article.source || t('card.unknownSource')}</span>
            )}
            <span aria-hidden="true">·</span>
            <time dateTime={article.published_at}>{formatDate(article.published_at)}</time>
            {article.categories?.length ? (
              <span className="card__tag">{article.categories[0]}</span>
            ) : null}
          </div>

          <h2 id="featured-title" className="card__title">
            {article.title}
          </h2>

          {article.description || article.snippet ? (
            <p className="card__text">{article.description || article.snippet}</p>
          ) : null}

          <div className="card__actions">
            <a
              className="btn btn--primary"
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('card.viewFull')}
            </a>

            <button
              type="button"
              className={`btn btn--ghost${isFavorite ? ' is-active' : ''}`}
              onClick={() => onToggleFavorite(article)}
              aria-pressed={isFavorite}
            >
              <span aria-hidden="true">{isFavorite ? '★' : '☆'}</span>
              {isFavorite ? t('card.saved') : t('card.save')}
            </button>
          </div>
        </div>
      </article>

      <nav className="pager" aria-label={t('pager.label')}>
        <button
          type="button"
          className="pager__btn"
          onClick={onFirst}
          disabled={isFirst}
          aria-label={t('pager.first')}
        >
          «
        </button>
        <button
          type="button"
          className="pager__btn"
          onClick={onPrev}
          disabled={isFirst}
          aria-label={t('pager.prev')}
        >
          ‹
        </button>

        <ol className="pager__dots">
          {Array.from({ length: PAGE_SIZE }, (_, slot) => {
            const exists = slot < pageArticles.length;
            const label = absoluteNumber(page, slot);
            const active = slot === indexInPage;
            return (
              <li key={slot}>
                <button
                  type="button"
                  className={`pager__dot${active ? ' is-active' : ''}`}
                  onClick={() => onSelect(slot)}
                  disabled={!exists}
                  aria-current={active ? 'true' : undefined}
                  aria-label={t('pager.article', { n: label })}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ol>

        <button
          type="button"
          className="pager__btn"
          onClick={onNext}
          disabled={isLast}
          aria-label={t('pager.next')}
        >
          ›
        </button>
      </nav>
    </>
  );
}

/** Full-height placeholder shown while a new query loads. */
function Skeleton() {
  const { t } = useI18n();
  return (
    <div className="card card--skeleton" role="status" aria-live="polite">
      <span className="sr-only">{t('state.loading')}</span>
      <div className="skeleton__image" />
      <div className="card__panel">
        <div className="skeleton__line skeleton__line--meta" />
        <div className="skeleton__line skeleton__line--title" />
        <div className="skeleton__line skeleton__line--title short" />
        <div className="skeleton__line" />
        <div className="skeleton__line" />
        <div className="skeleton__line short" />
      </div>
    </div>
  );
}
