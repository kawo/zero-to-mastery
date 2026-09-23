import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CirclePlay, Clock, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AddToListButton } from '@/components/AddToListButton';
import { FavoriteButton } from '@/components/FavoriteButton';
import { StatusMessage } from '@/components/StatusMessage';
import { UnitToggle } from '@/components/UnitToggle';
import { useFavorites } from '@/features/favorites/useFavorites';
import { api, ApiError, queryKeys } from '@/lib/api';
import { formatMinutes, ingredientImage, instructionSteps } from '@/lib/meal';
import { convertMeasure } from '@/lib/measure';
import { useUnitSystem } from '@/lib/useUnitSystem';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { safeExternalUrl } from '@/lib/utils';

/**
 * A full recipe. Loads through the service worker (network first, cached copy
 * when offline); a saved favorite shows instantly and works with no network
 * and no cached copy at all.
 */
export default function Details() {
  const { id = '' } = useParams();
  const { favorites, isLoading: favoritesLoading } = useFavorites();
  const [units] = useUnitSystem();
  const saved = favorites.find(record => record.id === id)?.meal;
  // An optimistic placeholder (a card saved a moment ago) has no ingredients yet
  const savedFull = saved && 'ingredients' in saved ? saved : undefined;

  const query = useQuery({
    queryKey: queryKeys.meal(id),
    queryFn: ({ signal }) => api.meal(id, signal),
    enabled: /^\d+$/.test(id),
    placeholderData: savedFull
  });

  // Offline with no cached copy, the favorite is still a complete recipe
  const meal = query.data ?? savedFull;
  useDocumentTitle(meal?.name);

  if (!/^\d+$/.test(id)) {
    return <StatusMessage title="Recipe not found" description="That link doesn't point to a recipe." action={<BackLink />} />;
  }

  if (!meal) {
    if (query.isLoading || favoritesLoading) return <DetailsSkeleton />;
    const error = query.error;
    if (error instanceof ApiError && error.status === 404) {
      return <StatusMessage title="Recipe not found" description="It may have been removed from TheMealDB." action={<BackLink />} />;
    }
    if (error instanceof ApiError && error.offline) {
      return (
        <StatusMessage
          tone="offline"
          title="You're offline"
          description="This recipe hasn't been opened on this device before, so there's no saved copy."
          action={
            <Button asChild>
              <Link to="/favorites">Open favorites</Link>
            </Button>
          }
        />
      );
    }
    return (
      <StatusMessage
        tone="error"
        title="Couldn't load this recipe"
        description={error?.message}
        action={<Button onClick={() => query.refetch()}>Try again</Button>}
      />
    );
  }

  const youtube = safeExternalUrl(meal.youtube);
  const source = safeExternalUrl(meal.source);
  const steps = instructionSteps(meal.instructions);

  return (
    <article className="space-y-6">
      <BackLink />

      <div className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8">
        <div className="md:sticky md:top-24 md:self-start">
          <img
            src={meal.thumbnail ?? '/icons/icon-512.png'}
            alt={`Photo of ${meal.name}`}
            width={700}
            height={700}
            className="aspect-square w-full rounded-xl bg-muted object-cover shadow"
          />
        </div>

        <div className="space-y-6">
          <header className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">{meal.name}</h1>
            <div className="flex flex-wrap gap-1.5">
              {meal.category && <Badge>{meal.category}</Badge>}
              {meal.area && <Badge variant="outline">{meal.area}</Badge>}
              {meal.cookMinutes ? (
                <Badge variant="outline" className="gap-1" title="Worked out from the times in the method; TheMealDB doesn't list cook times">
                  <Clock aria-hidden="true" className="h-3 w-3" />
                  About {formatMinutes(meal.cookMinutes)} total (estimated)
                </Badge>
              ) : null}
              {meal.tags.map(tag => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <FavoriteButton meal={meal} showLabel variant="default" />
              <AddToListButton meal={meal} showLabel variant="outline" />
              {youtube && (
                <Button variant="outline" asChild>
                  <a href={youtube} target="_blank" rel="noopener noreferrer">
                    <CirclePlay aria-hidden="true" />
                    Watch on YouTube
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              )}
              {source && (
                <Button variant="ghost" asChild>
                  <a href={source} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden="true" />
                    Original recipe
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              )}
            </div>
          </header>

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <CardTitle>
                <h2>Ingredients</h2>
              </CardTitle>
              <UnitToggle />
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2">
                {meal.ingredients.map(({ name, measure }, index) => {
                  const shown = convertMeasure(measure, units);
                  return (
                    <li key={`${name}-${index}`} className="flex items-center gap-3">
                      <img
                        src={ingredientImage(name)}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        className="h-10 w-10 shrink-0 rounded-md bg-muted object-contain"
                        onError={event => {
                          event.currentTarget.style.visibility = 'hidden';
                        }}
                      />
                      <span>
                        <span className="font-medium">{name}</span>
                        {shown && (
                          <span className="text-muted-foreground" title={shown === measure ? undefined : `Recipe says ${measure}`}> · {shown}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <section aria-labelledby="method-title" className="space-y-3">
            <h2 id="method-title" className="text-xl font-semibold">
              Method
            </h2>
            {steps.length > 1 ? (
              <ol className="list-decimal space-y-3 pl-6 marker:font-semibold marker:text-primary">
                {steps.map((step, index) => (
                  <li key={index} className="pl-1 leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="leading-relaxed">{steps[0] ?? 'No instructions provided.'}</p>
            )}
          </section>
        </div>
      </div>
    </article>
  );
}

function BackLink() {
  return (
    <Button variant="ghost" size="sm" asChild className="-ml-2">
      <Link to="/">
        <ArrowLeft aria-hidden="true" />
        All recipes
      </Link>
    </Button>
  );
}

function DetailsSkeleton() {
  return (
    <div role="status" aria-live="polite" className="grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:gap-8">
      <span className="sr-only">Loading recipe…</span>
      <Skeleton className="aspect-square w-full rounded-xl" />
      <div className="space-y-4" aria-hidden="true">
        <Skeleton className="h-9 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}
