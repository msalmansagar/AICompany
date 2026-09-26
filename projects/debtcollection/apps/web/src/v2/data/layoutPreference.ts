/**
 * A list's chosen layout — Split or Grid — remembered in this browser.
 *
 * A convenience, not state: a profile that blocks storage simply gets the default each time, and
 * nothing that matters is ever kept only here.
 */
export type ListLayout = 'split' | 'grid';

export function readLayout(key: string, fallback: ListLayout = 'split'): ListLayout {
  try {
    const stored = window.localStorage.getItem(key);
    return stored === 'split' || stored === 'grid' ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function writeLayout(key: string, layout: ListLayout): void {
  try {
    window.localStorage.setItem(key, layout);
  } catch {
    // A per-browser convenience; the default returns next time.
  }
}
