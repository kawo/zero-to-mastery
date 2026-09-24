import { useEffect, type ReactNode } from 'react';
import { Download, Monitor, Moon, Sun, WifiOff } from 'lucide-react';
import { Menu } from '@/components/ui/Menu';
import { useInstallPrompt, useOnline } from '@/hooks/useBrowser';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/state/contexts';

interface TopBarProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Page header: title (also sets document.title), connectivity, install and theme. */
export function TopBar({ title, subtitle, actions }: TopBarProps) {
  const online = useOnline();
  const { canInstall, install } = useInstallPrompt();
  const { theme, setTheme } = useTheme();
  const toast = useToast();

  useEffect(() => {
    document.title = `${title} · Tunebox`;
  }, [title]);

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <header className="sticky top-0 z-20 -mx-4 mb-4 flex flex-wrap items-center gap-3 border-b border-transparent bg-bg/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur md:-mx-8 md:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
        {subtitle && <p className="truncate text-sm text-muted">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-1">
        {!online && (
          <span
            className="mr-1 inline-flex items-center gap-1.5 rounded-full bg-elevated px-3 py-1 text-xs font-medium text-muted"
            title="You're offline. Your library and playback still work."
          >
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
            Offline
          </span>
        )}
        {actions}
        {canInstall && (
          <button
            type="button"
            className="btn-secondary hidden sm:inline-flex"
            onClick={async () => {
              if (await install()) toast({ tone: 'success', message: 'Tunebox installed.' });
            }}
          >
            <Download className="h-4 w-4" aria-hidden />
            Install app
          </button>
        )}
        <Menu
          label={`Theme: ${theme}`}
          trigger={<ThemeIcon className="h-5 w-5" aria-hidden />}
          items={[
            { label: 'Light', icon: <Sun />, onSelect: () => setTheme('light') },
            { label: 'Dark', icon: <Moon />, onSelect: () => setTheme('dark') },
            { label: 'Match system', icon: <Monitor />, onSelect: () => setTheme('system') },
            canInstall && {
              label: 'Install app',
              icon: <Download />,
              onSelect: () => void install(),
            },
          ]}
        />
      </div>
    </header>
  );
}
