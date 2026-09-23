import { useEffect, useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { MealCard, MealGridSkeleton, gridClass } from '@/components/MealCard';
import { StatusMessage } from '@/components/StatusMessage';
import { useClearFavorites, useFavorites, useToggleFavorite } from '@/features/favorites/useFavorites';
import type { FavoriteRecord } from '@/features/favorites/db';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

type Sort = 'recent' | 'oldest' | 'name' | 'name-desc' | 'category';

const SORTS: Record<Sort, { label: string; compare: (a: FavoriteRecord, b: FavoriteRecord) => number }> = {
  recent: { label: 'Recently saved', compare: (a, b) => b.savedAt - a.savedAt },
  oldest: { label: 'Oldest saved', compare: (a, b) => a.savedAt - b.savedAt },
  name: { label: 'Name, A to Z', compare: (a, b) => a.meal.name.localeCompare(b.meal.name) },
  'name-desc': { label: 'Name, Z to A', compare: (a, b) => b.meal.name.localeCompare(a.meal.name) },
  category: {
    label: 'Category',
    compare: (a, b) => (a.meal.category ?? '').localeCompare(b.meal.category ?? '') || a.meal.name.localeCompare(b.meal.name)
  }
};

const selectClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * Object URLs for the photos stored with favorites, so they show offline.
 * Revoked when the list changes or the page closes, to free the memory.
 */
function useStoredImages(records: FavoriteRecord[]) {
  const urls = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach(record => {
      if (record.image) map.set(record.id, URL.createObjectURL(record.image));
    });
    return map;
  }, [records]);
  useEffect(() => () => urls.forEach(url => URL.revokeObjectURL(url)), [urls]);
  return urls;
}

/** Saved recipes from IndexedDB: works the same online and offline. */
export default function Favorites() {
  useDocumentTitle('Favorites');
  const { favorites, isLoading, error } = useFavorites();
  const toggle = useToggleFavorite();
  const clearAll = useClearFavorites();
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const images = useStoredImages(favorites);
  const ids = { filter: useId(), category: useId(), sort: useId() };

  const categories = useMemo(
    () => [...new Set(favorites.map(record => record.meal.category).filter(Boolean) as string[])].sort(),
    [favorites]
  );

  // A category that no longer has favorites falls back to "All"
  const activeCategory = categories.includes(category) ? category : '';

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return favorites
      .filter(record => !activeCategory || record.meal.category === activeCategory)
      .filter(record => {
        if (!needle) return true;
        const { name, area, category: cat, tags = [], ingredients = [] } = record.meal;
        return [name, area, cat, ...tags, ...ingredients.map(i => i.name)].some(text => text?.toLowerCase().includes(needle));
      })
      .sort(SORTS[sort].compare);
  }, [favorites, filter, activeCategory, sort]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Favorites</h1>
        <MealGridSkeleton count={4} label="Loading favorites" />
      </div>
    );
  }

  if (error) {
    return (
      <StatusMessage
        tone="error"
        title="Couldn't open your favorites"
        description="This browser blocked local storage (private browsing can do this)."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Favorites</h1>
          <p className="mt-1 text-muted-foreground">Saved on this device, so they're here even offline.</p>
        </div>
        {favorites.length > 0 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Trash2 aria-hidden="true" />
                Remove all
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove all favorites?</DialogTitle>
                <DialogDescription>
                  This removes {favorites.length} saved {favorites.length === 1 ? 'recipe' : 'recipes'} from this device. It can't be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive" onClick={() => clearAll.mutate()}>
                    Remove all
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {favorites.length === 0 ? (
        <StatusMessage
          title="No favorites yet"
          description="Tap the heart on any recipe to save it here. Saved recipes open even without a connection."
          action={
            <Button asChild>
              <Link to="/">Browse recipes</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filter and sort favorites">
            <div className="min-w-[12rem] flex-1 space-y-1">
              <label htmlFor={ids.filter} className="text-sm font-medium">
                Filter
              </label>
              <Input
                id={ids.filter}
                type="search"
                value={filter}
                onChange={event => setFilter(event.target.value)}
                placeholder="Name, ingredient, cuisine…"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={ids.category} className="block text-sm font-medium">
                Category
              </label>
              <select id={ids.category} className={selectClass} value={activeCategory} onChange={event => setCategory(event.target.value)}>
                <option value="">All</option>
                {categories.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={ids.sort} className="block text-sm font-medium">
                Sort by
              </label>
              <select id={ids.sort} className={selectClass} value={sort} onChange={event => setSort(event.target.value as Sort)}>
                {Object.entries(SORTS).map(([value, { label }]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {visible.length} of {favorites.length}
          </p>

          {visible.length === 0 ? (
            <StatusMessage
              title="No favorites match"
              action={
                <Button variant="outline" onClick={() => { setFilter(''); setCategory(''); }}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <ul className={gridClass} aria-label="Saved recipes">
              {visible.map(record => (
                <li key={record.id}>
                  <MealCard
                    meal={record.meal}
                    headingLevel={2}
                    imageSrc={images.get(record.id)}
                    actions={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 text-muted-foreground hover:text-destructive"
                        onClick={() => toggle.mutate({ meal: record.meal, favorite: false })}
                        aria-label={`Remove ${record.meal.name} from favorites`}
                      >
                        <Trash2 aria-hidden="true" />
                        Remove
                      </Button>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
