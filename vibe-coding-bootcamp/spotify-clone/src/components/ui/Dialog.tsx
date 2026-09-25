import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n } from '@/i18n';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * Modal built on native <dialog>: focus trapping, Escape to close and inert
 * background come from the browser. Clicking the backdrop also closes it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // A scrolling body with nothing focusable inside (e.g. the shortcuts table) must be
  // focusable itself, or keyboard users can't scroll it.
  const [scrollFocus, setScrollFocus] = useState(false);
  const titleId = useId();
  const descId = useId();
  const { t } = useI18n();

  useEffect(() => {
    const el = body.current;
    if (!open || !el) return;
    const update = () =>
      setScrollFocus(
        el.scrollHeight > el.clientHeight + 1 &&
          !el.querySelector(
            'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
      );
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  // Focus in and back out: showModal() focuses the first button (the close button in the
  // header), so start on the first control of the body instead, and return focus to
  // whatever opened the dialog when it closes.
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      returnFocus.current = document.activeElement as HTMLElement | null;
      el.showModal();
      body.current
        ?.querySelector<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    }
    if (!open && el.open) {
      el.close();
      const back = returnFocus.current;
      returnFocus.current = null;
      if (back?.isConnected) back.focus();
    }
  }, [open]);
  // Some callers remount the dialog (a changing `key`) as it closes: restore focus then too.
  useEffect(
    () => () => {
      const back = returnFocus.current;
      if (back?.isConnected) queueMicrotask(() => back.focus());
    },
    [],
  );

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // backdrop
      }}
      className={cn(
        'm-auto w-[min(92vw,28rem)] rounded-2xl border border-border bg-surface p-0 text-fg shadow-2xl',
        className,
      )}
    >
      {open && (
        <div className="flex max-h-[80vh] flex-col">
          <div className="flex items-start justify-between gap-4 px-5 pt-5">
            <div>
              <h2 id={titleId} className="text-lg font-bold">
                {title}
              </h2>
              {description && (
                <p id={descId} className="mt-1 text-sm text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              className="icon-btn -mr-2 -mt-1"
              onClick={onClose}
              aria-label={t('common.closeDialog')}
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div
            ref={body}
            tabIndex={scrollFocus ? 0 : undefined}
            aria-labelledby={scrollFocus ? titleId : undefined}
            role={scrollFocus ? 'region' : undefined}
            className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4"
          >
            {children}
          </div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}
