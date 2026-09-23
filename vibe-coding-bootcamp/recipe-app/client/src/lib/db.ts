/**
 * The app's IndexedDB database ("recipes"), shared by favorites and the
 * shopping list. Everything here works offline.
 *
 * Versions (each upgrade step runs once, in order, so any older database
 * reaches the latest schema without losing data):
 *   1  favorites
 *   2  shoppingRecipes, shoppingExtras, shoppingChecked
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Meal } from './meal';

export interface FavoriteRecord {
  id: string;
  meal: Meal;
  savedAt: number;
  image?: Blob;
}

/** A recipe on the shopping list, with how many batches to buy for. */
export interface ShoppingRecipe {
  id: string;
  meal: Meal;
  batches: number;
  addedAt: number;
}

/** Something added to the list by hand ("washing-up liquid"). */
export interface ShoppingExtra {
  id: string;
  name: string;
  addedAt: number;
}

/** A ticked-off list item, by its aggregated key (see features/shopping/aggregate.ts). */
export interface ShoppingChecked {
  key: string;
  checkedAt: number;
}

export interface RecipesDB extends DBSchema {
  favorites: {
    key: string;
    value: FavoriteRecord;
    indexes: { savedAt: number };
  };
  shoppingRecipes: {
    key: string;
    value: ShoppingRecipe;
  };
  shoppingExtras: {
    key: string;
    value: ShoppingExtra;
  };
  shoppingChecked: {
    key: string;
    value: ShoppingChecked;
  };
}

const DB_NAME = 'recipes';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<RecipesDB>> | null = null;

export function db() {
  dbPromise ??= openDB<RecipesDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const favorites = database.createObjectStore('favorites', { keyPath: 'id' });
        favorites.createIndex('savedAt', 'savedAt');
      }
      if (oldVersion < 2) {
        database.createObjectStore('shoppingRecipes', { keyPath: 'id' });
        database.createObjectStore('shoppingExtras', { keyPath: 'id' });
        database.createObjectStore('shoppingChecked', { keyPath: 'key' });
      }
    },
    // Another tab still has the old version open: close ours so its upgrade can
    // proceed, and reopen on next use
    blocking() {
      void dbPromise?.then(database => database.close());
      dbPromise = null;
    }
  });
  return dbPromise;
}

/**
 * Change notifications for one kind of data: to this tab's listeners and,
 * over BroadcastChannel, to other open tabs.
 */
export function changeChannel(name: string) {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(name) : null;
  const localListeners = new Set<() => void>();
  return {
    announce() {
      localListeners.forEach(listener => listener());
      channel?.postMessage('changed');
    },
    subscribe(listener: () => void): () => void {
      const handler = () => listener();
      localListeners.add(handler);
      channel?.addEventListener('message', handler);
      return () => {
        localListeners.delete(handler);
        channel?.removeEventListener('message', handler);
      };
    }
  };
}
