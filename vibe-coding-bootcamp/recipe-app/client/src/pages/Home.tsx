import { useId, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Loader2, Shuffle, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FilterPanel } from '@/components/FilterPanel';
import { MealCard, MealGridSkeleton, gridClass } from '@/components/MealCard';
import { SearchBar } from '@/components/SearchBar';
import { StatusMessage } from '@/components/StatusMessage';
import { api, ApiError, PAGE_SIZE, queryKeys, searchRecipes } from '@/lib/api';
import { filtersToParams, hasAnyFilter, panelFilterCount, readFilters, TIME_LABELS, type Filters, type Sort } from '@/lib/filters';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';

/** Categories shown on phones before "More" (about two rows at 360-400px) */
const CHIPS_ON_PHONE = 5;

const chipClass = (active: boolean) =>
  cn(
    'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
    active && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
  );

const selectClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** 503 with indexing: the server is still building its search index (first start only). */
const isIndexing = (error: unknown) => error instanceof ApiError && error.status === 503 && !error.offline;

/**
 * Home: full-text search, category chips and filters over the server's
 * recipe index. All filter state is in the URL (see lib/filters.ts).
 */
export default function Home() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [surprising, setSurprising] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(() => panelFilterCount(filters) > 0);
  const ids = { panel: useId(), sort: useId() };

  useDocumentTitle(filters.q ? `"${filters.q}"` : filters.category || undefined);

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => api.categories(signal),
    staleTime: 60 * 60 * 1000
  });

  const results = useInfiniteQuery({
    queryKey: queryKeys.recipes(filters),
    queryFn: ({ pageParam, signal }) => searchRecipes(filters, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.length * PAGE_SIZE;
      return loaded < last.total ? loaded : undefined;
    },
    // Keep the old results on screen while a changed filter loads
    placeholderData: keepPreviousData,
    // The index is built on the server's first start; keep asking until it's ready
    retry: (failures, error) => (isIndexing(error) ? failures < 20 : !(error instanceof ApiError) && failures < 2),
    retryDelay: (_attempt, error) => (isIndexing(error) ? 3000 : 1000)
  });

  /** Updates some filters and keeps the rest (and the URL) in step. */
  const update = (patch: Partial<Filters>) => {
    setParams(filtersToParams({ ...filters, ...patch }), { replace: false });
  };

  const pickCategory = (name: string) => update({ category: name && name !== filters.category ? name : '' });

  const surpriseMe = async () => {
    setSurprising(true);
    try {
      const meal = await api.random();
      queryClient.setQueryData(queryKeys.meal(meal.id), meal);
      navigate(`/meal/${meal.id}`);
    } catch (error) {
      toast.error("Couldn't pick a random recipe", {
        description: error instanceof ApiError && error.offline ? "You're offline." : 'Please try again.'
      });
    } finally {
      setSurprising(false);
    }
  };

  const firstPage = results.data?.pages[0];
  const meals = results.data?.pages.flatMap(page => page.results) ?? [];
  const total = firstPage?.total ?? 0;
  const panelCount = panelFilterCount(filters);
  const hiddenOnPhone = (categories.data ?? []).filter((item, index) => index >= CHIPS_ON_PHONE && item.name !== filters.category).length;
  const heading = filters.q ? `Results for "${filters.q}"` : filters.category ? `${filters.category} recipes` : hasAnyFilter(filters) ? 'Matching recipes' : 'All recipes';

  return (
    <div className="space-y-6">
      <section aria-labelledby="home-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 id="home-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
              What are we cooking?
            </h1>
            <p className="mt-1 text-muted-foreground">Search every recipe by name, ingredient or method, then narrow it down.</p>
          </div>
          <Button variant="outline" onClick={surpriseMe} disabled={surprising}>
            <Shuffle aria-hidden="true" />
            {surprising ? 'Picking…' : 'Surprise me'}
          </Button>
        </div>
        <SearchBar size="lg" />
      </section>

      <section aria-labelledby="categories-title">
        <h2 id="categories-title" className="sr-only">
          Categories
        </h2>
        {categories.isLoading ? (
          <div className="flex gap-2 overflow-hidden" role="status">
            <span className="sr-only">Loading categories…</span>
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9 w-24 shrink-0 rounded-full" />
            ))}
          </div>
        ) : categories.isError ? (
          <p className="text-sm text-muted-foreground">
            Categories aren't available right now.{' '}
            <Button variant="link" className="h-auto p-0" onClick={() => categories.refetch()}>
              Try again
            </Button>
          </p>
        ) : (
          // On phones only the first few chips show, plus a More toggle; the
          // selected category is always shown. Wider screens show them all.
          <div id="category-chips" role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
            <button type="button" className={chipClass(!filters.category)} aria-pressed={!filters.category} onClick={() => pickCategory('')}>
              All
            </button>
            {categories.data?.map((item, index) => {
              const collapsed = !showAllCategories && index >= CHIPS_ON_PHONE && item.name !== filters.category;
              return (
                <button
                  key={item.name}
                  type="button"
                  className={cn(chipClass(item.name === filters.category), collapsed && 'hidden sm:inline-block')}
                  aria-pressed={item.name === filters.category}
                  onClick={() => pickCategory(item.name)}
                  title={item.description ? item.description.slice(0, 160) : undefined}
                >
                  {item.name}
                </button>
              );
            })}
            {hiddenOnPhone > 0 && (
              <button
                type="button"
                className={cn(chipClass(false), 'border-dashed text-muted-foreground sm:hidden')}
                aria-expanded={showAllCategories}
                aria-controls="category-chips"
                onClick={() => setShowAllCategories(value => !value)}
              >
                {showAllCategories ? 'Fewer' : `More (${hiddenOnPhone})`}
              </button>
            )}
          </div>
        )}
      </section>

      <section aria-label="More filters" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            aria-expanded={filtersOpen}
            aria-controls={ids.panel}
            onClick={() => setFiltersOpen(open => !open)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Filters
            {panelCount > 0 && (
              <Badge className="px-1.5">
                <span className="sr-only">(</span>
                {panelCount}
                <span className="sr-only"> active)</span>
              </Badge>
            )}
            <ChevronDown aria-hidden="true" className={cn('transition-transform', filtersOpen && 'rotate-180')} />
          </Button>
          <div className="flex items-center gap-2">
            <label htmlFor={ids.sort} className="text-sm text-muted-foreground">
              Sort by
            </label>
            <select
              id={ids.sort}
              className={selectClass}
              value={filters.sort || (filters.q ? 'relevance' : 'name')}
              onChange={event => update({ sort: event.target.value as Sort })}
            >
              {filters.q && <option value="relevance">Best match</option>}
              <option value="name">Name, A to Z</option>
              <option value="time">Quickest first</option>
            </select>
          </div>
        </div>

        <div id={ids.panel} hidden={!filtersOpen}>
          <FilterPanel filters={filters} facets={firstPage?.facets} onChange={update} />
        </div>

        <ActiveFilters filters={filters} onChange={update} onClear={() => setParams({})} />
      </section>

      <section aria-labelledby="results-title" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="results-title" className="text-xl font-semibold">
            {heading}
          </h2>
          {results.isSuccess && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              {results.isPlaceholderData && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {total} {total === 1 ? 'recipe' : 'recipes'}
            </p>
          )}
        </div>
        {firstPage?.matchedPrefix && filters.q && (
          <p className="text-sm text-muted-foreground">No exact matches for "{filters.q}", so these match words starting with it.</p>
        )}

        {results.isLoading || (results.isError && isIndexing(results.error) && results.isFetching) ? (
          <>
            {isIndexing(results.error) && (
              <p role="status" className="text-sm text-muted-foreground">
                Getting the recipe index ready. This takes a few seconds, only the first time the server starts.
              </p>
            )}
            <MealGridSkeleton label={`Loading ${heading.toLowerCase()}`} />
          </>
        ) : results.isError ? (
          results.error instanceof ApiError && results.error.offline ? (
            <StatusMessage
              tone="offline"
              title="You're offline"
              description="These results haven't been saved on this device yet. Your favorites are still available."
              action={
                <Button asChild>
                  <Link to="/favorites">Open favorites</Link>
                </Button>
              }
            />
          ) : (
            <StatusMessage
              tone="error"
              title="Couldn't load recipes"
              description={results.error.message}
              action={<Button onClick={() => results.refetch()}>Try again</Button>}
            />
          )
        ) : total === 0 ? (
          <StatusMessage
            title="No recipes match"
            description={
              hasAnyFilter(filters)
                ? 'Try fewer filters, or a single word like "chicken" or "curry".'
                : 'The recipe index is empty.'
            }
            action={hasAnyFilter(filters) ? <Button variant="outline" onClick={() => setParams({})}>Clear search and filters</Button> : undefined}
          />
        ) : (
          <>
            <ul className={cn(gridClass, results.isPlaceholderData && 'opacity-60 transition-opacity')} aria-labelledby="results-title" aria-busy={results.isPlaceholderData}>
              {meals.map(meal => (
                <li key={meal.id} className="flex">
                  <div className="w-full">
                    <MealCard meal={meal} />
                  </div>
                </li>
              ))}
            </ul>
            {results.hasNextPage && (
              <div className="flex flex-col items-center gap-2 pt-2">
                <p className="text-sm text-muted-foreground">
                  Showing {meals.length} of {total}
                </p>
                <Button variant="outline" onClick={() => results.fetchNextPage()} disabled={results.isFetchingNextPage}>
                  {results.isFetchingNextPage && <Loader2 aria-hidden="true" className="animate-spin" />}
                  {results.isFetchingNextPage ? 'Loading…' : 'Show more recipes'}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** Every active filter as a removable chip, plus "Clear all". */
function ActiveFilters({ filters, onChange, onClear }: { filters: Filters; onChange: (patch: Partial<Filters>) => void; onClear: () => void }) {
  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (filters.q) chips.push({ key: 'q', label: `"${filters.q}"`, remove: () => onChange({ q: '' }) });
  if (filters.category) chips.push({ key: 'c', label: filters.category, remove: () => onChange({ category: '' }) });
  if (filters.cuisine) chips.push({ key: 'cuisine', label: filters.cuisine, remove: () => onChange({ cuisine: '' }) });
  filters.ingredients.forEach(item =>
    chips.push({ key: `ing-${item}`, label: `with ${item}`, remove: () => onChange({ ingredients: filters.ingredients.filter(other => other !== item) }) })
  );
  if (filters.time) chips.push({ key: 'time', label: TIME_LABELS[filters.time], remove: () => onChange({ time: '' }) });
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Active:</span>
      <ul className="contents">
        {chips.map(chip => (
          <li key={chip.key}>
            <button
              type="button"
              onClick={chip.remove}
              className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm hover:bg-accent"
              aria-label={`Remove filter: ${chip.label}`}
            >
              {chip.label}
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      {chips.length > 1 && (
        <Button variant="link" size="sm" className="h-auto px-1" onClick={onClear}>
          Clear all
        </Button>
      )}
    </div>
  );
}
