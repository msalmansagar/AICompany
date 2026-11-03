import { randomUUID } from 'node:crypto';
import type {
  CrmCallContext, CrmPageQuery, CrmQuery, CrmRecord, CrmReference, ICrmAdapter, Page,
} from '@dcp/domain';
import { buildPage, fingerprintQuery, makeContinuation, readContinuation } from '@dcp/domain';

/**
 * An in-memory organisation behind the CRM seam, so the real repositories and services run end to
 * end in tests. It understands exactly the OData the repositories emit — `field eq 'text'`,
 * `field eq number`, joined by `and` — and refuses anything else, so a repository cannot quietly
 * start relying on a filter the fake happens to ignore.
 *
 * It also records every entity set touched. That is how the tests prove the Collection pipeline
 * never asks the organisation for a facility record.
 */
export class FakeCrmAdapter implements ICrmAdapter {
  readonly tables = new Map<string, Map<string, CrmRecord>>();
  readonly touchedEntitySets = new Set<string>();
  /** Every retrieveMultiple, so a test can count reads of one table (cache behaviour). */
  readonly queries: { entity: string; query: CrmQuery }[] = [];
  /** Every retrievePage, so a test can prove a walk asked for the pages it claims to have asked for. */
  readonly pageQueries: { entity: string; query: CrmPageQuery }[] = [];
  /**
   * Rows this fake will return in one page regardless of what was asked for, so "the source returned
   * fewer rows than requested" is testable. Unset means honour the requested size.
   */
  shortPageSize?: number;
  readonly writes: { kind: 'create' | 'update'; entity: string; id: string; values: CrmRecord }[] = [];
  readonly executed: { operation: string; parameters: CrmRecord }[] = [];
  /** Optional fault injection: throw when creating in this entity set with a matching predicate. */
  failCreateWhen?: (entity: string, values: CrmRecord) => boolean;
  /** Optional answer for execute(); unset means execute() is refused. */
  executeHandler?: (operation: string, parameters: CrmRecord) => unknown;

  /** Seeds a row; returns its id. `idField` is the primary key column to place the id under. */
  seed(entity: string, idField: string, values: CrmRecord, id = randomUUID()): string {
    this.table(entity).set(id, { ...values, [idField]: id });
    return id;
  }

  rows(entity: string): CrmRecord[] {
    return [...this.table(entity).values()];
  }

  async retrieve(reference: CrmReference, select: string[]): Promise<CrmRecord | null> {
    this.touchedEntitySets.add(reference.entity);
    const row = this.table(reference.entity).get(reference.id);
    return row ? pick(row, select) : null;
  }

  async retrieveByKey(entity: string, key: { field: string; value: string }, select: string[]): Promise<CrmRecord | null> {
    this.touchedEntitySets.add(entity);
    const row = this.rows(entity).find(r => r[key.field] === key.value);
    return row ? pick(row, select) : null;
  }

  /**
   * One page, modelling what Dataverse was measured doing — not what would be convenient.
   *
   * KI-52 is the reason this comment exists: a fake that simply agrees with the caller proves
   * nothing. So this fake reproduces the behaviours the spike found on `org5869857f`
   * (`docs/evidence/Phase4_dataverse_paging_spike.txt`), including the awkward ones:
   *
   *   • the continuation is opaque and is rejected if the filter, sort or search changed;
   *   • a page may come back SHORT without meaning the end — only a missing continuation means that;
   *   • the last page carries no continuation at all;
   *   • an invalid continuation is refused rather than silently restarting at page one.
   *
   * What it cannot prove is that the real platform still behaves this way. That is what
   * `smoke-qdb-phase4.mjs` is for, and why the standing rule requires both.
   */
  async retrievePage(entity: string, query: CrmPageQuery, _context?: CrmCallContext): Promise<Page<CrmRecord>> {
    this.touchedEntitySets.add(entity);
    this.pageQueries.push({ entity, query });

    const fingerprint = fingerprintQuery(query);
    const offset = query.continuation ? Number(readContinuation(query.continuation, fingerprint)) : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      throw new Error(`FakeCrmAdapter received a continuation it did not issue: ${String(offset)}`);
    }

    const predicate = parseFilter(query.filter);
    let rows = this.rows(entity).filter(predicate);
    if (query.search) {
      const needle = query.search.toLowerCase();
      rows = rows.filter(r => Object.values(r).some(v => typeof v === 'string' && v.toLowerCase().includes(needle)));
    }
    for (const sort of [...(query.sort ?? [])].reverse()) {
      rows = [...rows].sort((a, b) => compare(a[sort.field], b[sort.field]) * (sort.descending ? -1 : 1));
    }

    const size = Math.min(this.shortPageSize ?? query.pageSize, query.pageSize);
    const slice = rows.slice(offset, offset + size);
    const nextOffset = offset + slice.length;
    const hasMore = nextOffset < rows.length;

