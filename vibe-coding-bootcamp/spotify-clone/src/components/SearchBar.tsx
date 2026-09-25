import { useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { cn, isTypingTarget } from '@/lib/utils';
import { useI18n } from '@/i18n';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  /** Focus with the "/" key (only one search bar per page should enable this). */
  hotkey?: boolean;
}

export function SearchBar({
  value,
  onChange,
  placeholder,
  label,
  className,
  hotkey,
}: SearchBarProps) {
  const ref = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!hotkey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !isTypingTarget(e.target) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hotkey]);

  return (
    <div role="search" className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.stopPropagation();
            onChange('');
          }
        }}
        placeholder={placeholder ?? t('search.label')}
        aria-label={label ?? t('search.label')}
        aria-keyshortcuts={hotkey ? '/' : undefined}
        className="input rounded-full pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            ref.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-fg"
          aria-label={t('search.clear')}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
