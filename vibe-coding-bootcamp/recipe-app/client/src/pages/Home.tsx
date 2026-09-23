import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Shuffle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MealCard, MealGridSkeleton, gridClass } from '@/components/MealCard';
import { SearchBar } from '@/components/SearchBar';
import { StatusMessage } from '@/components/StatusMessage';
import { api, ApiError, queryKeys } from '@/lib/api';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';

/** Categories shown on phones before "More" (about two rows at 360-400px) */
const CHIPS_ON_PHONE = 5;

const chipClass = (active: boolean) =>
  cn(
    'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
    active && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
  );

/**
 * Home: search, category chips and results. The current search (?q=) or
 * category (?c=) lives in the URL, so results are linkable and back works.
 */
export default function Home() {
  const [params, setParams] = useSearchParams();
  const query = (params.get('q') ?? '').trim();
  const category = params.get('c') ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [surprising, setSurprising] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  useDocumentTitle(query ? `"${query}"` : category || undefined);

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => api.categories(signal),
    staleTime: 60 * 60 * 1000
  });

  const results = useQuery({
    queryKey: category ? queryKeys.category(category) : queryKeys.search(query),
    queryFn: ({ signal }) => (category ? api.filterByCategory(category, signal) : api.search(query, signal))
  });

  const pickCategory = (name: string) => {
    setParams(name && name !== category ? { c: name } : {});
  };

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

  // Chips past the phone limit, not counting the selected one (always shown)
  const hiddenOnPhone = (categories.data ?? []).filter((item, index) => index >= CHIPS_ON_PHONE && item.name !== category).length;

  const heading = query ?`Results for "${query}"` : category ? `${category} recipes` : 'Recipes to try';
  const count = results.data?.length ?? 0;

  return (
    <div className="space-y-8">
      <section aria-labelledby="home-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 id="home-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
              What are we cooking?
            </h1>
            <p className="mt-1 text-muted-foreground">Search thousands of recipes, or browse by category.</p>
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
            <button type="button" className={chipClass(!category)} aria-pressed={!category} onClick={() => pickCategory('')}>
              All
            </button>
            {categories.data?.map((item, index) => {
              const collapsed = !showAllCategories && index >= CHIPS_ON_PHONE && item.name !== category;
              return (
                <button
                  key={item.name}
                  type="button"
                  className={cn(chipClass(item.name === category), collapsed && 'hidden sm:inline-block')}
                  aria-pressed={item.name === category}
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

      <section aria-labelledby="results-title" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="results-title" className="text-xl font-semibold">
            {heading}
          </h2>
          {results.isSuccess && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {count} {count === 1 ? 'recipe' : 'recipes'}
            </p>
          )}
        </div>

        {results.isLoading ? (
          <MealGridSkeleton label={`Loading ${heading.toLowerCase()}`} />
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
        ) : count === 0 ? (
          <StatusMessage
            title="No recipes found"
            description={query ? `Nothing matches "${query}". Try a single ingredient or dish, like "chicken" or "curry".` : 'This category is empty.'}
          />
        ) : (
          <ul className={gridClass} aria-labelledby="results-title">
            {results.data?.map(meal => (
              <li key={meal.id} className="flex">
                <div className="w-full">
                  <MealCard meal={meal} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
