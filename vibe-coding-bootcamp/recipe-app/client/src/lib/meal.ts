/**
 * Types for TheMealDB data and helpers that turn its flat format
 * (strIngredient1..20, strMeasure1..20, comma-separated tags) into
 * something easier to render.
 */

/** A meal as TheMealDB returns it (after the server rewrites image URLs). */
export interface RawMeal {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strInstructions?: string | null;
  strMealThumb?: string | null;
  strTags?: string | null;
  strYoutube?: string | null;
  strSource?: string | null;
  [key: string]: string | null | undefined;
}

export interface RawCategory {
  idCategory: string;
  strCategory: string;
  strCategoryThumb?: string;
  strCategoryDescription?: string;
}

export interface Ingredient {
  name: string;
  measure: string;
}

/** Enough to draw a card. filter.php only returns these fields. */
export interface MealSummary {
  id: string;
  name: string;
  thumbnail: string | null;
  category?: string;
  area?: string;
  /** Estimated total time in minutes, worked out from the method text (TheMealDB has no times) */
  cookMinutes?: number | null;
  /** Where a text search matched, with \u0002 ... \u0003 around the hits */
  snippet?: string;
}

/** A full recipe. */
export interface Meal extends MealSummary {
  instructions: string;
  tags: string[];
  youtube: string | null;
  source: string | null;
  ingredients: Ingredient[];
}

const clean = (value: string | null | undefined) => (value ?? '').trim();

export function toSummary(raw: RawMeal, fallbackCategory?: string): MealSummary {
  return {
    id: raw.idMeal,
    name: clean(raw.strMeal),
    thumbnail: raw.strMealThumb || null,
    category: clean(raw.strCategory) || fallbackCategory || undefined,
    area: clean(raw.strArea) || undefined
  };
}

export function normalizeMeal(raw: RawMeal): Meal {
  const ingredients: Ingredient[] = [];
  // TheMealDB has fixed slots strIngredient1..strIngredient20; empty slots are "" or null
  for (let i = 1; i <= 20; i++) {
    const name = clean(raw[`strIngredient${i}`]);
    if (name) ingredients.push({ name, measure: clean(raw[`strMeasure${i}`]) });
  }
  return {
    ...toSummary(raw),
    instructions: clean(raw.strInstructions),
    tags: clean(raw.strTags).split(',').map(tag => tag.trim()).filter(Boolean),
    youtube: clean(raw.strYoutube) || null,
    source: clean(raw.strSource) || null,
    // Added by our server (see server/src/lib/cookTime.ts)
    cookMinutes: (raw as unknown as { estCookMinutes?: number | null }).estCookMinutes ?? null,
    ingredients
  };
}

/**
 * TheMealDB serves smaller versions of meal photos at ".../preview"
 * (about 250px, ~10 KB). Cards use those; the detail page uses the full image.
 */
export function previewImage(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.includes('/media/meals/') && !url.endsWith('/preview') ? `${url}/preview` : url;
}

/** Small ingredient photo, served through the same /api/images proxy. */
export function ingredientImage(name: string): string {
  return `/api/images/ingredients/${encodeURIComponent(name)}-small.png`;
}

/** "about 45 min", "about 1 h 30 min" */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Instructions as paragraphs, without "STEP 1" style headings on their own line. */
export function instructionSteps(instructions: string): string[] {
  return instructions
    .split(/\r?\n+/)
    .map(line => line.trim())
    .filter(line => line && !/^(step\s*)?\d+[.):]?$/i.test(line));
}
