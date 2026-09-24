import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { divideNutrients, type IngredientEstimate, type Nutrients, type SkipReason } from '@/features/nutrition/estimate';
import { MAX_SERVINGS, useNutrition, useServings } from '@/features/nutrition/useNutrition';
import type { Meal } from '@/lib/meal';

const DETAILS: { key: keyof Nutrients; label: string }[] = [
  { key: 'protein', label: 'Protein' },
  { key: 'carbs', label: 'Carbs' },
  { key: 'fat', label: 'Fat' },
  { key: 'fibre', label: 'Fibre' },
  { key: 'sugars', label: 'Sugars' },
  { key: 'saturates', label: 'Saturates' },
  { key: 'salt', label: 'Salt' }
];

const SKIP_TEXT: Record<SkipReason, string> = {
  'no-amount': 'no amount given',
  'unknown-food': 'not in the nutrition data',
  'unknown-unit': "can't weigh this measure"
};

/** 0.4 -> "0.4", 12.6 -> "13" */
const grams = (value: number) => (value < 10 ? String(Math.round(value * 10) / 10) : String(Math.round(value)));

/**
 * Calories and nutrients per serving, estimated from USDA data for each
 * ingredient. Says how many ingredients it counted, and shows the working.
 */
export function NutritionCard({ meal }: { meal: Meal }) {
  const { estimate, source, isLoading, error } = useNutrition(meal);
  const [servings, setServings] = useServings(meal.id);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle>
          <h2 id="nutrition-title">Nutrition</h2>
        </CardTitle>
        <div className="flex items-center gap-1 text-sm" role="group" aria-label="Servings">
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Fewer servings" disabled={servings <= 1} onClick={() => setServings(servings - 1)}>
            <Minus aria-hidden="true" />
          </Button>
          <span className="min-w-[5.5rem] text-center tabular-nums" aria-live="polite">
            Serves {servings}
          </span>
          <Button variant="outline" size="icon" className="h-8 w-8" aria-label="More servings" disabled={servings >= MAX_SERVINGS} onClick={() => setServings(servings + 1)}>
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error ? (
          <p className="text-sm text-muted-foreground">The nutrition data couldn't be loaded. Check your connection and reload the page.</p>
        ) : isLoading || !estimate ? (
          <div role="status" className="space-y-3">
            <span className="sr-only">Loading nutrition…</span>
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : estimate.counted === 0 ? (
          <p className="text-sm text-muted-foreground">None of this recipe's ingredients could be matched to nutrition data, so there's no estimate.</p>
        ) : (
          <PerServing
            perServing={divideNutrients(estimate.total, servings)}
            counted={estimate.counted}
            ingredients={estimate.ingredients}
            servings={servings}
            source={source}
          />
        )}
      </CardContent>
    </Card>
  );
}

function PerServing({ perServing, counted, ingredients, servings, source }: { perServing: Nutrients; counted: number; ingredients: IngredientEstimate[]; servings: number; source?: string }) {
  const total = ingredients.length;
  // Missing more than a quarter of the ingredients: the numbers are probably low
  const partial = counted / total < 0.75;
  const frying = ingredients.some(item => item.frying);

  return (
    <>
      <div>
        <p className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums tracking-tight">{Math.round(perServing.kcal)}</span>
          <span className="text-muted-foreground">kcal per serving</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Estimated from {counted} of {total} ingredients.
          {partial && ' Several couldn’t be counted, so the real figures are probably higher.'}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DETAILS.map(({ key, label }) => (
          <div key={key} className="rounded-lg border px-3 py-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{grams(perServing[key])} g</dd>
          </div>
        ))}
      </dl>

      <details className="group text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">How this is worked out</summary>
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground">
            Each ingredient is matched to a food in {source ?? 'USDA FoodData Central'} and weighed from its measure. TheMealDB doesn't list serving sizes, so
            the recipe is divided by the servings above.
            {frying && ' Most frying oil stays in the pan, so only a tenth of it is counted.'}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <caption className="sr-only">Nutrition by ingredient, for the whole recipe ({servings} servings)</caption>
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="py-1 pr-3 font-medium">Ingredient</th>
                  <th scope="col" className="py-1 pr-3 font-medium">Counted as</th>
                  <th scope="col" className="py-1 text-right font-medium">kcal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ingredients.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="align-top">
                    <th scope="row" className="py-1.5 pr-3 font-normal">
                      {item.name}
                      {item.measure && <span className="text-muted-foreground"> · {item.measure}</span>}
                    </th>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {item.nutrients ? (
                        <>
                          {grams(item.grams ?? 0)} g {item.food}
                          {item.frying && ' (a tenth of the frying oil)'}
                        </>
                      ) : (
                        <>Not counted: {SKIP_TEXT[item.skipped ?? 'unknown-food']}</>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{item.nutrients ? Math.round(item.nutrients.kcal) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </>
  );
}
