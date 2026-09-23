/**
 * Shopping list storage, in IndexedDB so the list works offline:
 *   shoppingRecipes  recipes on the list (full recipe + batch multiplier)
 *   shoppingExtras   items typed in by hand
 *   shoppingChecked  items ticked off, by aggregated item key
 * The list itself is worked out from these by aggregate.ts, so it always
 * reflects the current recipes and batch counts.
 */
import { changeChannel, db, type ShoppingExtra, type ShoppingRecipe } from '@/lib/db';
import type { Meal } from '@/lib/meal';

export type { ShoppingExtra, ShoppingRecipe };

const changes = changeChannel('recipes-shopping');
export const onShoppingChanged = changes.subscribe;

export const MAX_BATCHES = 12;

export interface ShoppingState {
  recipes: ShoppingRecipe[];
  extras: ShoppingExtra[];
  checked: Set<string>;
}

export async function getShoppingState(): Promise<ShoppingState> {
  const database = await db();
  const [recipes, extras, checked] = await Promise.all([
    database.getAll('shoppingRecipes'),
    database.getAll('shoppingExtras'),
    database.getAllKeys('shoppingChecked')
  ]);
  return {
    recipes: recipes.sort((a, b) => a.addedAt - b.addedAt),
    extras: extras.sort((a, b) => a.addedAt - b.addedAt),
    checked: new Set(checked)
  };
}

export async function addRecipe(meal: Meal): Promise<void> {
  const database = await db();
  const existing = await database.get('shoppingRecipes', meal.id);
  await database.put('shoppingRecipes', { id: meal.id, meal, batches: existing?.batches ?? 1, addedAt: existing?.addedAt ?? Date.now() });
  changes.announce();
}

export async function removeRecipe(id: string): Promise<void> {
  await (await db()).delete('shoppingRecipes', id);
  changes.announce();
}

export async function setBatches(id: string, batches: number): Promise<void> {
  const database = await db();
  const tx = database.transaction('shoppingRecipes', 'readwrite');
  const record = await tx.store.get(id);
  if (record) await tx.store.put({ ...record, batches: Math.min(MAX_BATCHES, Math.max(0.5, batches)) });
  await tx.done;
  changes.announce();
}

export async function addExtra(name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 100);
  if (!trimmed) return;
  await (await db()).put('shoppingExtras', { id: crypto.randomUUID(), name: trimmed, addedAt: Date.now() });
  changes.announce();
}

export async function removeExtra(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(['shoppingExtras', 'shoppingChecked'], 'readwrite');
  await tx.objectStore('shoppingExtras').delete(id);
  await tx.objectStore('shoppingChecked').delete(`extra:${id}`);
  await tx.done;
  changes.announce();
}

export async function setChecked(key: string, checked: boolean): Promise<void> {
  const database = await db();
  if (checked) await database.put('shoppingChecked', { key, checkedAt: Date.now() });
  else await database.delete('shoppingChecked', key);
  changes.announce();
}

export async function uncheckAll(): Promise<void> {
  await (await db()).clear('shoppingChecked');
  changes.announce();
}

export async function clearShoppingList(): Promise<void> {
  const database = await db();
  const tx = database.transaction(['shoppingRecipes', 'shoppingExtras', 'shoppingChecked'], 'readwrite');
  await Promise.all([
    tx.objectStore('shoppingRecipes').clear(),
    tx.objectStore('shoppingExtras').clear(),
    tx.objectStore('shoppingChecked').clear(),
    tx.done
  ]);
  changes.announce();
}
