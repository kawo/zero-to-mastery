// web/src/components/ArticleCard.tsx
/*
 * One article: image, overlay panel, actions.
 *
 * Shared by the desktop reader (one card at a time) and the mobile feed (many
 * cards stacked). The only thing that differs between them is how the card is
 * sized and whether its image is worth loading eagerly, so both are props rather
 * than two copies of the markup drifting apart.
 */

import type { Article } from '../lib/newsapi';
import { useI18n } from '../lib/i18n';

const PLACEHOLDER = '/placeholder.png';

export interface ArticleCardProps {
  article: Article;
  isFavorite: boolean;
  onToggleFavorite: (article: Article) => void;
  /** Narrow the live feed to this source. Omitted where that makes no sense. */
  onFilterSource?: (domain: string) => void;
  activeSource?: string;
  /** Must be unique on the page: several cards share it in the feed. */
  headingId: string;
  /** The first card on screen is worth fetching immediately; the rest are not. */
  eager?: boolean;
  className?: string;
}

export default function ArticleCard({
  article,
  isFavorite,
  onToggleFavorite,
  onFilterSource,
  activeSource,
  headingId,
  eager = false,
  className = '',
}: ArticleCardProps) {
  const { t, formatDate } = useI18n();

  return (
    <article className={`card ${className}`.trim()} aria-labelledby={headingId}>
      <img
        className="card__image"
        src={article.image_url || PLACEHOLDER}
        alt={article.title ? t('card.imageAlt', { title: article.title }) : t('card.imageAltFallback')}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
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
          {/* The source doubles as a filter: it is the one piece of metadata a
              reader is likely to want more of. */}
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

        <h2 id={headingId} className="card__title">
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
  );
}
