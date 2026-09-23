import { Heart } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useFavorites, useToggleFavorite } from '@/features/favorites/useFavorites';
import type { Meal, MealSummary } from '@/lib/meal';
import { cn } from '@/lib/utils';

/**
 * Heart toggle. aria-pressed tells screen readers whether it's saved; the
 * label names the recipe, because a page shows many of these buttons.
 */
export function FavoriteButton({
  meal,
  showLabel = false,
  className,
  size = 'icon',
  variant = 'secondary'
}: {
  meal: Meal | MealSummary;
  showLabel?: boolean;
  className?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
}) {
  const { isFavorite } = useFavorites();
  const toggle = useToggleFavorite();
  const saved = isFavorite(meal.id);
  const label = saved ? `Remove ${meal.name} from favorites` : `Save ${meal.name} to favorites`;

  return (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? 'default' : size}
      aria-pressed={saved}
      aria-label={showLabel ? undefined : label}
      title={label}
      disabled={toggle.isPending}
      onClick={event => {
        // Cards are links; the heart shouldn't open the recipe
        event.preventDefault();
        event.stopPropagation();
        toggle.mutate({ meal, favorite: !saved });
      }}
      className={className}
    >
      <Heart aria-hidden="true" className={cn(saved && 'fill-primary text-primary')} />
      {showLabel && (saved ? 'Saved' : 'Save to favorites')}
    </Button>
  );
}
