import { useEffect, useId, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { queryKeys, suggestIngredients, type RecipeSearch } from '@/lib/api';
import { TIME_LABELS, type Filters, type TimeBucket } from '@/lib/filters';
import { cn } from '@/lib/utils';

const MAX_INGREDIENTS = 10;

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * Cuisine, ingredients and estimated time. Each option shows how many recipes
 * it would give with the other filters as they are (facet counts).
 */
export function FilterPanel({
  filters,
  facets,
  onChange
}: {
  filters: Filters;
  facets: RecipeSearch['facets'] | undefined;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const ids = { cuisine: useId(), ingredient: useId(), suggestions: useId(), time: useId() };

  // Keep the chosen cuisine listed even if it has no results with the other filters
  const cuisines = facets?.cuisines ?? [];
  const cuisineOptions = filters.cuisine && !cuisines.some(c => c.name === filters.cuisine)
    ? [{ name: filters.cuisine, count: 0 }, ...cuisines]
    : cuisines;

  return (
    <div className="grid gap-5 rounded-xl border bg-card p-4 md:grid-cols-3">
      <div className="space-y-1.5">
        <label htmlFor={ids.cuisine} className="text-sm font-medium">
          Cuisine
        </label>
        <select id={ids.cuisine} className={selectClass} value={filters.cuisine} onChange={event => onChange({ cuisine: event.target.value })}>
          <option value="">Any cuisine</option>
          {cuisineOptions.map(option => (
            <option key={option.name} value={option.name}>
              {option.name} ({option.count})
            </option>
          ))}
        </select>
      </div>

      <IngredientPicker
        ids={ids}
        selected={filters.ingredients}
        onChange={ingredients => onChange({ ingredients })}
      />

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Total time (estimated)</legend>
        <div className="flex flex-wrap gap-1.5">
          {([['', 'Any'], ...Object.entries(TIME_LABELS)] as [TimeBucket | '', string][]).map(([value, label]) => {
            const count = facets?.time.find(t => t.bucket === value)?.count;
            const checked = filters.time === value;
            return (
              <label
                key={value || 'any'}
                className={cn(
                  'cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring hover:bg-accent',
                  checked && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                <input
                  type="radio"
                  name={ids.time}
                  value={value}
                  checked={checked}
                  onChange={() => onChange({ time: value })}
                  className="sr-only"
                />
                {label}
                {value && count !== undefined && <span className={checked ? 'opacity-90' : 'text-muted-foreground'}> ({count})</span>}
              </label>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Worked out from the times in each method. TheMealDB doesn't list cook times.</p>
      </fieldset>
    </div>
  );
}

/** Text box with suggestions from the index; every added ingredient must be in the recipe. */
function IngredientPicker({
  ids,
  selected,
  onChange
}: {
  ids: { ingredient: string; suggestions: string };
  selected: string[];
  onChange: (ingredients: string[]) => void;
}) {
  const [text, setText] = useState('');
  const prefix = useDebounced(text.trim().toLowerCase(), 200);
  const suggestions = useQuery({
    queryKey: queryKeys.ingredients(prefix),
    queryFn: ({ signal }) => suggestIngredients(prefix, signal),
    enabled: prefix.length >= 2,
    staleTime: 60 * 60 * 1000
  });
  const full = selected.length >= MAX_INGREDIENTS;

  const add = (event?: FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || full) return;
    if (!selected.some(item => item.toLowerCase() === value.toLowerCase())) onChange([...selected, value]);
    setText('');
  };

  return (
    <div className="space-y-1.5">
      <label htmlFor={ids.ingredient} className="text-sm font-medium">
        Must include
      </label>
      {/* A form of its own so Enter adds the ingredient */}
      <form onSubmit={add} className="flex gap-2">
        <Input
          id={ids.ingredient}
          value={text}
          onChange={event => setText(event.target.value)}
          list={ids.suggestions}
          placeholder={full ? `Up to ${MAX_INGREDIENTS} ingredients` : 'e.g. garlic'}
          disabled={full}
          maxLength={50}
          autoComplete="off"
        />
        <Button type="submit" variant="outline" size="icon" disabled={!text.trim() || full} aria-label="Add ingredient">
          <Plus aria-hidden="true" />
        </Button>
      </form>
      <datalist id={ids.suggestions}>
        {suggestions.data?.map(item => (
          <option key={item.name} value={item.name}>
            {item.count} recipes
          </option>
        ))}
      </datalist>
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Required ingredients">
          {selected.map(item => (
            <li key={item}>
              <button
                type="button"
                onClick={() => onChange(selected.filter(other => other !== item))}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-sm hover:bg-secondary/70"
                aria-label={`Remove ${item}`}
              >
                {item}
                <X aria-hidden="true" className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
