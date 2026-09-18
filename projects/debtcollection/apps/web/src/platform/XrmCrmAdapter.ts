import {
  buildPage,
  fingerprintQuery,
  makeContinuation,
  readContinuation,
  type CrmCallContext,
  type CrmPageQuery,
  type CrmQuery,
  type CrmRecord,
  type CrmReference,
  type ICrmAdapter,
  type Page,
  type Sort,
} from '@dcp/domain';
import type { XrmLike } from './crmContext.js';

/**
 * The browser half of `ICrmAdapter`, over `Xrm.WebApi`.
 *
 * The interface is the one Phases 2–4 already proved on the service side; this supplies the
 * implementation that runs inside the CRM session, so the workspace makes CRM calls as the signed-in
 * user and inherits their privileges. **No business rule lives here** — it is transport, exactly like
 * `DataverseCrmAdapter`.
 *
 * Two differences from the service-side adapter are real and were verified against the platform
 * rather than assumed, because this is precisely the KI-52 class of mistake:
 *
 *   • **`Xrm.WebApi` takes an entity LOGICAL name**, while the OData surface takes an entity SET name.
 *     `qdb_collectioncase` versus `qdb_collectioncases`, and — the one that bites — `qdb_crmlogs`
 *     versus `qdb_crmlogses`. Callers keep using set names, and `toLogicalName` translates.
 *   • **Paging is `maxPageSize` plus a returned `nextLink`**, not a `Prefer` header the caller sets.
 *     The link is still opaque and is still followed verbatim.
 *
 * The continuation this adapter issues is the same opaque, fingerprinted token the rest of the
 * platform uses, so a caller cannot tell — and must not care — which source produced it.
 */
export class XrmCrmAdapter implements ICrmAdapter {
  constructor(
    private readonly xrm: XrmLike,
    /** Overrides for entity sets whose logical name is not simply the set minus a trailing `s`. */
    private readonly logicalNameOverrides: Readonly<Record<string, string>> = DEFAULT_LOGICAL_NAMES,
  ) {}

  /** @inheritdoc */
  async retrieve(reference: CrmReference, select: string[], _context: CrmCallContext = {}): Promise<CrmRecord | null> {
    try {
      return await this.xrm.WebApi.retrieveRecord(
        this.toLogicalName(reference.entity), reference.id, `?$select=${select.join(',')}`);
    } catch (error) {
      return this.nullIfNotFound(error);
    }
  }

  /** @inheritdoc */
  async retrieveByKey(
    entity: string,
    key: { field: string; value: string },
    select: string[],
    _context: CrmCallContext = {},
  ): Promise<CrmRecord | null> {
    // Alternate-key syntax is the same shape the service side uses; the quoting is the platform's.
    const id = `${key.field}='${encodeURIComponent(key.value)}'`;
    try {
      return await this.xrm.WebApi.retrieveRecord(
        this.toLogicalName(entity), id, `?$select=${select.join(',')}`);
    } catch (error) {
      return this.nullIfNotFound(error);
    }
  }

  /** @inheritdoc — bounded sets only; anything that grows with the book uses `retrievePage`. */
  async retrieveMultiple(entity: string, query: CrmQuery, _context: CrmCallContext = {}): Promise<CrmRecord[]> {
    const options = buildOptions({
      select: query.select,
      ...(query.filter !== undefined ? { filter: query.filter } : {}),
      ...(query.orderBy !== undefined ? { sort: [query.orderBy] } : {}),
      ...(query.top !== undefined ? { top: query.top } : {}),
    });
    const result = await this.xrm.WebApi.retrieveMultipleRecords(this.toLogicalName(entity), options);
    return result.entities;
  }

  /**
   * @inheritdoc
   *
   * `maxPageSize` is always supplied. The Phase 4 spike established that a Dataverse read without a
   * page bound returns the entire table, and the same reasoning applies here: a page size is never
   * optional, because the alternative is the whole book in the browser.
   */
  async retrievePage(entity: string, query: CrmPageQuery, _context: CrmCallContext = {}): Promise<Page<CrmRecord>> {
    const fingerprint = fingerprintQuery(query);

    // A continuation carries the platform's own nextLink, which is an absolute URL. `Xrm.WebApi`
    // will not take one: it requires an options string and refuses anything else with
    // "UciError: Option Parameter should begin with \"?\"". So the link is reduced to its query
    // string, which is what the client API wants and still carries the `$skiptoken` together with
    // the original `$select`, `$filter` and `$orderby`.
    const options = query.continuation
      ? toOptionsString(readContinuation(query.continuation, fingerprint))
      : buildOptions({
        select: query.select,
        ...(query.filter !== undefined ? { filter: query.filter } : {}),
        ...(query.sort !== undefined ? { sort: query.sort } : {}),
        ...(query.includeTotalCount ? { count: true } : {}),
      });

    const result = await this.xrm.WebApi.retrieveMultipleRecords(
      this.toLogicalName(entity), options, query.pageSize);

    const total = (result as { '@odata.count'?: number })['@odata.count'];
    return buildPage(
      result.entities,
      query.pageSize,
      result.nextLink ? makeContinuation(result.nextLink, fingerprint) : undefined,
      typeof total === 'number' ? total : undefined,
    );
  }

