import type { RuleRow } from '../dataverse/client';

// Pure catalog helpers — filtering, status facets, and effective-state derivation. Kept out of
// the component so they can be unit-tested directly.

export type EffectiveState = 'active' | 'scheduled' | 'expired' | 'none';

export interface CatalogFilter {
  query: string;
  status: string;   // '' = all
  entity: string;   // '' = all (logical name)
}

/**
 * Where a rule's latest version sits relative to its effective window (only meaningful once
 * Published): active now, scheduled to start, expired, or no window / not published.
 */
export function effectiveState(row: RuleRow, nowIso: string): EffectiveState {
  if (row.status !== 'Published') return 'none';
  const { effectiveFrom: from, effectiveTo: to } = row;
  if (!from && !to) return 'none';
  if (from && nowIso < from) return 'scheduled';
  if (to && nowIso >= to) return 'expired';
  return 'active';
}

/** Count of rules per status label, plus a total under the 'All' key. */
export function statusCounts(rows: RuleRow[]): Record<string, number> {
  const counts: Record<string, number> = { All: rows.length };
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

/** The distinct entity logical names present (blank entities dropped), sorted. */
export function entitiesPresent(rows: RuleRow[]): string[] {
  return [...new Set(rows.map((r) => r.entity).filter(Boolean))].sort();
}

/**
 * Apply keyword + status + entity filters. Keyword matches name, entity (logical + friendly),
 * owner, and status. entityLabel resolves a logical name to its friendly display name.
 */
export function filterCatalog(rows: RuleRow[], f: CatalogFilter, entityLabel: (ln: string) => string): RuleRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.entity && r.entity !== f.entity) return false;
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.entity.toLowerCase().includes(q) ||
      entityLabel(r.entity).toLowerCase().includes(q) ||
      r.owner.toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  });
}
