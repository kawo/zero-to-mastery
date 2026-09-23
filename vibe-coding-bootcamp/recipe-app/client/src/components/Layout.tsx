import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChefHat, Heart, ShoppingBasket, UtensilsCrossed, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useFavorites } from '@/features/favorites/useFavorites';
import { useShoppingList } from '@/features/shopping/useShoppingList';
import { useOnlineStatus } from '@/lib/useOnlineStatus';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from './ErrorBoundary';
import { SearchBar } from './SearchBar';
import { ThemeToggle } from './ThemeToggle';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground',
    isActive && 'bg-accent text-accent-foreground'
  );

function CountBadge({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <Badge variant="secondary" className="ml-0.5 px-1.5">
      <span className="sr-only">(</span>
      {count}
      <span className="sr-only"> {label})</span>
    </Badge>
  );
}

/** Page frame: skip link, header with search and theme toggle, main, footer. */
export function Layout() {
  const location = useLocation();
  const { favorites } = useFavorites();
  const { items: shoppingItems } = useShoppingList();
  const online = useOnlineStatus();
  // The home page has its own large search box
  const showHeaderSearch = location.pathname !== '/';

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b bg-background/90 print:hidden backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="container flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <ChefHat aria-hidden="true" className="h-6 w-6 text-primary" />
            Recipes
          </Link>

          {showHeaderSearch && <SearchBar className="order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-md" />}

          {/* On phones the links show icons only; the text stays for screen readers */}
          <nav aria-label="Main" className="ml-auto flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              <UtensilsCrossed aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">Browse</span>
            </NavLink>
            <NavLink to="/favorites" className={navLinkClass}>
              <Heart aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">Favorites</span>
              <CountBadge count={favorites.length} label="saved" />
            </NavLink>
            <NavLink to="/list" className={navLinkClass}>
              <ShoppingBasket aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">List</span>
              <CountBadge count={shoppingItems.length} label="items" />
            </NavLink>
            <ThemeToggle />
          </nav>
        </div>
        {!online && (
          <div role="status" className="border-t bg-muted/70 py-1.5 text-center text-sm text-muted-foreground">
            <WifiOff aria-hidden="true" className="mr-1.5 inline h-4 w-4 align-[-2px]" />
            Offline. Showing saved recipes and favorites.
          </div>
        )}
      </header>

      <main id="main" tabIndex={-1} className="container flex-1 py-6 focus:outline-none print:max-w-none print:py-0">
        {/* Keyed by path, so an error on one page clears when you navigate away */}
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground print:hidden">
        Recipes and photos from{' '}
        <a href="https://www.themealdb.com" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:text-foreground">
          TheMealDB
        </a>
        .
      </footer>
    </div>
  );
}