    return buildPage(
      slice.map(r => pick(r, query.select)),
      query.pageSize,
      hasMore ? makeContinuation(String(nextOffset), fingerprint) : undefined,
      query.includeTotalCount ? rows.length : undefined,
    );
  }

  async retrieveMultiple(entity: string, query: CrmQuery, _context?: CrmCallContext): Promise<CrmRecord[]> {
    this.touchedEntitySets.add(entity);
    this.queries.push({ entity, query });
    const predicate = parseFilter(query.filter);
    let rows = this.rows(entity).filter(predicate);
    if (query.orderBy) {
      const { field, descending } = query.orderBy;
      rows = [...rows].sort((a, b) => compare(a[field], b[field]) * (descending ? -1 : 1));
    }
    if (query.top !== undefined) rows = rows.slice(0, query.top);
    return rows.map(r => pick(r, query.select));
  }

  async create(entity: string, values: CrmRecord): Promise<string> {
    this.touchedEntitySets.add(entity);
    if (this.failCreateWhen?.(entity, values)) throw new Error(`injected failure creating in ${entity}`);
    const id = randomUUID();
    const stored: CrmRecord = { ...resolveBinds(values), [primaryKeyOf(entity)]: id };
    // Mimic the platform and DefaultStatusAssigner: a new row is Active, a case opens at New, an
    // activity opens at Open and a promise at Active. The real organisation does this in the plugin.
    if (stored['statecode'] === undefined) stored['statecode'] = 0;
    if (entity === 'qdb_collectioncases' && stored['statuscode'] === undefined) stored['statuscode'] = 100000600;
    if (entity === 'qdb_collectionactivities') {
      if (stored['statuscode'] === undefined) stored['statuscode'] = 100000640;
      if (stored['qdb_ptpdate'] !== undefined && stored['qdb_ptpstatus'] === undefined) stored['qdb_ptpstatus'] = 100000080;
    }
    this.table(entity).set(id, stored);
    this.writes.push({ kind: 'create', entity, id, values });
    return id;
  }

  async update(reference: CrmReference, values: CrmRecord): Promise<void> {
    this.touchedEntitySets.add(reference.entity);
    const row = this.table(reference.entity).get(reference.id);
    if (!row) throw new Error(`no ${reference.entity} row ${reference.id}`);
    Object.assign(row, resolveBinds(values));
    this.writes.push({ kind: 'update', entity: reference.entity, id: reference.id, values });
  }

  async execute(operation: string, parameters: CrmRecord): Promise<unknown> {
    this.executed.push({ operation, parameters });
    if (!this.executeHandler) throw new Error(`execute(${operation}) is not stubbed`);
    return this.executeHandler(operation, parameters);
  }

  private table(entity: string): Map<string, CrmRecord> {
    let t = this.tables.get(entity);
    if (!t) { t = new Map(); this.tables.set(entity, t); }
    return t;
  }
}

/** Primary key column per entity set, for rows the fake creates itself. */
function primaryKeyOf(entity: string): string {
  switch (entity) {
    case 'qdb_collectioncases': return 'qdb_collectioncaseid';
    case 'qdb_delinquencysnapshots': return 'qdb_delinquencysnapshotid';
    case 'qdb_identityexceptions': return 'qdb_identityexceptionid';
    case 'qdb_collectionactivities': return 'activityid';
    case 'qdb_collectionactivitytypes': return 'qdb_collectionactivitytypeid';
    case 'contacts': return 'contactid';
    case 'accounts': return 'accountid';
    default: return `${entity.replace(/s$/, '')}id`;
  }
}

/** Turns `nav@odata.bind: /set(id)` into a `_nav_value` column so tests can inspect the link. */
function resolveBinds(values: CrmRecord): CrmRecord {
  const out: CrmRecord = {};
  for (const [key, value] of Object.entries(values)) {
    const bind = key.match(/^(.+)@odata\.bind$/);
    if (bind && typeof value === 'string') {
      const target = value.match(/^\/([^(]+)\(([^)]+)\)$/);
      out[`_${bind[1]}_value`] = target?.[2];
      out[`_${bind[1]}_entityset`] = target?.[1];
    } else {
      out[key] = value;
    }
  }
  return out;
}

function pick(row: CrmRecord, select: string[]): CrmRecord {
  const out: CrmRecord = {};
  for (const col of select) if (col in row) out[col] = row[col];
  // Lookup values are always returned by the platform when selected; expose the ones the fake stores.
  for (const [k, v] of Object.entries(row)) if (k.startsWith('_') && k.endsWith('_value')) out[k] = v;
  return out;
}

function parseFilter(filter: string | undefined): (row: CrmRecord) => boolean {
  if (!filter) return () => true;
  const clauses = filter.split(/\s+and\s+/).map(clause => {
    const m = clause.trim().match(/^(\w+)\s+eq\s+(?:'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?)|(true|false))$/);
    if (!m) throw new Error(`FakeCrmAdapter cannot evaluate filter clause: ${clause}`);
    const value: unknown = m[2] !== undefined ? m[2].replace(/''/g, "'") : m[3] !== undefined ? Number(m[3]) : m[4] === 'true';
    return (row: CrmRecord) => row[m[1]!] === value;
  });
  return row => clauses.every(c => c(row));
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}
