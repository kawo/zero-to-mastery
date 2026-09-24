import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { ToastContext, type ToastInput } from '@/state/contexts';
import { cn } from '@/lib/utils';

interface ToastItem extends Required<Pick<ToastInput, 'message' | 'tone'>> {
  id: number;
  action?: ToastInput['action'];
}

const MAX_VISIBLE = 3;

/** Toast notifications, announced to screen readers via polite/assertive live regions. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const toast = useCallback(
    (input: ToastInput | string) => {
      const t = typeof input === 'string' ? { message: input } : input;
      const id = nextId.current++;
      const tone = t.tone ?? 'info';
      setToasts((ts) => [
        ...ts.slice(-(MAX_VISIBLE - 1)),
        { id, message: t.message, tone, action: t.action },
      ]);
      const duration = t.duration ?? (tone === 'error' ? 7000 : t.action ? 8000 : 3500);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast }), [toast]);

  const render = (tone: 'polite' | 'assertive') =>
    toasts
      .filter((t) => (t.tone === 'error') === (tone === 'assertive'))
      .map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto flex w-full animate-toast-in items-start gap-3 rounded-xl border border-border bg-elevated px-4 py-3 text-sm shadow-2xl"
        >
          {t.tone === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          ) : t.tone === 'error' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          )}
          <p className="flex-1">{t.message}</p>
          {t.action && (
            <button
              type="button"
              className="font-semibold text-accent hover:underline"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="-mr-1 rounded text-muted hover:text-fg"
            aria-label="Dismiss notification"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ));

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className={cn(
          'pointer-events-none fixed inset-x-0 z-[60] mx-auto flex w-[min(94vw,24rem)] flex-col gap-2',
          // Above the mobile mini player + tab bar; above the desktop player bar.
          'bottom-[calc(8.5rem+env(safe-area-inset-bottom))] md:bottom-28 md:left-auto md:right-6 md:mx-0',
        )}
      >
        <div role="status" aria-live="polite" className="flex flex-col gap-2">
          {render('polite')}
        </div>
        <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
          {render('assertive')}
        </div>
      </div>
    </ToastContext.Provider>
  );
}
