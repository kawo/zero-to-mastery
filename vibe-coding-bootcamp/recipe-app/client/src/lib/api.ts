/**
 * Client for our own /api proxy. The browser never talks to TheMealDB:
 * every request here is a same-origin /api/* path, and the server adds the
 * API key.
 */
import { normalizeMeal, toSummary, type Meal, type MealSummary, type RawCategory, type RawMeal } from './meal';
import { filtersToParams, type Filters, type TimeBucket } from './filters';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when the service worker answered because we're offline and nothing was cached. */
    readonly offline = false
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    // No service worker yet (first visit) and no network
    throw new ApiError("You're offline and this hasn't been saved yet.", 0, true);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const offline = response.status === 503 && body?.offline === true;
    throw new ApiError(
      offline ? "You're offline and this hasn't been saved yet." : body?.error || `Request failed (${response.status})`,
      response.status,
      offline
    );
  }
  return body as T;
}

export interface Category {
  name: string;
  thumbnail: string | null;
  description: string;
}

export const api = {
  async search(query: string, signal?: AbortSignal): Promise<MealSummary[]> {
    const data = await getJson<{ meals: RawMeal[] }>(`/api/search?q=${encodeURIComponent(query)}`, signal);
    return data.meals.map(meal => toSummary(meal));
  },

  async meal(id: string, signal?: AbortSignal): Promise<Meal> {
    const data = await getJson<{ meal: RawMeal }>(`/api/meal/${encodeURIComponent(id)}`, signal);
    return normalizeMeal(data.meal);
  },

  async categories(signal?: AbortSignal): Promise<Category[]> {
    const data = await getJson<{ categories: RawCategory[] }>('/api/categories', signal);
    return data.categories.map(category => ({
      name: category.strCategory,
      thumbnail: category.strCategoryThumb || null,
      description: category.strCategoryDescription || ''
    }));
  },

  async filterByCategory(category: string, signal?: AbortSignal): Promise<MealSummary[]> {
    const data = await getJson<{ meals: RawMeal[] }>(`/api/filter?c=${encodeURIComponent(category)}`, signal);
    return data.meals.map(meal => toSummary(meal, category));
  },

  async random(): Promise<Meal> {
    const data = await getJson<{ meal: RawMeal }>('/api/random');
    return normalizeMeal(data.meal);
  }
};

/** A facet option with how many results picking it would give. */
export interface FacetCount {
  name: string;
  count: number;
}

export interface RecipeSearch {
  total: number;
  /** True when no whole-word match existed and partial words were used */
  matchedPrefix: boolean;
  results: MealSummary[];
  facets: {
    cuisines: FacetCount[];
    categories: FacetCount[];
    time: { bucket: TimeBucket; label: string; count: number }[];
  };
}

interface RawSearchResult {
  id: string;
  name: string;
  category: string | null;
  cuisine: string | null;
  thumbnail: string | null;
  cookMinutes: number | null;
  snippet?: string;
}

export const PAGE_SIZE = 24;

/** Full-text search and filters over the server's recipe index. */
export async function searchRecipes(filters: Filters, offset = 0, signal?: AbortSignal): Promise<RecipeSearch> {
  const params = filtersToParams(filters);
  params.set('limit', String(PAGE_SIZE));
  params.set('offset', String(offset));
  const data = await getJson<Omit<RecipeSearch, 'results'> & { results: RawSearchResult[] }>(`/api/recipes?${params}`, signal);
  return {
    ...data,
    results: data.results.map(result => ({
      id: result.id,
      name: result.name,
      thumbnail: result.thumbnail,
      category: result.category ?? undefined,
      area: result.cuisine ?? undefined,
      cookMinutes: result.cookMinutes,
      snippet: result.snippet
    }))
  };
}

export async function suggestIngredients(prefix: string, signal?: AbortSignal): Promise<FacetCount[]> {
  const data = await getJson<{ ingredients: FacetCount[] }>(`/api/ingredients?q=${encodeURIComponent(prefix)}`, signal);
  return data.ingredients;
}

/** React Query keys, kept in one place so invalidation stays consistent. */
export const queryKeys = {
  recipes: (filters: Filters) => ['recipes', filters] as const,
  ingredients: (prefix: string) => ['ingredients', prefix] as const,
  search: (query: string) => ['search', query] as const,
  meal: (id: string) => ['meal', id] as const,
  categories: ['categories'] as const,
  category: (name: string) => ['category', name] as const,
  favorites: ['favorites'] as const
};
