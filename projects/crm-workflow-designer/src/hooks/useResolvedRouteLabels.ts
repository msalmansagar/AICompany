import { useState, useEffect } from 'react';
import { hasRealCondition } from '@/services/routeFilter';
import type { CrmRoute } from '../types/ViewTypes';
import type { ICrmAdapter } from '../services/ICrmAdapter';
import { resolveRouteFilter } from '../services/FetchXmlMetadataResolver';

/**
 * Asynchronously resolves every conditional route's FetchXML into a
 * human-readable label (e.g. "CEO Path: Approved Amount >= 500,000").
 *
 * Returns a Map<routeId, resolvedLabel> that starts empty and populates
 * once the metadata API calls complete. The underlying resolver caches
 * per entity/attribute for the session, so subsequent calls are instant.
 */
export function useResolvedRouteLabels(
  routes: CrmRoute[],
  adapter: ICrmAdapter
): Map<string, string> {
  const [resolvedLabels, setResolvedLabels] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const conditionalRoutes = routes.filter((r) => hasRealCondition(r.filter));
    if (conditionalRoutes.length === 0) return;

    let cancelled = false;

    Promise.all(
      conditionalRoutes.map(async (route): Promise<[string, string] | null> => {
        const resolved = await resolveRouteFilter(route.filter, adapter);
        if (!resolved || resolved.conditions.length === 0) return null;

        const condParts = resolved.conditions
          .map((c) =>
            c.valueLabel !== null
              ? `${c.fieldLabel} ${c.operatorLabel} ${c.valueLabel}`
              : `${c.fieldLabel} ${c.operatorLabel}`
          )
          .join(', ');

        const label = route.name ? `${route.name}: ${condParts}` : condParts;
        return [route.id, label];
      })
    ).then((entries) => {
      if (cancelled) return;
      const map = new Map<string, string>();
      for (const entry of entries) {
        if (entry) map.set(entry[0], entry[1]);
      }
      if (map.size > 0) setResolvedLabels(map);
    });

    return () => { cancelled = true; };
  }, [routes, adapter]);

  return resolvedLabels;
}
