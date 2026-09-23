import { useId, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FileJson, FileSpreadsheet, Minus, Plus, Printer, RotateCcw, Trash2, X } from 'lucide-react';
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
import { StatusMessage } from '@/components/StatusMessage';
import { UnitToggle } from '@/components/UnitToggle';
import { Skeleton } from '@/components/ui/skeleton';
import { AISLES, type ShoppingItem } from '@/features/shopping/aggregate';
import { addExtra, clearShoppingList, MAX_BATCHES, removeExtra, removeRecipe, setBatches, setChecked, uncheckAll, type ShoppingRecipe } from '@/features/shopping/db';
import { download, exportFilename, toCsv, toJson } from '@/features/shopping/export';
import { useShoppingList } from '@/features/shopping/useShoppingList';
import { previewImage } from '@/lib/meal';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { cn } from '@/lib/utils';

const HIDE_TICKED_KEY = 'shopping:hideTicked';

function readHideTicked() {
  try {
    return localStorage.getItem(HIDE_TICKED_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * The shopping list: recipes on it (with how many batches), the combined
 * ingredients grouped by aisle with tick boxes, items added by hand, and
 * CSV / JSON / print export. Works offline (everything is in IndexedDB).
 */
export default function ShoppingList() {
  useDocumentTitle('Shopping list');
  const { recipes, items, checked, isLoading, error } = useShoppingList();
  const [hideTicked, setHideTicked] = useState(readHideTicked);
  const hideId = useId();

  const byAisle = useMemo(() => {
    const visible = hideTicked ? items.filter(item => !checked.has(item.key)) : items;
    return AISLES.map(aisle => ({ aisle, items: visible.filter(item => item.aisle === aisle) })).filter(group => group.items.length);
  }, [items, checked, hideTicked]);

  const tickedCount = items.filter(item => checked.has(item.key)).length;

  const toggleHideTicked = (value: boolean) => {
    setHideTicked(value);
    try {
      localStorage.setItem(HIDE_TICKED_KEY, String(value));
    } catch {
      // Private mode: the choice lasts for this visit
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4" role="status">
        <span className="sr-only">Loading shopping list…</span>
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <StatusMessage tone="error" title="Couldn't open your shopping list" description="This browser blocked local storage (private browsing can do this)." />;
  }

  const empty = items.length === 0;

  return (
    <div className="space-y-8 print:space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Shopping list</h1>
          <p className="mt-1 text-muted-foreground" aria-live="polite">
            {empty
              ? 'Nothing on it yet.'
              : `${items.length} ${items.length === 1 ? 'item' : 'items'}${recipes.length ? ` for ${recipes.length} ${recipes.length === 1 ? 'recipe' : 'recipes'}` : ''}${tickedCount ? ` · ${tickedCount} ticked` : ''}`}
          </p>
          <p className="hidden text-sm print:block">Printed {new Date().toLocaleDateString()}</p>
        </div>
        {!empty && <ListActions />}
      </header>

      {empty ? (
        <StatusMessage
          title="Your shopping list is empty"
          description="Tap the basket on any recipe to add its ingredients. Amounts from several recipes are added up for you."
          action={
            <Button asChild>
              <Link to="/">Browse recipes</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] print:block">
          <section aria-labelledby="items-title" className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
              <h2 id="items-title" className="text-xl font-semibold">
                Items
              </h2>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <UnitToggle />
                <label htmlFor={hideId} className="flex cursor-pointer items-center gap-2">
                  <input
                    id={hideId}
                    type="checkbox"
                    checked={hideTicked}
                    onChange={event => toggleHideTicked(event.target.checked)}
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                  />
                  Hide ticked
                </label>
                {tickedCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => void uncheckAll()}>
                    <RotateCcw aria-hidden="true" />
                    Untick all
                  </Button>
                )}
              </div>
            </div>

            {byAisle.length === 0 ? (
              <p className="text-muted-foreground">Everything is ticked off.</p>
            ) : (
              byAisle.map(group => (
                <section key={group.aisle} aria-labelledby={`aisle-${group.aisle}`} className="break-inside-avoid">
                  <h3 id={`aisle-${group.aisle}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.aisle}
                  </h3>
                  <ul className="divide-y rounded-lg border bg-card print:rounded-none print:border-0">
                    {group.items.map(item => (
                      <ItemRow key={item.key} item={item} checked={checked.has(item.key)} />
                    ))}
                  </ul>
                </section>
              ))
            )}

            <AddItemForm />
          </section>

          <aside aria-labelledby="recipes-title" className="space-y-3 print:mt-6">
            <h2 id="recipes-title" className="text-xl font-semibold print:text-base">
              Recipes
            </h2>
            {recipes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Only items you added by hand.</p>
            ) : (
              <ul className="space-y-2">
                {recipes.map(recipe => (
                  <RecipeRow key={recipe.id} recipe={recipe} />
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function ListActions() {
  const { items, checked, recipes } = useShoppingList();
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" onClick={() => download(exportFilename('csv'), toCsv(items, checked), 'text/csv;charset=utf-8')}>
        <FileSpreadsheet aria-hidden="true" />
        CSV
      </Button>
      <Button variant="outline" onClick={() => download(exportFilename('json'), toJson(items, checked, recipes), 'application/json')}>
        <FileJson aria-hidden="true" />
        JSON
      </Button>
      <Button variant="outline" onClick={() => window.print()}>
        <Printer aria-hidden="true" />
        Print
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" className="text-muted-foreground hover:text-destructive">
            <Trash2 aria-hidden="true" />
            Clear
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear the shopping list?</DialogTitle>
            <DialogDescription>This removes every recipe, item and tick from the list. It can't be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="destructive" onClick={() => void clearShoppingList()}>
                Clear list
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ItemRow({ item, checked }: { item: ShoppingItem; checked: boolean }) {
  const id = useId();
  const details = [item.notes.join(', '), item.recipes.length ? `for ${item.recipes.join(', ')}` : ''].filter(Boolean).join(' · ');

  return (
    <li className="flex items-start gap-3 px-3 py-2.5 print:px-0 print:py-1">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={event => void setChecked(item.key, event.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--primary))]"
      />
      <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
        <span className={cn('font-medium', checked && 'text-muted-foreground line-through')}>{item.name}</span>
        {item.quantity && <span className={cn('ml-2 tabular-nums', checked ? 'text-muted-foreground line-through' : 'text-foreground')}>{item.quantity}</span>}
        {details && <span className="block text-sm text-muted-foreground">{details}</span>}
      </label>
      {item.extra && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 print:hidden"
          aria-label={`Remove ${item.name}`}
          onClick={() => void removeExtra(item.key.replace(/^extra:/, ''))}
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

function RecipeRow({ recipe }: { recipe: ShoppingRecipe }) {
  const { meal, batches } = recipe;
  const change = (delta: number) => void setBatches(recipe.id, batches === 0.5 && delta > 0 ? 1 : batches + delta);

  return (
    <li className="flex items-center gap-3 rounded-lg border bg-card p-2 print:border-0 print:p-0">
      <img
        src={previewImage(meal.thumbnail) ?? '/icons/icon-192.png'}
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 shrink-0 rounded-md bg-muted object-cover print:hidden"
      />
      <div className="min-w-0 flex-1 print:flex print:gap-1">
        <Link to={`/meal/${meal.id}`} className="line-clamp-2 text-sm font-medium hover:underline print:line-clamp-none">
          {meal.name}
        </Link>
        <span className="hidden text-sm print:inline">× {batches === 0.5 ? '½' : batches}</span>
      </div>
      <div className="flex items-center gap-1 print:hidden" role="group" aria-label={`Batches of ${meal.name}`}>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Fewer batches"
          disabled={batches <= 0.5}
          onClick={() => (batches <= 1 ? void setBatches(recipe.id, 0.5) : change(-1))}
        >
          <Minus aria-hidden="true" />
        </Button>
        <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
          <span className="sr-only">Batches: </span>
          {batches === 0.5 ? '½' : batches}×
        </span>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="More batches" disabled={batches >= MAX_BATCHES} onClick={() => change(1)}>
          <Plus aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${meal.name} from the list`} onClick={() => void removeRecipe(recipe.id)}>
          <X aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}

function AddItemForm() {
  const [text, setText] = useState('');
  const id = useId();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    await addExtra(text);
    setText('');
  };
  return (
    <form onSubmit={submit} className="flex gap-2 print:hidden">
      <label htmlFor={id} className="sr-only">
        Add an item
      </label>
      <Input id={id} value={text} onChange={event => setText(event.target.value)} placeholder="Add something else, e.g. kitchen roll" maxLength={100} />
      <Button type="submit" variant="outline" disabled={!text.trim()}>
        <Plus aria-hidden="true" />
        Add
      </Button>
    </form>
  );
}
