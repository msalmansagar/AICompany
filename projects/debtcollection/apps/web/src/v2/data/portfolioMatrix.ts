import { ARREAR_BUCKET_CODES } from '@dcp/domain';

/** One of the ten MIS bucket codes the domain enforces. */
export type ArrearBucketCode = (typeof ARREAR_BUCKET_CODES)[number];
import type { XrmCrmAdapter } from '../../platform/XrmCrmAdapter.js';
import { buildCaseFilter, codeFor, type CaseQuery } from '../../data/collectionQueries.js';
import { BUCKET_LABELS, ENTITY_SETS, ORG_CODES } from '../../data/schema.js';
import type { OrganizationScope } from '../../shell/context.js';

/**
 * The Portfolio & Strategy matrix: open cases by MIS delinquency bucket and resolved strategy.
 *
 * **One cell, one definition.** A `MatrixCell` names a bucket, a strategy and a CRM scope, and that
 * single value produces the aggregate's FetchXML conditions, the drill-down's `CaseQuery` (and so its
 * `$filter`), and the accessible description. Nothing else composes these conditions, so the count
 * an officer sees and the list they open cannot describe different populations.
 *
 * **Rows are the ten MIS buckets** — `ARREAR_BUCKET_CODES`, the taxonomy the domain enforces at the
 * MIS boundary, in MIS order. No bucket is defined here, and no DPD arithmetic happens anywhere: the
 * bucket is a stored code the platform groups and filters on.
 *
 * **The measure is current arrears**: `SUM(qdb_currenttotalarrears)`, MIS's last reported figure as
 * stored on each case. Not exposure (FR-034, KI-32). The grain is the open case — one per delinquent
 * facility — and no customer count is implied.
 *
 * **Unknown is not zero.** A cell the platform did not answer for is `unknown`, and the caller says so.
 */

export const STRATEGY_NOT_ASSIGNED = 'none';
export const STRATEGY_NOT_ASSIGNED_LABEL = 'Strategy Not Assigned';

export const BUCKET_ROWS: readonly ArrearBucketCode[] = ARREAR_BUCKET_CODES;

export interface MatrixCell {
  bucket: ArrearBucketCode;
  /** A strategy id, or `'none'` for cases with no resolved strategy. */
  strategy: string;
  scope: OrganizationScope;
}

export interface CellFigure {
  cases: number;
  arrears: number;
}

export type CellValue = { known: true; figure: CellFigure } | { known: false };

export interface MatrixColumn {
  /** Strategy id, or `'none'`. */
  key: string;
  label: string;
  priority?: number | undefined;
}

export interface MatrixResult {
  columns: readonly MatrixColumn[];
  /** Keyed `bucket|strategyKey`; a missing key means the platform reported no rows for it (zero). */
  cells: ReadonlyMap<string, CellFigure>;
  rowTotals: ReadonlyMap<ArrearBucketCode, CellFigure>;
  columnTotals: ReadonlyMap<string, CellFigure>;
  grandTotal: CellFigure;
}

export const cellKey = (bucket: string, strategy: string) => `${bucket}|${strategy}`;

/** The drill-down question for a cell — the same fields the aggregate is built from. */
export function toCaseQuery(cell: MatrixCell): CaseQuery {
  const scopeFilter = scopeClause(cell.scope);
  return {
    openOnly: true,
    bucket: BUCKET_LABELS[bucketCode(cell.bucket)]!,
    strategy: cell.strategy,
    ...(scopeFilter !== undefined ? { scopeFilter } : {}),
  };
}

/** The `$filter` the Collection Cases list will send for a cell. */
export function toCaseFilter(cell: MatrixCell): string {
  return buildCaseFilter(toCaseQuery(cell))!;
}

/** The option value behind a bucket code; the same registry the case list filters through. */
export function bucketCode(bucket: ArrearBucketCode): number {
  return codeFor(BUCKET_LABELS, bucket)!;
}

