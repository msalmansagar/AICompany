import { useEffect, useState } from 'react';

/**
 * True while the viewport is at least `px` wide (agentation feedback,
 * CWFD-018): the view toolbar shows icon+label when there is room and
 * falls back to icon-only where labels would push it into a sideways
 * scroll - the exact failure that made the edit bar icon-only in #129.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState<boolean>(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : true
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(query);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
