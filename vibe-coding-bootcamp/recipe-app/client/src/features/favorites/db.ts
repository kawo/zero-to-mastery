/**
 * Favorites, stored in IndexedDB (via the `idb` wrapper) so they work fully
 * offline. Each record holds the whole recipe plus, when it could be fetched,
 * the card photo as a Blob, so a favorite shows its picture offline even if
 * the browser has evicted the image from the service worker's cache.
 */
import { changeChannel, db, type FavoriteRecord } from '@/lib/db';
import { previewImage, type Meal } from '@/lib/meal';

export type { FavoriteRecord };

const IMAGE_TIMEOUT_MS = 5000;

// Every view of the favorites (this tab and others) stays in sync
const changes = changeChannel('recipes-favorites');
const announceChange = () => changes.announce();
export const onFavoritesChanged = changes.subscribe;

/** The card photo as a Blob, or undefined if it can't be fetched right now. */
async function fetchImage(url: string | null): Promise<Blob | undefined> {
  const src = previewImage(url);
  if (!src) return undefined;
  try {
    // Comes from the service worker cache when offline and already seen
    const response = await fetch(src, { signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return blob.type.startsWith('image/') ? blob : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Saves the recipe straight away, then attaches the photo when it arrives,
 * so the heart responds instantly even on a slow connection.
 */
export async function saveFavorite(meal: Meal): Promise<FavoriteRecord> {
  const database = await db();
  const existing = await database.get('favorites', meal.id);
  const record: FavoriteRecord = {
    id: meal.id,
    meal,
    // Re-saving keeps the original position in "recently saved" order
    savedAt: existing?.savedAt ?? Date.now(),
    image: existing?.image
  };
  await database.put('favorites', record);
  announceChange();

  if (!record.image) {
    void fetchImage(meal.thumbnail).then(async image => {
      if (!image) return;
      // Only if it's still a favorite: it may have been removed meanwhile
      const tx = database.transaction('favorites', 'readwrite');
      const current = await tx.store.get(meal.id);
      if (current) await tx.store.put({ ...current, image });
      await tx.done;
      if (current) announceChange();
    });
  }
  return record;
}

export async function removeFavorite(id: string): Promise<void> {
  await (await db()).delete('favorites', id);
  announceChange();
}

export async function getFavorite(id: string): Promise<FavoriteRecord | undefined> {
  return (await db()).get('favorites', id);
}

/** Newest first. */
export async function getAllFavorites(): Promise<FavoriteRecord[]> {
  const records = await (await db()).getAllFromIndex('favorites', 'savedAt');
  return records.reverse();
}

export async function clearFavorites(): Promise<void> {
  await (await db()).clear('favorites');
  announceChange();
}
