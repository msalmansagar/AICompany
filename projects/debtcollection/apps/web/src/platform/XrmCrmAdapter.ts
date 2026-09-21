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
  type IConcurrencyControlledWrites,
  type Page,
  type Sort,
  type VersionedRecord,
  type IdempotentCreateResult,
  type RowVersion,
  CrmConcurrencyError,
} from '@dcp/domain';
import type { XrmLike } from './crmContext.js';
import { PRECONDITION_FAILED, type WriteTransport } from './writeTransport.js';

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
export class XrmCrmAdapter implements ICrmAdapter, IConcurrencyControlledWrites {
  constructor(
    private readonly xrm: XrmLike,
    /** Overrides for entity sets whose logical name is not simply the set minus a trailing `s`. */
    private readonly logicalNameOverrides: Readonly<Record<string, string>> = DEFAULT_LOGICAL_NAMES,
    /**
     * The transport for concurrency-controlled writes (ADR-DCP-18).
     *
     * Absent, the versioned operations refuse rather than quietly falling back to an unguarded
     * write — a silent downgrade to last-write-wins is the exact failure this exists to prevent.
     */
    private readonly writeTransport?: WriteTransport,
  ) {}

  /**
   * Reads a record with the version needed to write it back safely.
   *
   * The read goes through the write transport rather than `Xrm.WebApi`, because the version must be
   * the one the *writer* will be compared against. Taking it from a different channel would be a
   * guess that the two agree — and the whole point of this operation is not to guess.
   */
  async retrieveVersioned(
    reference: CrmReference,
    select: string[],
    _context: CrmCallContext = {},
  ): Promise<VersionedRecord | null> {
    const transport = this.requireWriteTransport('read a record with its version');
    const options = select.length > 0 ? `?$select=${select.join(',')}` : '';
    const response = await transport.get(`/${reference.entity}(${reference.id})${options}`);

    if (response.status === 404) return null;
    if (response.status >= 400) {
      throw new Error(`Reading ${reference.entity} ${reference.id} failed (${response.status}): ${response.message ?? ''}`);
    }
    if (!response.etag) {
      throw new Error(
        `${reference.entity} ${reference.id} came back with no version token, so it cannot be updated safely.`);
    }
    return { record: (response.body ?? {}) as CrmRecord, version: response.etag as RowVersion };
  }

  /**
   * Updates a record only if it still carries the version the caller read.
   *
   * A `412` becomes a `CrmConcurrencyError`, which the UI must be able to tell apart from an
   * ordinary save failure: "this record changed, reload it" and "the save failed" call for different
   * words and different buttons.
   */
  async updateVersioned(
    reference: CrmReference,
    values: CrmRecord,
    expectedVersion: RowVersion,
    _context: CrmCallContext = {},
  ): Promise<RowVersion> {
    const transport = this.requireWriteTransport('update a record safely');
    const response = await transport.patch(`/${reference.entity}(${reference.id})`, values, expectedVersion);

    if (response.status === PRECONDITION_FAILED) {
      throw new CrmConcurrencyError(reference, expectedVersion, response.message);
    }
    if (response.status >= 400) {
      throw new Error(`Updating ${reference.entity} ${reference.id} failed (${response.status}): ${response.message ?? ''}`);
    }
    // A PATCH returns the new version in the ETag header. Where the platform omits it, the caller is
    // told to re-read rather than handed a stale token that would fail on the next write.
    if (!response.etag) {
      throw new Error(
        `${reference.entity} ${reference.id} was updated but returned no new version; re-read it before writing again.`);
    }
    return response.etag as RowVersion;
  }

