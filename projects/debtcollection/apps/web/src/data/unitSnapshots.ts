import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { ENTITY_SETS, SNAPSHOT_COLUMNS } from './schema.js';
import { escapeOData, mapPage } from './collectionQueries.js';
import { toSnapshotRow, type SnapshotRow } from './caseQueries.js';

/**
 * The stored MIS observations of one Loan Account or Facility, oldest first, for its Delinquency
 * History. Read-only and bounded: the latest observations by snapshot date, never the whole
 * history, and never written — opening or refreshing Customer 360 appends nothing.
 *
 * The unit is identified by its canonical business key — unit number and source system — within the
 * customer's business id, exactly as MIS delivered them. Nothing is matched by name.
 */
export const UNIT_SNAPSHOT_LIMIT = 24;

export interface UnitKey {
  customerBusinessId: string;
  unitNumber: string;
  sourceSystem: string;
}

export interface UnitSnapshots {
  points: readonly SnapshotRow[];
  /** True when the unit has more stored observations than the bound read. */
  hasEarlier: boolean;
}

export async function loadUnitSnapshots(adapter: XrmCrmAdapter, unit: UnitKey): Promise<UnitSnapshots> {
  const page = mapPage(await adapter.retrievePage(ENTITY_SETS.delinquencySnapshot, {
    select: [...SNAPSHOT_COLUMNS],
    pageSize: UNIT_SNAPSHOT_LIMIT,
    sort: [{ field: 'qdb_snapshotdate', descending: true }],
    filter: [
      `qdb_customerbusinessid eq '${escapeOData(unit.customerBusinessId)}'`,
      `qdb_facilitynumber eq '${escapeOData(unit.unitNumber)}'`,
      `qdb_facilitysourcesystem eq '${escapeOData(unit.sourceSystem)}'`,
    ].join(' and '),
  }), toSnapshotRow);
  return { points: [...page.items].reverse(), hasEarlier: page.hasMore };
}
