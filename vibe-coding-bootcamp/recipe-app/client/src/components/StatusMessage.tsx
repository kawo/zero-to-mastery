import type { ReactNode } from 'react';
import { AlertTriangle, SearchX, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'empty' | 'error' | 'offline';

const ICONS = { empty: SearchX, error: AlertTriangle, offline: WifiOff };

/** Empty, error and offline states: an icon, a heading, an explanation and an optional action. */
export function StatusMessage({
  tone = 'empty',
  title,
  description,
  action,
  className
}: {
  tone?: Tone;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = ICONS[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-12 text-center', className)}
    >
      <Icon aria-hidden="true" className={cn('h-10 w-10', tone === 'error' ? 'text-destructive' : 'text-muted-foreground')} />
      <h2 className="text-lg font-semibold">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
