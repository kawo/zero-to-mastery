import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 'offlineFirst': always try the request once even when the browser says
      // it's offline, because the service worker may answer from its cache.
      // (The default, 'online', would pause and never ask the service worker.)
      networkMode: 'offlineFirst',
      staleTime: 5 * 60 * 1000,
      gcTime: 60 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Retry network hiccups and server errors, but not "not found",
      // bad input, or "offline and not cached"
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.offline || (error.status >= 400 && error.status < 500))) return false;
        return failureCount < 2;
      }
    },
    mutations: {
      networkMode: 'always'
    }
  }
});
