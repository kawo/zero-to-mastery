import { createBrowserRouter, RouterProvider, ScrollRestoration, Outlet } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Toaster } from '@/components/ui/sonner';
import { Layout } from '@/components/Layout';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OfflineNotifier } from '@/components/OfflineNotifier';
import Home from '@/pages/Home';
import Details from '@/pages/Details';
import Favorites from '@/pages/Favorites';
import NotFound from '@/pages/NotFound';

/** Restores scroll position on back/forward and starts new pages at the top. */
function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Home /> },
          { path: 'meal/:id', element: <Details /> },
          { path: 'favorites', element: <Favorites /> },
          { path: '*', element: <NotFound /> }
        ]
      }
    ]
  }
]);

export default function App() {
  return (
    // Outermost boundary: if something fails outside the page area (header,
    // providers), show a recovery screen rather than a blank page
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
          <OfflineNotifier />
          <Toaster position="bottom-center" richColors closeButton />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
