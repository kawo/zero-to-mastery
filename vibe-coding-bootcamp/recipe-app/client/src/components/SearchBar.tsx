import { useEffect, useId, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Recipe search. Submitting goes to the home page with ?q=..., so searches
 * are linkable and the back button works.
 */
export function SearchBar({ className, size = 'default' }: { className?: string; size?: 'default' | 'lg' }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const urlQuery = params.get('q') ?? '';
  const [value, setValue] = useState(urlQuery);
  const id = useId();

  // Keep the box in step when the URL changes (back button, category chips)
  useEffect(() => setValue(urlQuery), [urlQuery]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = value.trim();
    navigate(query ? `/?q=${encodeURIComponent(query)}` : '/');
  };

  return (
    <form role="search" onSubmit={submit} className={cn('flex w-full gap-2', className)}>
      <label htmlFor={id} className="sr-only">
        Search recipes
      </label>
      <div className="relative flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type="search"
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder="Search recipes, e.g. lasagne"
          maxLength={100}
          autoComplete="off"
          enterKeyHint="search"
          className={cn('pl-9', size === 'lg' && 'h-11 text-base')}
        />
      </div>
      <Button type="submit" size={size === 'lg' ? 'lg' : 'default'} className={size === 'lg' ? 'px-5' : undefined}>
        Search
      </Button>
    </form>
  );
}
