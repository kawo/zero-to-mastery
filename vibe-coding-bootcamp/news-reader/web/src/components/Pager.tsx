// web/src/components/Pager.tsx
/*
 * « ‹ [n] [n] [n] ›
 *
 * The three dots carry absolute article numbers — page 3 reads 7, 8, 9 — so the
 * reader always knows how far in they are, not just which third of a page.
 *
 * Every control is a real button with a label, so the pager is fully usable
 * from a keyboard or a screen reader. That is also why it survives on desktop
 * alongside the mobile feed: scrolling is not a keyboard interaction.
 */

import { absoluteNumber, PAGE_SIZE } from '../lib/newsapi';
import { useI18n } from '../lib/i18n';

export interface PagerProps {
  page: number;
  indexInPage: number;
  /** How many articles exist on the current page (the last page can be short). */
  onPage: number;
  isFirst: boolean;
  isLast: boolean;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (indexInPage: number) => void;
}

export default function Pager({
  page,
  indexInPage,
  onPage,
  isFirst,
  isLast,
  onFirst,
  onPrev,
  onNext,
  onSelect,
}: PagerProps) {
  const { t } = useI18n();

  return (
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
          const label = absoluteNumber(page, slot);
          const active = slot === indexInPage;
          return (
            <li key={slot}>
              <button
                type="button"
                className={`pager__dot${active ? ' is-active' : ''}`}
                onClick={() => onSelect(slot)}
                disabled={slot >= onPage}
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
  );
}
