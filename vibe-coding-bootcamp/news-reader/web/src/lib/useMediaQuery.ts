// web/src/lib/useMediaQuery.ts
import { useEffect, useState } from 'react';

/**
 * Track a CSS media query from React.
 *
 * Needed where CSS alone cannot do the job: the phone and desktop readers are
 * different component trees (a feed of many cards versus one card and a pager),
 * not the same markup styled two ways, so something has to choose which to
 * render. The query string is the same breakpoint the stylesheet uses.
 */
export function useMediaQuery(query: string): boolean {
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;

  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** Keep in step with the `@media (max-width: 53.999rem)` rules in styles.css. */
export const MOBILE_QUERY = '(max-width: 53.999rem)';