  /** @inheritdoc */
  async create(entity: string, values: CrmRecord, _context: CrmCallContext = {}): Promise<string> {
    const { id } = await this.xrm.WebApi.createRecord(this.toLogicalName(entity), values);
    return id.replace(/[{}]/g, '');
  }

  /** @inheritdoc */
  async update(reference: CrmReference, values: CrmRecord, _context: CrmCallContext = {}): Promise<void> {
    await this.xrm.WebApi.updateRecord(this.toLogicalName(reference.entity), reference.id, values);
  }

  /**
   * @inheritdoc
   *
   * The same operation is a Custom API on Dataverse and a Process Action on-premises, and both are
   * reached by name. `Xrm.WebApi.execute` needs a request object carrying its own metadata, which the
   * caller cannot supply without knowing the operation's parameter types — so this refuses clearly
   * rather than half-working, and the workspace routes engine calls through the service layer.
   */
  async execute(operation: string, _parameters: CrmRecord, _context: CrmCallContext = {}): Promise<unknown> {
    throw new Error(
      `Operation '${operation}' cannot be invoked from the browser adapter: Xrm.WebApi.execute requires a ` +
      'request object with per-parameter metadata that this seam does not carry. Server-side operations are ' +
      'called through the Integration Service, which keeps the decision server-side where it belongs.');
  }

  /**
   * Entity set name to entity logical name.
   *
   * The default is the set minus its trailing `s`, which is right for most tables and wrong for
   * enough of them to matter. `qdb_crmlogs` is served at `qdb_crmlogses`, and the Phase 4 spike got
   * that wrong on its first run — so known exceptions are listed rather than derived, and anything
   * unexpected is better reported than guessed.
   */
  toLogicalName(entitySet: string): string {
    const override = this.logicalNameOverrides[entitySet];
    if (override) return override;
    if (entitySet.endsWith('ies')) return `${entitySet.slice(0, -3)}y`;
    if (entitySet.endsWith('s')) return entitySet.slice(0, -1);
    return entitySet;
  }

  private nullIfNotFound(error: unknown): null {
    const status = (error as { status?: number; errorCode?: number })?.status;
    if (status === 404) return null;
    throw error;
  }
}

/**
 * Entity sets whose logical name the plural rule gets wrong.
 *
 * Read from the organisation's `EntityDefinitions`, not inferred. Each one here is a name that the
 * naive rule would have produced incorrectly.
 */
export const DEFAULT_LOGICAL_NAMES: Readonly<Record<string, string>> = {
  qdb_crmlogses: 'qdb_crmlogs',
  qdb_collectionactivities: 'qdb_collectionactivity',
  qdb_collectionstrategies: 'qdb_collectionstrategy',
  qdb_delinquencysnapshots: 'qdb_delinquencysnapshot',
  qdb_collectioncases: 'qdb_collectioncase',
  qdb_collectionactivitytypes: 'qdb_collectionactivitytype',
  qdb_identityexceptions: 'qdb_identityexception',
  qdb_strategyactions: 'qdb_strategyaction',
  qdb_assignmentconfigurations: 'qdb_assignmentconfiguration',
  qdb_platformconfigurations: 'qdb_platformconfiguration',
  qdb_platformmappings: 'qdb_platformmapping',
  contacts: 'contact',
  accounts: 'account',
};

/**
 * Reduces a continuation to the options string `Xrm.WebApi` accepts.
 *
 * Dataverse returns `@odata.nextLink` as an absolute URL, and the service-side client follows it
 * verbatim — correct there, because it issues the HTTP request itself. The browser client API does
 * not: it composes the URL from the entity name and refuses an absolute one outright with
 * *"UciError: Option Parameter should begin with `?`"*.
 *
 * The first version passed the link straight through. The node shim in the platform spike accepted
 * it, because the shim built the URL itself — so the harness was more permissive than the thing it
 * stood for, and following a continuation was never actually exercised. A shim that tolerates what
 * the real API rejects proves the code works against the shim.
 */
export function toOptionsString(continuationOrOptions: string): string {
  if (continuationOrOptions.startsWith('?')) return continuationOrOptions;
  const query = continuationOrOptions.indexOf('?');
  if (query < 0) {
    throw new Error(
      `A continuation must carry a query string; received "${continuationOrOptions.slice(0, 80)}". ` +
      'Xrm.WebApi builds the URL itself and takes only options beginning with "?".');
  }
  return continuationOrOptions.slice(query);
}

/** Builds the OData option string the client API takes. Sort is a list; ties span page boundaries. */
export function buildOptions(query: {
  select: readonly string[];
  filter?: string;
  sort?: readonly Sort[];
  top?: number;
  count?: boolean;
}): string {
  // An empty `$select` is rejected by the platform — "'select' and 'expand' cannot be both null or
  // empty" — so it is omitted rather than sent blank. A count asks for no columns, which is a real
  // and correct request: what it wants is the number in the envelope, not the rows.
  const parts = query.select.length > 0 ? [`$select=${query.select.join(',')}`] : [];
  if (query.filter) parts.push(`$filter=${query.filter}`);
  if (query.sort && query.sort.length > 0) {
    parts.push(`$orderby=${query.sort.map(s => `${s.field}${s.descending ? ' desc' : ' asc'}`).join(',')}`);
  }
  if (query.top !== undefined) parts.push(`$top=${query.top}`);
  if (query.count) parts.push('$count=true');
  return `?${parts.join('&')}`;
}
