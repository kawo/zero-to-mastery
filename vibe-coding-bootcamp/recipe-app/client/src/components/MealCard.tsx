import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock } from 'lucide-react';
import { formatMinutes, previewImage, type MealSummary } from '@/lib/meal';
import { AddToListButton } from './AddToListButton';
import { FavoriteButton } from './FavoriteButton';
import { Highlight, plainSnippet } from './Highlight';

/**
 * Recipe card. The title is the link (so each card is one tab stop plus its
 * heart), and the link's hit area is stretched over the card for mouse users.
 */
export function MealCard({
  meal,
  imageSrc,
  headingLevel = 3,
  actions
}: {
  meal: MealSummary;
  imageSrc?: string | null;
  headingLevel?: 2 | 3;
  /** Extra buttons under the badges (kept above the card's stretched link) */
  actions?: React.ReactNode;
}) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const src = imageSrc ?? previewImage(meal.thumbnail) ?? '/icons/icon-192.png';

  return (
    <Card className="group relative flex flex-col overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
      <div className="aspect-[4/3] overflow-hidden bg-muted">
        <img
          src={src}
          alt={`Photo of ${meal.name}`}
          loading="lazy"
          decoding="async"
          width={400}
          height={300}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <Heading className="line-clamp-2 font-semibold leading-snug">
          <Link to={`/meal/${meal.id}`} className="after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-0">
            {meal.name}
          </Link>
        </Heading>
        {/* Where a text search matched, unless it only repeats the title */}
        {meal.snippet && plainSnippet(meal.snippet) !== meal.name && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            <Highlight text={meal.snippet} />
          </p>
        )}
        {(meal.category || meal.area || meal.cookMinutes) && (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {meal.category && <Badge variant="secondary">{meal.category}</Badge>}
            {meal.area && <Badge variant="outline">{meal.area}</Badge>}
            {meal.cookMinutes ? (
              <Badge variant="outline" className="gap-1 font-medium" title="Estimated total time, worked out from the method">
                <Clock aria-hidden="true" className="h-3 w-3" />
                <span className="sr-only">Estimated total time: </span>~{formatMinutes(meal.cookMinutes)}
              </Badge>
            ) : null}
          </div>
        )}
        {actions && <div className="relative z-10 flex flex-wrap gap-2 pt-1">{actions}</div>}
      </div>
      {/* Above the stretched link so they stay clickable */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-2">
        <FavoriteButton meal={meal} className="rounded-full shadow" />
        <AddToListButton meal={meal} className="rounded-full shadow" />
      </div>
    </Card>
  );
}

export function MealCardSkeleton() {
  return (
    <Card className="overflow-hidden" aria-hidden="true">
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/5" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-14" />
        </div>
      </div>
    </Card>
  );
}

export const gridClass = 'grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';

/** Placeholder grid while results load, announced once to screen readers. */
export function MealGridSkeleton({ count = 8, label = 'Loading recipes' }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}…</span>
      <div className={gridClass}>
        {Array.from({ length: count }, (_, i) => (
          <MealCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
