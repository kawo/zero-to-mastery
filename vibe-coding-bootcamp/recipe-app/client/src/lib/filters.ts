/**
 * Search filters live in the URL (?q=&c=&cuisine=&ing=&ing=&time=&sort=), so
 * any search can be linked to, bookmarked, and navigated with back/forward.
 */

export type TimeBucket = 'under30' | '30to60' | 'over60';
export type Sort = 'relevance' | 'name' | 'time';

export interface Filters {
  q: string;
  category: string;
  cuisine: string;
  ingredients: string[];
  time: TimeBucket | '';
  sort: Sort | '';
}

const TIME_VALUES: TimeBucket[] = ['under30', '30to60', 'over60'];
const SORT_VALUES: Sort[] = ['relevance', 'name', 'time'];

export const TIME_LABELS: Record<TimeBucket, string> = {
  under30: 'Under 30 min',
  '30to60': '30–60 min',
  over60: 'Over 1 hour'
};

export function readFilters(params: URLSearchParams): Filters {
  const time = params.get('time') ?? '';
  const sort = params.get('sort') ?? '';
  return {
    q: (params.get('q') ?? '').trim(),
    category: params.get('c') ?? '',
    cuisine: params.get('cuisine') ?? '',
    ingredients: [...new Set(params.getAll('ing').map(value => value.trim()).filter(Boolean))],
    time: TIME_VALUES.includes(time as TimeBucket) ? (time as TimeBucket) : '',
    sort: SORT_VALUES.includes(sort as Sort) ? (sort as Sort) : ''
  };
}

/** URL params for a set of filters, leaving out empty ones. */
export function filtersToParams(filters: Partial<Filters>): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.category) params.set('c', filters.category);
  if (filters.cuisine) params.set('cuisine', filters.cuisine);
  filters.ingredients?.forEach(ingredient => params.append('ing', ingredient));
  if (filters.time) params.set('time', filters.time);
  if (filters.sort) params.set('sort', filters.sort);
  return params;
}

/** How many of the panel's filters are on (text search and category are shown elsewhere). */
export function panelFilterCount(filters: Filters): number {
  return (filters.cuisine ? 1 : 0) + filters.ingredients.length + (filters.time ? 1 : 0);
}

export function hasAnyFilter(filters: Filters): boolean {
  return Boolean(filters.q || filters.category || panelFilterCount(filters));
}
