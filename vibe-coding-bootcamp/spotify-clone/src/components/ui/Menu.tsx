import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface MenuProps {
  /** Accessible name of the trigger button, e.g. "More options for Song X". */
  label: string;
  items: (MenuItem | false | null | undefined)[];
  trigger?: ReactNode;
  className?: string;
}

/**
 * Accessible dropdown (WAI-ARIA menu button pattern): arrow keys move,
 * Home/End jump, Escape/Tab close and return focus. Rendered in a portal
 * with fixed positioning so scroll containers never clip it.
 */
export function Menu({ label, items, trigger, className }: MenuProps) {
  const list = items.filter(Boolean) as MenuItem[];
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback((focusTrigger = true) => {
    setOpen(false);
    setPos(null);
    if (focusTrigger) buttonRef.current?.focus();
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return;
    const b = buttonRef.current.getBoundingClientRect();
    const m = menuRef.current.getBoundingClientRect();
    const fitsBelow = b.bottom + 4 + m.height <= window.innerHeight;
    setPos({
      top: fitsBelow ? b.bottom + 4 : Math.max(8, b.top - 4 - m.height),
      left: Math.min(Math.max(8, b.right - m.width), window.innerWidth - m.width - 8),
    });
  }, [open]);

  // Focus the first item once the menu is positioned (hidden elements can't take focus).
  const placed = !!pos;
  useEffect(() => {
    if (placed)
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
  }, [placed]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, close]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = [
      ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ??
        []),
    ];
    const i = els.indexOf(document.activeElement as HTMLElement);
    const focus = (n: number) => els[(n + els.length) % els.length]?.focus();
    if (e.key === 'ArrowDown') focus(i + 1);
    else if (e.key === 'ArrowUp') focus(i - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(els.length - 1);
    else if (e.key === 'Escape') close();
    else if (e.key === 'Tab') close(false);
    else return;
    if (e.key !== 'Tab') e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        className={cn('icon-btn', className)}
        onClick={(e) => {
          e.stopPropagation();
          if (open) close(false);
          else setOpen(true);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {trigger ?? <MoreHorizontal className="h-5 w-5" aria-hidden />}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            onClick={(e) => e.stopPropagation()}
            style={{
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className="fixed z-50 min-w-48 rounded-xl border border-border bg-elevated p-1 shadow-2xl"
          >
            {list.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface focus-visible:bg-surface focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-40',
                  item.danger ? 'text-danger' : 'text-fg',
                )}
              >
                {item.icon && (
                  <span className="h-4 w-4 shrink-0 [&>svg]:h-4 [&>svg]:w-4" aria-hidden>
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