export function scopeClause(scope: OrganizationScope): string | undefined {
  return scope === 'all' ? undefined : `qdb_organizationcode eq ${ORG_CODES[scope]}`;
}

/**
 * The aggregate for a whole scope: every bucket × strategy in one platform round trip.
 *
 * Conditions here are the FetchXML form of exactly what `toCaseQuery` produces — open cases, the
 * scope's organisation — and the grouping columns are the two the cell is keyed by. A test holds the
 * two forms to the same values.
 */
export function matrixFetchXml(scope: OrganizationScope): string {
  const organisation = scope === 'all'
    ? ''
    : `<condition attribute="qdb_organizationcode" operator="eq" value="${ORG_CODES[scope]}"/>`;
  return '<fetch aggregate="true"><entity name="qdb_collectioncase">'
    + '<attribute name="qdb_collectioncaseid" alias="cases" aggregate="count"/>'
    + '<attribute name="qdb_currenttotalarrears" alias="arrears" aggregate="sum"/>'
    + '<attribute name="qdb_currentarrearbucket" alias="bucket" groupby="true"/>'
    + '<attribute name="qdb_strategyid" alias="strategy" groupby="true"/>'
    + `<filter><condition attribute="statecode" operator="eq" value="0"/>${organisation}</filter>`
    + '</entity></fetch>';
}

/** MIS position freshness across the scope: the newest as-of date and the sync window. */
export function freshnessFetchXml(scope: OrganizationScope): string {
  const organisation = scope === 'all'
    ? ''
    : `<condition attribute="qdb_organizationcode" operator="eq" value="${ORG_CODES[scope]}"/>`;
  return '<fetch aggregate="true"><entity name="qdb_collectioncase">'
    + '<attribute name="qdb_misasofdate" alias="asof" aggregate="max"/>'
    + '<attribute name="qdb_lastmissyncon" alias="syncedto" aggregate="max"/>'
    + '<attribute name="qdb_lastmissyncon" alias="syncedfrom" aggregate="min"/>'
    + `<filter><condition attribute="statecode" operator="eq" value="0"/>${organisation}</filter>`
    + '</entity></fetch>';
}

export interface StrategyOption { id: string; label: string; priority?: number | undefined }

/**
 * Shapes the platform's grouped rows into the matrix.
 *
 * Columns are the configured strategies in priority order, then any strategy the cases name that
 * configuration no longer lists (retired, but still resolved on a case), then *Strategy Not Assigned*.
 * A bucket the platform does not group on (a case with no bucket) is not a row: it cannot be reached
 * from a bucket cell, and it is reported separately by the caller through `unbucketed`.
 */
export function shapeMatrix(
  rows: readonly Record<string, unknown>[],
  strategies: readonly StrategyOption[],
): MatrixResult & { unbucketed: CellFigure } {
  const cells = new Map<string, CellFigure>();
  const rowTotals = new Map<ArrearBucketCode, CellFigure>();
  const columnTotals = new Map<string, CellFigure>();
  const seenStrategies = new Map<string, string>();
  let grand: CellFigure = { cases: 0, arrears: 0 };
  let unbucketed: CellFigure = { cases: 0, arrears: 0 };

  for (const row of rows) {
    const figure = { cases: asNumber(row['cases']), arrears: asNumber(row['arrears']) };
    const strategyId = typeof row['strategy'] === 'string' ? row['strategy'] : STRATEGY_NOT_ASSIGNED;
    const strategyLabel = row['strategy@OData.Community.Display.V1.FormattedValue'];
    if (strategyId !== STRATEGY_NOT_ASSIGNED && typeof strategyLabel === 'string') seenStrategies.set(strategyId, strategyLabel);
    const bucket = labelOf(row);
    if (!bucket) { unbucketed = add(unbucketed, figure); continue; }
    cells.set(cellKey(bucket, strategyId), add(cells.get(cellKey(bucket, strategyId)), figure));
    rowTotals.set(bucket, add(rowTotals.get(bucket), figure));
    columnTotals.set(strategyId, add(columnTotals.get(strategyId), figure));
    grand = add(grand, figure);
  }

  const configured = [...strategies].sort((a, b) => (a.priority ?? Infinity) - (b.priority ?? Infinity));
  const retired = [...seenStrategies].filter(([id]) => !configured.some(s => s.id === id))
    .map(([id, label]) => ({ key: id, label: `${label} (retired)` }));
  const columns: MatrixColumn[] = [
    ...configured.map(s => ({ key: s.id, label: s.label, priority: s.priority })),
    ...retired,
    { key: STRATEGY_NOT_ASSIGNED, label: STRATEGY_NOT_ASSIGNED_LABEL },
  ];
  return { columns, cells, rowTotals, columnTotals, grandTotal: grand, unbucketed };
}

