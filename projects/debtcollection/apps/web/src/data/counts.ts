import { useEffect, useState } from 'react';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';

/**
 * Bounded counts for the KPI tiles.
 *
 * A count is read the only way a count may be read here: one row, with `$count=true`, so the
 * platform answers "how many" without sending them. The prototype's KPI figures were mock numbers,
 * and a plausible invented number in a real workspace is worse than a blank — nobody questions it.
 * So a tile whose count has not arrived, or whose count failed, shows an em dash.
 *
 * Dataverse caps `$count` at 5,000 and reports the cap rather than the true total. That limit is
 * surfaced as `atLeast` instead of being presented as an exact figure, because "5,000" and "at least
 * 5,000" are different claims.
 */

/** The platform stops counting here and reports the cap. */
export const COUNT_CAP = 5000;

export interface CountResult {
  value?: number;
  /** True when the platform's cap was reached, so `value` is a floor rather than a total. */
  atLeast: boolean;
}

export async function countMatching(
  adapter: XrmCrmAdapter,
  entitySet: string,
  filter?: string,
): Promise<CountResult> {
  const page = await adapter.retrievePage(entitySet, {
    select: [],
    pageSize: 1,
    includeTotalCount: true,
    ...(filter !== undefined ? { filter } : {}),
  });
  if (page.totalCount === undefined) return { atLeast: false };
  return { value: page.totalCount, atLeast: page.totalCount >= COUNT_CAP };
}

export interface CountRequest {
  key: string;
  entitySet: string;
  filter?: string;
}

/**
 * Reads several counts for a KPI row.
 *
 * Failures are kept per count rather than collapsing the row: one tile that could not be read leaves
 * that tile blank and the others correct, which is more useful than an error where five numbers were.
 */
export function useCounts(
  adapter: XrmCrmAdapter,
  requests: readonly CountRequest[],
): Readonly<Record<string, CountResult | undefined>> {
  const [counts, setCounts] = useState<Record<string, CountResult | undefined>>({});
  const fingerprint = JSON.stringify(requests);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(requests.map(async request => {
      try {
        return [request.key, await countMatching(adapter, request.entitySet, request.filter)] as const;
      } catch {
        // A count that cannot be read leaves its tile blank; it must never become a zero.
        return [request.key, undefined] as const;
      }
    })).then(entries => {
      if (!cancelled) setCounts(Object.fromEntries(entries));
    });
    return () => { cancelled = true; };
    // `fingerprint` is the value identity of `requests`; the array itself is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapter, fingerprint]);

  return counts;
}

/** A count as a KPI tile shows it: a number, "5,000+" at the cap, or an em dash. */
export function formatCountResult(result: CountResult | undefined): string {
  if (result?.value === undefined) return '—';
  const formatted = new Intl.NumberFormat('en-GB').format(result.value);
  return result.atLeast ? `${formatted}+` : formatted;
}
