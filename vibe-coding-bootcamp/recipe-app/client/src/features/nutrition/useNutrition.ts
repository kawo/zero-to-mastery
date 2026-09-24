/**
 * Nutrition for a recipe on screen. The USDA table (foods.json, about 14 KB
 * gzipped) is its own chunk, loaded the first time a recipe page needs it;
 * the service worker precaches it with the rest of the build, so it works
 * offline too.
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Meal } from '@/lib/meal';
import { estimateNutrition, type FoodTable } from './estimate';

export function useNutrition(meal: Meal | undefined) {
  const table = useQuery({
    queryKey: ['nutrition-table'],
    queryFn: () => import('./foods.json').then(module => module.default as unknown as FoodTable),
    staleTime: Infinity,
    gcTime: Infinity,
    networkMode: 'always'
  });
  const estimate = useMemo(() => (meal && table.data ? estimateNutrition(meal, table.data) : undefined), [meal, table.data]);
  return { estimate, source: table.data?.source, isLoading: table.isLoading, error: table.error };
}

export const DEFAULT_SERVINGS = 4;
export const MAX_SERVINGS = 24;

const servingsKey = (mealId: string) => `servings:${mealId}`;

function readServings(mealId: string): number {
  try {
    const saved = Number(localStorage.getItem(servingsKey(mealId)));
    return saved >= 1 && saved <= MAX_SERVINGS ? saved : DEFAULT_SERVINGS;
  } catch {
    return DEFAULT_SERVINGS;
  }
}

/**
 * How many people a recipe serves. TheMealDB doesn't say, so it starts at 4;
 * a change is remembered per recipe on this device.
 */
export function useServings(mealId: string): [number, (servings: number) => void] {
  const [state, setState] = useState(() => ({ mealId, servings: readServings(mealId) }));
  // Another recipe opened in the same page component: read its own setting
  const servings = state.mealId === mealId ? state.servings : readServings(mealId);

  const setServings = useCallback(
    (next: number) => {
      const clamped = Math.min(MAX_SERVINGS, Math.max(1, Math.round(next)));
      setState({ mealId, servings: clamped });
      try {
        if (clamped === DEFAULT_SERVINGS) localStorage.removeItem(servingsKey(mealId));
        else localStorage.setItem(servingsKey(mealId), String(clamped));
      } catch {
        // Private mode: the choice lasts for this visit
      }
    },
    [mealId]
  );

  return [servings, setServings];
}
