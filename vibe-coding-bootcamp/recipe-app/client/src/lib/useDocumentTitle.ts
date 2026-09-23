import { useEffect } from 'react';

/** Sets the tab title per page, which screen readers also announce on navigation. */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Recipes` : 'Recipes';
  }, [title]);
}
