/**
 * A financial unit's standing in the customer's portfolio, from the MIS days-past-due it reported.
 *
 * Factual, not a policy: a unit with any day past due is past due, one with none is current, and a
 * unit MIS reported no DPD for is unknown — never counted as current. No band, threshold or bucket
 * is decided here; buckets remain MIS's.
 */
export type PastDueState = 'pastDue' | 'current' | 'unknown';

export function pastDueStateOf(dpd: number | undefined): PastDueState {
  if (dpd === undefined || Number.isNaN(dpd)) return 'unknown';
  return dpd > 0 ? 'pastDue' : 'current';
}

/** Counts across the whole portfolio. Unknown units are counted in neither group. */
export interface PortfolioCounts {
  units: number;
  pastDue: number;
  current: number;
}

export function countPortfolio(dpds: readonly (number | undefined)[]): PortfolioCounts {
  const states = dpds.map(pastDueStateOf);
  return {
    units: dpds.length,
    pastDue: states.filter(state => state === 'pastDue').length,
    current: states.filter(state => state === 'current').length,
  };
}

/** Movement between two stored observations of a unit's DPD; undefined when either is missing. */
export function dpdChange(previous: number | undefined, current: number | undefined): number | undefined {
  if (previous === undefined || current === undefined) return undefined;
  return current - previous;
}
