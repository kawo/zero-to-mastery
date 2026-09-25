import { useEffect, type ReactNode } from 'react';
import {
  Contrast,
  Download,
  Languages,
  Monitor,
  Moon,
  Settings2,
  Sun,
  WifiOff,
} from 'lucide-react';
import { Menu } from '@/components/ui/Menu';
import { useInstallPrompt, useOnline } from '@/hooks/useBrowser';
import { useLanguage, useTheme } from '@/hooks/useTheme';
import { detectLocale, LOCALE_NAMES, LOCALES, useI18n } from '@/i18n';
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
  const { theme, contrast, setTheme, setContrast } = useTheme();
  const { language, setLanguage } = useLanguage();
  const toast = useToast();
  const { t } = useI18n();

  useEffect(() => {
    document.title = `${title} · Tunebox`;
  }, [title]);

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
            title={t('common.offlineHint')}
          >
            <WifiOff className="h-3.5 w-3.5" aria-hidden />
            {t('common.offline')}
          </span>
        )}
        {actions}
        {canInstall && (
          <button
            type="button"
            className="btn-secondary hidden sm:inline-flex"
            onClick={async () => {
              if (await install()) toast({ tone: 'success', message: t('topBar.installed') });
            }}
          >
            <Download className="h-4 w-4" aria-hidden />
            {t('topBar.installApp')}
          </button>
        )}
        <Menu
          label={t('topBar.settings')}
          trigger={<Settings2 className="h-5 w-5" aria-hidden />}
          items={[
            {
              group: t('topBar.theme'),
              items: [
                {
                  label: t('topBar.light'),
                  icon: <Sun />,
                  checked: theme === 'light',
                  onSelect: () => setTheme('light'),
                },
                {
                  label: t('topBar.dark'),
                  icon: <Moon />,
                  checked: theme === 'dark',
                  onSelect: () => setTheme('dark'),
                },
                {
                  label: t('topBar.matchSystem'),
                  icon: <Monitor />,
                  checked: theme === 'system',
                  onSelect: () => setTheme('system'),
                },
              ],
            },
            {
              group: t('topBar.contrast'),
              items: [
                {
                  label: t('topBar.contrastStandard'),
                  checked: contrast === 'standard',
                  onSelect: () => setContrast('standard'),
                },
                {
                  label: t('topBar.contrastHigh'),
                  icon: <Contrast />,
                  checked: contrast === 'high',
                  onSelect: () => setContrast('high'),
                },
                {
                  label: t('topBar.matchSystem'),
                  icon: <Monitor />,
                  checked: contrast === 'system',
                  onSelect: () => setContrast('system'),
                },
              ],
            },
            {
              group: t('topBar.language'),
              items: [
                {
                  label: t('topBar.languageAuto', { name: LOCALE_NAMES[detectLocale()] }),
                  icon: <Languages />,
                  checked: language === 'auto',
                  onSelect: () => setLanguage('auto'),
                },
                ...LOCALES.map((l) => ({
                  label: LOCALE_NAMES[l],
                  checked: language === l,
                  onSelect: () => setLanguage(l),
                })),
              ],
            },
            canInstall && {
              label: t('topBar.installApp'),
              icon: <Download />,
              onSelect: () => void install(),
            },
          ]}
        />
      </div>
    </header>
  );
}
