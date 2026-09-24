import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Disc3, ListMusic, Music2, Upload } from 'lucide-react';
import { PlayerBar } from '@/components/PlayerBar';
import { QueueDrawer } from '@/components/QueueDrawer';
import { useMediaQuery } from '@/hooks/useBrowser';
import { usePlaylists } from '@/hooks/useIndexedDb';
import { usePlayer } from '@/hooks/usePlayer';
import { cn, isInteractiveTarget, isTypingTarget } from '@/lib/utils';
import { useUi } from '@/state/contexts';

const NAV = [
  { to: '/songs', label: 'Songs', icon: Music2 },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
  { to: '/now-playing', label: 'Now Playing', icon: Disc3 },
  { to: '/upload', label: 'Import', icon: Upload },
] as const;

/** Global keyboard shortcuts (ignored while typing or when a control owns the key). */
function useShortcuts() {
  const player = usePlayer();
  const { toggleQueue } = useUi();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target) || document.querySelector('dialog[open]')) return;
      // Space activates a focused button/checkbox/slider; only take it when nothing else would.
      if (e.key === ' ' && isInteractiveTarget(e.target)) return;
      if (e.key === ' ' || e.key === 'k') {
        e.preventDefault();
        player.toggle();
      } else if (e.key === 'ArrowRight' && e.shiftKey) player.next();
      else if (e.key === 'ArrowLeft' && e.shiftKey) player.prev();
      else if (e.key === 'q' || e.key === 'Q') toggleQueue();
      else if (e.key === 'm') player.toggleMute();
      else if (e.key === 's') player.toggleShuffle();
      else if (e.key === 'r') player.cycleRepeat();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, toggleQueue]);
}

export function AppShell() {
  useShortcuts();
  const desktop = useMediaQuery('(min-width: 768px)');
  const playlists = usePlaylists();
  const { pathname } = useLocation();
  const { queueOpen, setQueueOpen } = useUi();

  // Start each page at the top.
  useEffect(() => {
    const main = document.getElementById('main');
    main?.scrollTo({ top: 0 });
  }, [pathname]);

  // Close the mobile queue sheet when navigating.
  useEffect(() => {
    if (!desktop) setQueueOpen(false);
  }, [pathname, desktop, setQueueOpen]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-4 py-2 text-accent-fg focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <nav
          aria-label="Main"
          className="hidden w-60 shrink-0 flex-col gap-6 border-r border-border bg-surface p-4 md:flex"
        >
          <div className="flex items-center gap-2 px-2 pt-1 text-lg font-extrabold">
            <img src="/icons/icon.svg" alt="" className="h-8 w-8" />
            Tunebox
          </div>
          <ul className="space-y-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                      isActive ? 'bg-elevated text-fg' : 'text-muted hover:text-fg',
                    )
                  }
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            <h2 className="px-3 text-xs font-semibold uppercase tracking-wider text-muted">
              Your playlists
            </h2>
            <ul className="mt-2 space-y-0.5">
              {(playlists ?? []).map((p) => (
                <li key={p.id}>
                  <NavLink
                    to={`/playlists/${p.id}`}
                    className={({ isActive }) =>
                      cn(
                        'block truncate rounded-md px-3 py-1.5 text-sm',
                        isActive ? 'bg-elevated text-fg' : 'text-muted hover:text-fg',
                      )
                    }
                  >
                    {p.name}
                  </NavLink>
                </li>
              ))}
              {playlists?.length === 0 && (
                <li className="px-3 py-1.5 text-sm text-muted">None yet</li>
              )}
            </ul>
          </div>
        </nav>

        <main
          id="main"
          tabIndex={-1}
          className="scrollbar-thin min-w-0 flex-1 overflow-y-auto px-4 pb-8 focus-visible:ring-0 md:px-8"
        >
          <Outlet />
        </main>

        {desktop && queueOpen && <QueueDrawer variant="panel" />}
      </div>

      <PlayerBar />

      {/* Mobile tab bar */}
      <nav aria-label="Main" className="pb-safe border-t border-border bg-surface md:hidden">
        <ul className="grid grid-cols-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-1 py-2 text-[11px] font-medium',
                    isActive ? 'text-fg' : 'text-muted',
                  )
                }
              >
                <Icon className="h-5 w-5" aria-hidden />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {!desktop && <QueueDrawer variant="sheet" />}
    </div>
  );
}
