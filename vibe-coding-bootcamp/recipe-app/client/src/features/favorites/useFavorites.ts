/**
 * React hooks over the IndexedDB favorites store. React Query holds the list
 * in memory so every heart on the page agrees; IndexedDB is the source of
 * truth and survives reloads and going offline.
 */
import { useEffect, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, queryKeys } from '@/lib/api';
import type { Meal, MealSummary } from '@/lib/meal';
import {
  clearFavorites,
  getAllFavorites,
  onFavoritesChanged,
  removeFavorite,
  saveFavorite,
  type FavoriteRecord
} from './db';

export function useFavorites() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.favorites,
    queryFn: getAllFavorites,
    // Local data: never wait for the network, never go stale on its own
    networkMode: 'always',
    staleTime: Infinity
  });

  // Re-read after any change: from another tab, or a photo attached after saving
  useEffect(
    () => onFavoritesChanged(() => queryClient.invalidateQueries({ queryKey: queryKeys.favorites })),
    [queryClient]
  );

  const favorites = query.data ?? [];
  const ids = useMemo(() => new Set(favorites.map(record => record.id)), [favorites]);

  return {
    favorites,
    isLoading: query.isLoading,
    error: query.error,
    isFavorite: (id: string) => ids.has(id)
  };
}

function isFullMeal(meal: Meal | MealSummary): meal is Meal {
  return 'ingredients' in meal;
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ meal, favorite }: { meal: Meal | MealSummary; favorite: boolean }) => {
      if (!favorite) {
        await removeFavorite(meal.id);
        return { name: meal.name, favorite };
      }
      // Cards from a category list only have a name and photo, so the full
      // recipe is loaded first. Offline, this comes from the service worker's
      // cache if the recipe was opened before.
      const full = isFullMeal(meal)
        ? meal
        : await queryClient.fetchQuery({
            queryKey: queryKeys.meal(meal.id),
            queryFn: ({ signal }) => api.meal(meal.id, signal),
            staleTime: 5 * 60 * 1000
          });
      await saveFavorite(full);
      return { name: meal.name, favorite };
    },
    // Flip the heart immediately; the real list is re-read after saving
    onMutate: async ({ meal, favorite }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites });
      const previous = queryClient.getQueryData<FavoriteRecord[]>(queryKeys.favorites);
      queryClient.setQueryData<FavoriteRecord[]>(queryKeys.favorites, (list = []) =>
        favorite
          ? [{ id: meal.id, meal: meal as Meal, savedAt: Date.now() }, ...list.filter(r => r.id !== meal.id)]
          : list.filter(record => record.id !== meal.id)
      );
      return { previous };
    },
    onError: (error, { meal, favorite }, context) => {
      queryClient.setQueryData(queryKeys.favorites, context?.previous);
      const reason = error instanceof ApiError && error.offline
        ? "You're offline and this recipe hasn't been opened before, so it can't be saved yet."
        : error instanceof Error ? error.message : 'Something went wrong.';
      toast.error(favorite ? `Couldn't save "${meal.name}"` : `Couldn't remove "${meal.name}"`, { description: reason });
    },
    onSuccess: ({ name, favorite }) => {
      toast.success(favorite ? `Saved "${name}" to favorites` : `Removed "${name}" from favorites`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.favorites })
  });
}

export function useClearFavorites() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearFavorites,
    onSuccess: () => toast.success('All favorites removed'),
    onError: () => toast.error("Couldn't remove favorites"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.favorites })
  });
}
