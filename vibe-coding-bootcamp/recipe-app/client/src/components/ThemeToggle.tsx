import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from './ThemeProvider';

/**
 * Flips between light and dark, starting from whatever is showing now, so
 * every click visibly changes something. Until the first click the app
 * follows the system setting ("system" theme).
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  const label = `Switch to ${next} theme`;

  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)} aria-label={label} title={label}>
      {resolvedTheme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </Button>
  );
}
