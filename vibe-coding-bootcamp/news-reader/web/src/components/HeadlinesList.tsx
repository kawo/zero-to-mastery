// web/src/components/HeadlinesList.tsx
/*
 * The desktop reading surface: one large article card, and the pager under it.
 *
 * Presentational. It is told which article to show and which moves are legal;
 * App owns the paging, the cache and the prefetching. On phones the Feed takes
 * its place — see Feed.tsx — and the two share ArticleCard, so a card looks the
 * same whichever way you arrived at it.
 */

import type { Article } from '../lib/newsapi';
import { absoluteNumber } from '../lib/newsapi';
import { useI18n } from '../lib/i18n';
import ArticleCard from './ArticleCard';
import Pager from './Pager';

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
  onFilterSource?: (domain: string) => void;
  activeSource?: string;
  /** Shown instead of the card when there is nothing to show. */
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
  const { t } = useI18n();

  if (loading) return <Skeleton />;
  if (error) return <ErrorState message={error} />;
  if (!article) return <EmptyState message={emptyMessage ?? t('state.emptyBody')} />;

  const current = absoluteNumber(page, indexInPage);
  const isLast = found > 0 ? current >= found : indexInPage >= pageArticles.length - 1;

  return (
    <>
      <ArticleCard
        article={article}
        isFavorite={isFavorite}
        onToggleFavorite={onToggleFavorite}
        onFilterSource={onFilterSource}
        activeSource={activeSource}
        headingId="featured-title"
        eager
      />
      <Pager
        page={page}
        indexInPage={indexInPage}
        onPage={pageArticles.length}
        isFirst={current === 1}
        isLast={isLast}
        onFirst={onFirst}
        onPrev={onPrev}
        onNext={onNext}
        onSelect={onSelect}
      />
    </>
  );
}

/* Shared by the feed, so both views fail and wait the same way. */

export function ErrorState({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <div className="state state--error" role="alert">
      <h2>{t('state.errorTitle')}</h2>
      <p>{message}</p>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <div className="state" role="status">
      <h2>{t('state.emptyTitle')}</h2>
      <p>{message}</p>
    </div>
  );
}

/** Full-height placeholder shown while a new query loads. */
export function Skeleton({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <div className={`card card--skeleton ${className}`.trim()} role="status" aria-live="polite">
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
