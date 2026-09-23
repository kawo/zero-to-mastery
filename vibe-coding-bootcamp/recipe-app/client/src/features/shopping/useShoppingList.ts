/**
 * React hooks for the shopping list. The stored state (recipes, extras,
 * ticks) is read with React Query; the aggregated list is derived from it.
 */
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import type { Meal, MealSummary } from '@/lib/meal';
import { aggregate } from './aggregate';
import { addRecipe, getShoppingState, onShoppingChanged, removeRecipe } from './db';

export const shoppingKey = ['shopping'] as const;

export function useShoppingList() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: shoppingKey,
    queryFn: getShoppingState,
    networkMode: 'always',
    staleTime: Infinity
  });

  // Re-read after any change, in this tab or another
  useEffect(
    () => onShoppingChanged(() => queryClient.invalidateQueries({ queryKey: shoppingKey })),
    [queryClient]
  );

  const state = query.data;
  const items = useMemo(() => (state ? aggregate(state.recipes, state.extras) : []), [state]);
  const recipeIds = useMemo(() => new Set(state?.recipes.map(recipe => recipe.id)), [state]);

  return {
    recipes: state?.recipes ?? [],
    extras: state?.extras ?? [],
    checked: state?.checked ?? new Set<string>(),
    items,
    isLoading: query.isLoading,
    error: query.error,
    isOnList: (id: string) => recipeIds.has(id)
  };
}

const isFullMeal = (meal: Meal | MealSummary): meal is Meal => 'ingredients' in meal;

/** Adds or removes a recipe; cards only have a summary, so the full recipe is loaded first. */
export function useToggleOnList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async ({ meal, add }: { meal: Meal | MealSummary; add: boolean }) => {
      if (!add) {
        await removeRecipe(meal.id);
        return;
      }
      const full = isFullMeal(meal)
        ? meal
        : await queryClient.fetchQuery({
            queryKey: ['meal', meal.id],
            queryFn: ({ signal }) => api.meal(meal.id, signal),
            staleTime: 5 * 60 * 1000
          });
      await addRecipe(full);
    },
    onSuccess: (_result, { meal, add }) => {
      if (add) {
        toast.success(`Added "${meal.name}" to your shopping list`, {
          action: { label: 'View list', onClick: () => navigate('/list') }
        });
      } else {
        toast(`Removed "${meal.name}" from your shopping list`);
      }
    },
    onError: (error, { meal }) => {
      const reason = error instanceof ApiError && error.offline
        ? "You're offline and this recipe hasn't been opened before."
        : error instanceof Error ? error.message : 'Something went wrong.';
      toast.error(`Couldn't update the list for "${meal.name}"`, { description: reason });
    }
  });
}