/** The bucket code a grouped row names, read from the platform's formatted label — never derived. */
function labelOf(row: Record<string, unknown>): ArrearBucketCode | undefined {
  const formatted = row['bucket@OData.Community.Display.V1.FormattedValue'];
  const byLabel = typeof formatted === 'string' ? formatted : undefined;
  const byValue = typeof row['bucket'] === 'number' ? BUCKET_LABELS[row['bucket']] : undefined;
  const label = byLabel ?? byValue;
  return BUCKET_ROWS.find(code => code === label);
}

function add(current: CellFigure | undefined, figure: CellFigure): CellFigure {
  return { cases: (current?.cases ?? 0) + figure.cases, arrears: (current?.arrears ?? 0) + figure.arrears };
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface Freshness {
  asOf?: string | undefined;
  syncedFrom?: string | undefined;
  syncedTo?: string | undefined;
}

/** Reads the whole matrix for a scope, or `null` when the platform did not answer. */
export async function loadMatrix(
  adapter: XrmCrmAdapter,
  scope: OrganizationScope,
  strategies: readonly StrategyOption[],
): Promise<(MatrixResult & { unbucketed: CellFigure }) | null> {
  const rows = await adapter.aggregate(ENTITY_SETS.collectionCase, matrixFetchXml(scope));
  return rows === null ? null : shapeMatrix(rows, strategies);
}

export async function loadFreshness(adapter: XrmCrmAdapter, scope: OrganizationScope): Promise<Freshness | null> {
  const rows = await adapter.aggregate(ENTITY_SETS.collectionCase, freshnessFetchXml(scope));
  const row = rows?.[0];
  if (!row) return null;
  const text = (key: string) => (typeof row[key] === 'string' ? (row[key] as string) : undefined);
  return { asOf: text('asof'), syncedFrom: text('syncedfrom'), syncedTo: text('syncedto') };
}

/** What a screen reader says for a populated cell. */
export function describeCell(cell: MatrixCell, columnLabel: string, figure: CellFigure): string {
  const rowName = cell.bucket === '>2000' ? 'over 2000 DPD' : `${cell.bucket.replace('-', ' to ')} DPD`;
  const cases = figure.cases === 1 ? '1 case' : `${new Intl.NumberFormat('en-GB').format(figure.cases)} cases`;
  return `${rowName}, ${columnLabel}, ${cases}, ${describeArrears(figure.arrears)} current arrears. Open cases.`;
}

export function describeArrears(amount: number): string {
  return `QAR ${new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(amount)}`;
}

/** Compact QAR for a cell: `QAR 6.1M`, `QAR 412K`, `QAR 950`. */
export function compactArrears(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) return `QAR ${(amount / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `QAR ${(amount / 1_000).toFixed(amount >= 100_000 ? 0 : 1)}K`;
  return `QAR ${Math.round(amount)}`;
}

/** Shade step 0–5 for a cell by its share of the largest cell's arrears. Zero is 0; unknown has none. */
export function shadeStep(amount: number, largest: number): number {
  if (amount <= 0 || largest <= 0) return 0;
  return Math.max(1, Math.min(5, Math.ceil((amount / largest) * 5)));
}
