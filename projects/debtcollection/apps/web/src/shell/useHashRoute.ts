import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_VIEW_ID, findView, type ViewDefinition } from './routes.js';

/**
 * Routing by URL hash, because a web resource does not own its path.
 *
 * A Dynamics web resource is served from `main.aspx?pagetype=webresource&webresourceName=…`. The path
 * belongs to the host, so history-based routing would either fight it or 404 on refresh. The hash is
 * the one part of the URL this application may own, which makes deep links and refresh work without
 * the host having to cooperate.
 *
 * The same reasoning rules out a router that assumes a standalone host.
 */

export interface Route {
  view: ViewDefinition;
  /** Record the view is focused on, from `#case/<id>`. Absent on list views. */
  recordId?: string;
  /**
   * Which tab of a record view to open, from `#case/<id>/actions`.
   *
   * Added in Phase 6 so that "go and log an action against this case" is a link rather than an
   * instruction to click a tab. It also makes the Actions and PTP tabs linkable from My Day, which
   * is the return leg of the follow-up journey.
   */
  tab?: string;
}

export function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, '');
  const [viewId = '', recordId, tab] = cleaned.split('/');
  const view = findView(viewId) ?? findView(DEFAULT_VIEW_ID)!;
  return { view, ...(recordId ? { recordId } : {}), ...(tab ? { tab } : {}) };
}

export function buildHash(viewId: string, recordId?: string, tab?: string): string {
  if (!recordId) return `#${viewId}`;
  return tab ? `#${viewId}/${recordId}/${tab}` : `#${viewId}/${recordId}`;
}

export function useHashRoute(): Route & { go: (viewId: string, recordId?: string, tab?: string) => void } {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const go = useCallback((viewId: string, recordId?: string, tab?: string) => {
    const next = buildHash(viewId, recordId, tab);
    if (window.location.hash === next) return;
    window.location.hash = next;
  }, []);

  return { ...route, go };
}