  /**
   * Creates a record at an id the caller chose, once, however many times this is called.
   *
   * `If-None-Match: *` turns the platform's upsert-by-id into create-only, so a repeat is refused
   * with `412` instead of producing a second activity. Proved against the organisation, including
   * that the Create-stage plugins still fire — `DefaultStatusAssigner` and `ActivitySubjectComposer`
   * both ran, which matters: an upsert that skipped them would leave the record in a state nothing
   * else expects.
   *
   * A repeat returns `created: false` rather than throwing. The record the user asked for exists,
   * which is success; raising an error over a correct outcome would be the wrong conversation.
   *
   * Both this and a stale write fail with 412, and they are told apart by **which request was
   * made** rather than by reading the message — the two send opposite preconditions.
   */
  async createIdempotent(
    entity: string,
    id: string,
    values: CrmRecord,
    _context: CrmCallContext = {},
  ): Promise<IdempotentCreateResult> {
    const transport = this.requireWriteTransport('create a record idempotently');
    const response = await transport.createOnly(`/${entity}(${id})`, values);

    if (response.status === PRECONDITION_FAILED) return { id, created: false };
    if (response.status >= 400) {
      throw new Error(`Creating ${entity} ${id} failed (${response.status}): ${response.message ?? ''}`);
    }
    return { id, created: true };
  }


  /**
   * Appends a record to a collection-valued navigation property.
   *
   * Separate from `create` because it is not a create in the client API's sense: there is no entity
   * set to name, only an owning record and one of its collections. `Xrm.WebApi.createRecord` cannot
   * express that, which is why this goes through the transport.
   */
  async appendToCollection(path: string, values: CrmRecord): Promise<void> {
    const transport = this.requireWriteTransport('append to a collection');
    const response = await transport.post(`/${path}`, values);
    if (response.status >= 400) {
      throw new Error(`Appending to ${path} failed (${response.status}): ${response.message ?? ''}`);
    }
  }

  /**
   * Reads a collection-valued navigation property.
   *
   * Needed to answer "does this activity already carry its recipient?" — a question `Xrm.WebApi`
   * cannot ask, because there is no entity set to name. Bounded by `$top`, because a related
   * collection is still a collection.
   */
  async readRelated(path: string, select: string[], top = 50): Promise<CrmRecord[]> {
    const transport = this.requireWriteTransport('read a related collection');
    const options = `?$select=${select.join(',')}&$top=${top}`;
    const response = await transport.get(`/${path}${options}`);

    if (response.status === 404) return [];
    if (response.status >= 400) {
      throw new Error(`Reading ${path} failed (${response.status}): ${response.message ?? ''}`);
    }
    return ((response.body as { value?: CrmRecord[] } | undefined)?.value ?? []);
  }

  /**
   * Reads a memo column's real capacity from platform metadata.
   *
   * The bulk executor refuses a population that will not fit the column it is about to be written
   * into, and that refusal is only honest if it is sized against the column that **exists** rather
   * than the one that was requested when it was provisioned. So the number is read from
   * `EntityDefinitions`, exactly as the provisioning verifier reads it back.
   *
   * Returns `null` when metadata cannot be read. The caller must then refuse to start a run: a
   * capacity nobody could establish is not a capacity to send against.
   */
  async readMemoCapacity(entityLogicalName: string, attribute: string): Promise<number | null> {
    const transport = this.requireWriteTransport('read column metadata');
    const response = await transport.get(
      `/EntityDefinitions(LogicalName='${entityLogicalName}')`
      + `/Attributes(LogicalName='${attribute}')`
      + '/Microsoft.Dynamics.CRM.MemoAttributeMetadata?$select=LogicalName,MaxLength');

    if (response.status >= 400) return null;
    const maxLength = (response.body as { MaxLength?: unknown } | undefined)?.MaxLength;
    return typeof maxLength === 'number' ? maxLength : null;
  }

  private requireWriteTransport(what: string): WriteTransport {
    if (!this.writeTransport) {
      throw new Error(
        `Cannot ${what}: this adapter was built without a write transport. Concurrency-controlled ` +
        'writes need one (ADR-DCP-18), and falling back to an unguarded write would silently ' +
        'reintroduce last-write-wins.');
    }
    return this.writeTransport;
  }

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
  // Native activity sets whose logical name is not the set minus a trailing 's'.
  faxes: 'fax',
  emails: 'email',
  activityparties: 'activityparty',
  qdb_communicationruns: 'qdb_communicationrun',
  qdb_communicationtemplates: 'qdb_communicationtemplate',
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
