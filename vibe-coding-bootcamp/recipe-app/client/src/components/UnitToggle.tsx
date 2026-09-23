import { useId } from 'react';
import type { UnitSystem } from '@/lib/measure';
import { useUnitSystem } from '@/lib/useUnitSystem';
import { cn } from '@/lib/utils';

const OPTIONS: { value: UnitSystem; label: string; hint: string }[] = [
  { value: 'original', label: 'As written', hint: 'The units the recipe uses' },
  { value: 'metric', label: 'Metric', hint: 'Grams, kilograms, millilitres, litres' },
  { value: 'imperial', label: 'Imperial', hint: 'Ounces, pounds, cups' }
];

/**
 * Chooses the units for ingredient amounts, everywhere in the app. Radio
 * buttons styled as a segmented control, so arrow keys move between options.
 */
export function UnitToggle({ className }: { className?: string }) {
  const [system, setSystem] = useUnitSystem();
  const name = useId();

  return (
    <fieldset className={cn('inline-flex rounded-md border bg-background p-0.5 text-sm', className)}>
      <legend className="sr-only">Units</legend>
      {OPTIONS.map(option => (
        <label
          key={option.value}
          title={option.hint}
          className={cn(
            'cursor-pointer rounded px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
            system === option.value && 'bg-accent text-accent-foreground'
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={system === option.value}
            onChange={() => setSystem(option.value)}
            className="sr-only"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}
