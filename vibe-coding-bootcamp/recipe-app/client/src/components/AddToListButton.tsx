import { ShoppingBasket } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useShoppingList, useToggleOnList } from '@/features/shopping/useShoppingList';
import type { Meal, MealSummary } from '@/lib/meal';
import { cn } from '@/lib/utils';

/** Adds a recipe's ingredients to the shopping list, or takes them off. */
export function AddToListButton({
  meal,
  showLabel = false,
  className,
  variant = 'secondary'
}: {
  meal: Meal | MealSummary;
  showLabel?: boolean;
  className?: string;
  variant?: ButtonProps['variant'];
}) {
  const { isOnList } = useShoppingList();
  const toggle = useToggleOnList();
  const onList = isOnList(meal.id);
  const label = onList ? `Remove ${meal.name} from shopping list` : `Add ${meal.name} to shopping list`;

  return (
    <Button
      type="button"
      variant={variant}
      size={showLabel ? 'default' : 'icon'}
      aria-pressed={onList}
      aria-label={showLabel ? undefined : label}
      title={label}
      disabled={toggle.isPending}
      onClick={event => {
        // Cards are links; the button shouldn't open the recipe
        event.preventDefault();
        event.stopPropagation();
        toggle.mutate({ meal, add: !onList });
      }}
      className={className}
    >
      <ShoppingBasket aria-hidden="true" className={cn(onList && 'text-primary')} strokeWidth={onList ? 2.75 : 2} />
      {showLabel && (onList ? 'On shopping list' : 'Add to shopping list')}
    </Button>
  );
}
