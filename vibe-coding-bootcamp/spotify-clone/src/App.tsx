import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate, RouterProvider } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AppShell } from '@/components/AppShell';
import { DesktopStatus } from '@/components/DesktopStatus';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LibraryProvider } from '@/components/providers/LibraryProvider';
import { PlayerProvider } from '@/components/providers/PlayerProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { UiProvider } from '@/components/providers/UiProvider';
import { useLibrary } from '@/hooks/useIndexedDb';
import { Preferences } from '@/hooks/useTheme';
import { isDesktop } from '@/lib/desktop';
import { useToast } from '@/state/contexts';
import { t } from '@/i18n/core';

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
          {t('app.pageLoading')}
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
      <h1 className="text-2xl font-bold">{t('app.notFound')}</h1>
      <Link to="/songs" className="btn-primary mt-6">
        {t('app.goToSongs')}
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
        <h1 className="text-2xl font-bold">{t('app.libraryError')}</h1>
        <p className="mt-3 text-muted">{error}</p>
        <button type="button" className="btn-primary mt-6" onClick={() => window.location.reload()}>
          {t('common.reload')}
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
    if (offlineReady) toast({ tone: 'success', message: t('app.offlineReady') });
  }, [offlineReady, toast]);

  useEffect(() => {
    if (needRefresh) {
      toast({
        message: t('app.updateAvailable'),
        action: { label: t('common.reload'), onClick: () => void updateServiceWorker(true) },
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
          <Preferences />
          <StorageGate>
            <PlayerProvider>
              <UiProvider>
                {/* The desktop app updates itself and has no service worker. */}
                {isDesktop() ? <DesktopStatus /> : <PwaStatus />}
                <RouterProvider router={router} />
              </UiProvider>
            </PlayerProvider>
          </StorageGate>
        </LibraryProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
