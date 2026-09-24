import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AppShell } from '@/components/AppShell';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LibraryProvider } from '@/components/providers/LibraryProvider';
import { PlayerProvider } from '@/components/providers/PlayerProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { UiProvider } from '@/components/providers/UiProvider';
import { useLibrary } from '@/hooks/useIndexedDb';
import { useToast } from '@/state/contexts';

// Route-level code splitting. Every chunk is precached by the service worker, so this works offline too.
const Songs = lazy(() => import('@/pages/Songs'));
const Upload = lazy(() => import('@/pages/Upload'));
const Playlists = lazy(() => import('@/pages/Playlists'));
const PlaylistDetail = lazy(() => import('@/pages/PlaylistDetail'));
const NowPlaying = lazy(() => import('@/pages/NowPlaying'));

const page = (el: ReactNode) => (
  <ErrorBoundary>
    <Suspense
      fallback={
        <p className="py-16 text-center text-muted" role="status">
          Loading…
        </p>
      }
    >
      {el}
    </Suspense>
  </ErrorBoundary>
);

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/songs" replace /> },
      { path: 'songs', element: page(<Songs />) },
      { path: 'upload', element: page(<Upload />) },
      { path: 'playlists', element: page(<Playlists />) },
      { path: 'playlists/:id', element: page(<PlaylistDetail />) },
      { path: 'now-playing', element: page(<NowPlaying />) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

function NotFound() {
  return (
    <div className="py-20 text-center">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/songs" className="btn-primary mt-6">
        Go to your songs
      </Link>
    </div>
  );
}

/** Shows a blocking message if IndexedDB can't be opened (private mode, blocked storage…). */
function StorageGate({ children }: { children: ReactNode }) {
  const { error } = useLibrary();
  if (!error) return children;
  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold">Your library couldn't be opened</h1>
        <p className="mt-3 text-muted">{error}</p>
        <button type="button" className="btn-primary mt-6" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    </div>
  );
}

/** Service worker lifecycle → toasts ("ready offline", "update available"). */
function PwaStatus() {
  const toast = useToast();
  const {
    offlineReady: [offlineReady],
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (err) => console.warn('Service worker registration failed', err),
  });

  useEffect(() => {
    if (offlineReady) toast({ tone: 'success', message: 'Tunebox is ready to work offline.' });
  }, [offlineReady, toast]);

  useEffect(() => {
    if (needRefresh) {
      toast({
        message: 'A new version of Tunebox is available.',
        action: { label: 'Reload', onClick: () => void updateServiceWorker(true) },
        duration: 0,
      });
    }
  }, [needRefresh, toast, updateServiceWorker]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary fullPage>
      <ToastProvider>
        <LibraryProvider>
          <StorageGate>
            <PlayerProvider>
              <UiProvider>
                <PwaStatus />
                <RouterProvider router={router} />
              </UiProvider>
            </PlayerProvider>
          </StorageGate>
        </LibraryProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
