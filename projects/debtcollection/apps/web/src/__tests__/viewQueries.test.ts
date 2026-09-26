import { describe, expect, it } from 'vitest';
import { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import type { XrmLike } from '../platform/crmContext.js';
import { buildAuditFilter, buildCaseFilter, codeFor } from '../data/collectionQueries.js';
import {
  buildActivityFilter, buildSnapshotFilter, retrieveCase, retrieveCustomer, toCaseDetail, toPtpRow,
  toSnapshotRow,
} from '../data/caseQueries.js';
import {
  toIdentityExceptionRow, toPlatformConfigurationRow, toPlatformMappingRow, toStrategyActionRow,
  toStrategyRow,
} from '../data/configurationQueries.js';
import { loadCustomerAggregate } from '../data/customerAggregate.js';
import { COUNT_CAP, countMatching, formatCountResult } from '../data/counts.js';
import { readChoice, readLookupTable } from '../data/rowReaders.js';
import { CASE_STATUS_LABELS, ENTITY_SETS, READ_REGISTRY, toAttributeName } from '../data/schema.js';

/**
 * The reads behind the Phase 5 views.
 *
 * Every shaping test starts from a row in the shape Dataverse actually returns — the `_value` form
 * for a lookup, the `@…FormattedValue` annotation beside a choice, the `@…lookuplogicalname`
 * annotation that names a polymorphic target. A test that fed these functions a tidy invented object
 * would pass while the real platform returned something else, which is precisely the KI-52 failure.
 *
 * Where a test needs records to mean anything, the population is asserted first. "Every row matches"
 * is trivially true of no rows.
 */

const ANNOTATION = '@Microsoft.Dynamics.CRM.lookuplogicalname';
const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

/** A case row as the Web API returns one, annotations included. */
function caseRowFromPlatform(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    qdb_collectioncaseid: 'c-1',
    qdb_casenumber: 'COL-HL-000123',
    qdb_customerbusinessid: '28912345678',
    qdb_facilitynumber: 'HL-99001',
    qdb_facilitysourcesystem: 'HL',
    qdb_organizationcode: 100000140,
    [`qdb_organizationcode${FORMATTED}`]: 'Housing Loan',
    statuscode: 100000604,
    [`statuscode${FORMATTED}`]: 'PTP Active',
    statecode: 0,
    qdb_currentarrearbucket: 100000002,
    qdb_currentdpd: 74,
    qdb_currenttotalarrears: 41250,
    qdb_currentloanbalance: 860000,
    qdb_misasofdate: '2026-09-17',
    qdb_lastmissyncon: '2026-09-18T03:10:00Z',
    qdb_episodenumber: 2,
    qdb_opendate: '2026-08-02',
    qdb_customertype: 100000020,
    qdb_resolutiontype: null,
    qdb_correlationid: 'corr-abc-123',
    '_qdb_customerid_value': 'cust-1',
    [`_qdb_customerid_value${ANNOTATION}`]: 'contact',
    '_qdb_strategyid_value': 'strat-1',
    [`_qdb_strategyid_value${FORMATTED}`]: 'Early stage — soft contact',
    '_ownerid_value': 'user-1',
    [`_ownerid_value${FORMATTED}`]: 'Salman Sagar',
    ...overrides,
  };
}

/** A recording client API. Every call it receives is kept, so a test can assert what was asked. */
function recordingXrm(rowsByEntity: Record<string, Record<string, unknown>[]>, count?: number) {
  const calls: { logicalName: string; options?: string | undefined; maxPageSize?: number | undefined }[] = [];
  const singles: { logicalName: string; id: string; options?: string | undefined }[] = [];
  const xrm: XrmLike = {
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => 'https://org5869857f.crm4.dynamics.com/',
        getVersion: () => '9.2.24091.00203',
        userSettings: { userId: '{1}', userName: 'Tester', languageId: 1033, securityRoles: [] },
        organizationSettings: { uniqueName: 'org5869857f' },
      }),
    },
    WebApi: {
      async retrieveRecord(logicalName: string, id: string, options?: string) {
        singles.push({ logicalName, id, options });
        const row = rowsByEntity[logicalName]?.[0];
        if (!row) throw { status: 404 };
        return row;
      },
      async retrieveMultipleRecords(logicalName: string, options?: string, maxPageSize?: number) {
        calls.push({ logicalName, options, maxPageSize });
        return {
          entities: rowsByEntity[logicalName] ?? [],
          ...(count !== undefined ? { '@odata.count': count } : {}),
        };
      },
      async createRecord() { return { id: '{1}' }; },
      async updateRecord() { return { id: '1' }; },
    },
  };
  return { adapter: new XrmCrmAdapter(xrm), calls, singles };
}

// ── Shaping ──────────────────────────────────────────────────────────────────

describe('a case is shaped from the row the platform actually returns', () => {
  it('reads the status from the proven option table rather than the annotation', () => {
    const detail = toCaseDetail(caseRowFromPlatform());
    expect(detail.status).toBe('PTP Active');
    expect(CASE_STATUS_LABELS[100000604]).toBe('PTP Active');
  });

  it('falls back to the platform formatted value for a choice this build has no table for', () => {
    const row = { qdb_risklevel: 100000999, [`qdb_risklevel${FORMATTED}`]: 'Watchlist' };
    expect(readChoice(row, 'qdb_risklevel')).toBe('Watchlist');
  });

  it('shows nothing rather than a raw option number when neither answers', () => {
    expect(readChoice({ qdb_risklevel: 100000999 }, 'qdb_risklevel')).toBeUndefined();
  });

  it('names the customer table from the lookup annotation, not from the organisation', () => {
    expect(readLookupTable(caseRowFromPlatform(), '_qdb_customerid_value')).toBe('contact');
    const bfd = caseRowFromPlatform({ [`_qdb_customerid_value${ANNOTATION}`]: 'account' });
    expect(toCaseDetail(bfd).customerTable).toBe('account');
  });

  it('carries the strategy the server resolved, by name', () => {
    expect(toCaseDetail(caseRowFromPlatform()).strategyName).toBe('Early stage — soft contact');
  });

  it('leaves an unset column absent rather than zero or empty', () => {
    const detail = toCaseDetail(caseRowFromPlatform());
    expect(detail.resolutionType).toBeUndefined();
    expect('resolutionType' in detail).toBe(false);
  });

  it('marks a closed case closed from statecode', () => {
    expect(toCaseDetail(caseRowFromPlatform({ statecode: 1 })).isOpen).toBe(false);
  });
});

describe('promises, snapshots and configuration shape from real row forms', () => {
  it('reads a promise with its status label and amounts', () => {
    const ptp = toPtpRow({
      activityid: 'a-1', subject: 'PTP',
      qdb_ptpdate: '2026-09-25', qdb_promisedamount: 5000,
      qdb_ptpstatus: 100000080, qdb_promisetype: 100000581,
      '_qdb_collectioncaseid_value': 'c-1',
      [`_qdb_collectioncaseid_value${FORMATTED}`]: 'COL-HL-000123',
    });
    expect(ptp.ptpStatus).toBe('Active');
    expect(ptp.promiseType).toBe('Partial');
    expect(ptp.caseNumber).toBe('COL-HL-000123');
  });

  it('reads a snapshot bucket from the same table the case list filters by', () => {
    const snapshot = toSnapshotRow({
      qdb_delinquencysnapshotid: 's-1', qdb_arrearbucket: 100000002, qdb_dpd: 74,
      qdb_eligibilityoutcome: 100000261,
    });
    expect(snapshot.bucket).toBe('61-90');
    expect(snapshot.eligibilityOutcome).toBe('Existing episode — update');
  });

  it('reads a strategy action lookup by its _value form', () => {
    const action = toStrategyActionRow({
      qdb_strategyactionid: 'sa-1', qdb_name: 'Send reminder',
      qdb_triggerevent: 100000240, qdb_communicationchannel: 100000100, qdb_isactive: true,
      '_qdb_strategyid_value': 'strat-1',
      [`_qdb_strategyid_value${FORMATTED}`]: 'Early stage',
    });
    expect(action.strategyId).toBe('strat-1');
    expect(action.strategyName).toBe('Early stage');
    expect(action.triggerEvent).toBe('Day offset');
    expect(action.channel).toBe('SMS');
  });

  it('reads a strategy without inventing a label for an unverified choice', () => {
    const strategy = toStrategyRow({
      qdb_collectionstrategyid: 'strat-1', qdb_code: 'EARLY', qdb_name: 'Early stage',
      qdb_isactive: true, qdb_dpdfrom: 1, qdb_dpdto: 30, qdb_producttype: 100000999,
    });
    expect(strategy.dpdFrom).toBe(1);
    expect(strategy.productType).toBeUndefined();
  });

  it('reads an identity exception reason and status', () => {
    const exception = toIdentityExceptionRow({
      qdb_identityexceptionid: 'e-1', qdb_name: 'EX-1',
      qdb_exceptionreason: 100000300, qdb_exceptionstatus: 100000320,
    });
    expect(exception.reason).toBe('Customer not found');
    expect(exception.status).toBe('Open');
  });

  it('reads the platform configuration that decides the customer table', () => {
    const configuration = toPlatformConfigurationRow({
      qdb_platformconfigurationid: 'p-1', qdb_name: 'HL Cloud',
      qdb_platformtype: 100000121, qdb_organizationcode: 100000140,
      qdb_customerentity: 'contact', qdb_isactive: true,
    });
    expect(configuration.platformType).toBe('Cloud');
    expect(configuration.organization).toBe('HL');
    expect(configuration.customerEntity).toBe('contact');
  });

  it('reads a mapping row back to its configuration by the lookup value form', () => {
    const mapping = toPlatformMappingRow({
      qdb_platformmappingid: 'm-1', qdb_name: 'Customer id',
      qdb_crmentitylogicalname: 'contact', qdb_crmfieldlogicalname: 'qdb_qid', qdb_isactive: true,
      '_qdb_platformconfigurationid_value': 'p-1',
    });
    expect(mapping.configurationId).toBe('p-1');
  });
});

// ── Narrowing is sent to the source ──────────────────────────────────────────

describe('every narrowing becomes a filter the source applies', () => {
  it('turns a bucket label back into the option value the platform stores', () => {
    expect(buildCaseFilter({ bucket: '61-90' })).toContain('qdb_currentarrearbucket eq 100000002');
    expect(codeFor(CASE_STATUS_LABELS, 'Settled')).toBe(100000613);
  });

  it('scopes a case list to one customer by the canonical business id', () => {
    expect(buildCaseFilter({ customerBusinessId: '28912345678' }))
      .toBe("qdb_customerbusinessid eq '28912345678'");
  });

  it('escapes a quote rather than letting it break the filter', () => {
    expect(buildCaseFilter({ search: "O'Brien" })).toContain("O''Brien");
  });

  it('filters activities by the case lookup value form', () => {
    expect(buildActivityFilter({ caseId: 'c-1' })).toBe('_qdb_collectioncaseid_value eq c-1');
  });

  it('asks the source for promises only, rather than filtering a page here', () => {
    expect(buildActivityFilter({ promisesOnly: true })).toBe('qdb_ptpdate ne null');
  });

  it('scopes snapshots by case, customer or facility', () => {
    expect(buildSnapshotFilter({ caseId: 'c-1' })).toContain('_qdb_collectioncaseid_value eq c-1');
    expect(buildSnapshotFilter({ facilityNumber: 'HL-1' })).toContain("qdb_facilitynumber eq 'HL-1'");
    expect(buildSnapshotFilter({})).toBeUndefined();
  });

  it('finds a case audit trail by the correlation id inside the diagnostic block', () => {
    // qdb_crmlogs has no correlation column; the id is written into `description`.
    expect(buildAuditFilter({ correlationId: 'corr-abc-123' }))
      .toBe("contains(description,'corr-abc-123')");
  });
});

// ── Reads against the adapter ────────────────────────────────────────────────

describe('a single case and its customer are read through the adapter', () => {
  it('reads the case by its entity logical name', async () => {
    const { adapter, singles } = recordingXrm({ qdb_collectioncase: [caseRowFromPlatform()] });
    const detail = await retrieveCase(adapter, 'c-1');
    expect(singles).toHaveLength(1);
    expect(singles[0]!.logicalName).toBe('qdb_collectioncase');
    expect(detail?.caseNumber).toBe('COL-HL-000123');
  });

  it('returns null for a case that does not resolve, rather than throwing', async () => {
    const { adapter } = recordingXrm({});
    await expect(retrieveCase(adapter, 'missing')).resolves.toBeNull();
  });

  it('reads a Housing Loan customer as a contact', async () => {
    const { adapter, singles } = recordingXrm({ contact: [{ contactid: 'cust-1', fullname: 'A Customer', statecode: 0 }] });
    const profile = await retrieveCustomer(adapter, 'contact', 'cust-1');
    expect(singles[0]!.logicalName).toBe('contact');
    expect(singles[0]!.options).toContain('fullname');
    expect(profile?.displayName).toBe('A Customer');
  });

  it('reads a BFD customer as an account, selecting account columns', async () => {
    const { adapter, singles } = recordingXrm({ account: [{ accountid: 'a-1', name: 'A Company', statecode: 0 }] });
    const profile = await retrieveCustomer(adapter, 'account', 'a-1');
    expect(singles[0]!.logicalName).toBe('account');
    expect(singles[0]!.options).toContain('accountnumber');
    expect(profile?.table).toBe('account');
  });

  it('refuses a customer table it does not know rather than reading it as a contact', async () => {
    const { adapter } = recordingXrm({});
    await expect(retrieveCustomer(adapter, 'lead', 'x')).rejects.toThrow(/contact.*account/s);
  });
});

describe('Customer 360 aggregates without creating a customer master', () => {
  const twoFacilities = [
    caseRowFromPlatform({ qdb_collectioncaseid: 'c-1', qdb_facilitynumber: 'HL-1', qdb_currentloanbalance: 100, qdb_currenttotalarrears: 10, qdb_currentdpd: 20 }),
    caseRowFromPlatform({ qdb_collectioncaseid: 'c-2', qdb_facilitynumber: 'HL-2', qdb_currentloanbalance: 200, qdb_currenttotalarrears: 30, qdb_currentdpd: 95 }),
    caseRowFromPlatform({ qdb_collectioncaseid: 'c-3', qdb_facilitynumber: 'HL-1', qdb_currentloanbalance: 100, qdb_currenttotalarrears: 10, qdb_currentdpd: 20 }),
  ];

  it('sums exposure and overdue across the cases it read', async () => {
    const { adapter } = recordingXrm({
      qdb_collectioncase: twoFacilities,
      contact: [{ contactid: 'cust-1', fullname: 'A Customer', statecode: 0 }],
    }, 3);
    const aggregate = await loadCustomerAggregate(adapter, '28912345678');
    expect(aggregate.cases.length, 'the aggregate must have read cases').toBe(3);
    expect(aggregate.totalExposure).toBe(400);
    expect(aggregate.totalOverdue).toBe(50);
    expect(aggregate.worstDpd).toBe(95);
  });

  it('counts a facility once even when two cases name it', async () => {
    const { adapter } = recordingXrm({
      qdb_collectioncase: twoFacilities,
      contact: [{ contactid: 'cust-1', fullname: 'A Customer', statecode: 0 }],
    }, 3);
    const aggregate = await loadCustomerAggregate(adapter, '28912345678');
    expect(aggregate.cases.length).toBe(3);
    expect(aggregate.facilities).toHaveLength(2);
    expect(aggregate.facilities.map(f => f.facilityNumber)).toEqual(['HL-1', 'HL-2']);
  });

  it('resolves the CRM customer from the case lookup annotation', async () => {
    const { adapter, singles } = recordingXrm({
      qdb_collectioncase: twoFacilities,
      contact: [{ contactid: 'cust-1', fullname: 'A Customer', statecode: 0 }],
    }, 3);
    const aggregate = await loadCustomerAggregate(adapter, '28912345678');
    expect(singles.map(s => s.logicalName)).toContain('contact');
    expect(aggregate.profile?.displayName).toBe('A Customer');
  });

  it('returns no profile when no case carries a resolved customer lookup', async () => {
    const unlinked = [caseRowFromPlatform({ '_qdb_customerid_value': null, [`_qdb_customerid_value${ANNOTATION}`]: null })];
    const { adapter } = recordingXrm({ qdb_collectioncase: unlinked }, 1);
    const aggregate = await loadCustomerAggregate(adapter, '28912345678');
    expect(aggregate.cases).toHaveLength(1);
    expect(aggregate.profile).toBeUndefined();
  });

  it('reports absent totals as absent rather than as zero', async () => {
    const noFigures = [caseRowFromPlatform({ qdb_currentloanbalance: null, qdb_currenttotalarrears: null, qdb_currentdpd: null })];
    const { adapter } = recordingXrm({
      qdb_collectioncase: noFigures,
      contact: [{ contactid: 'cust-1', fullname: 'A Customer', statecode: 0 }],
    }, 1);
    const aggregate = await loadCustomerAggregate(adapter, '28912345678');
    expect(aggregate.cases).toHaveLength(1);
    expect(aggregate.totalExposure).toBeUndefined();
    expect(aggregate.worstDpd).toBeUndefined();
  });
});

// ── Counts ───────────────────────────────────────────────────────────────────

/**
 * A transport that answers `$count`, and an `Xrm` that never does.
 *
 * That split is the whole point. `Xrm.WebApi.retrieveMultipleRecords` returns `entities` and
 * `nextLink` and **no `@odata.count`**, whatever the query asks for — verified against
 * `org5869857f`. The old fake supplied a count through `Xrm`, so these tests passed while every
 * KPI tile on the deployed workspace showed an em dash and the bulk target count read zero over a
 * grid full of cases (KI-96).
 */
function countingAdapter(total: number) {
  const urls: string[] = [];
  const transport = {
    async get(url: string) {
      urls.push(url);
      return { status: 200, body: { '@odata.count': total, value: [] } };
    },
    async patch() { throw new Error('not used'); },
    async createOnly() { throw new Error('not used'); },
    async post() { throw new Error('not used'); },
  };
  const { adapter: base, calls } = recordingXrm({});
  const adapter = new XrmCrmAdapter(
    (base as unknown as { xrm: XrmLike }).xrm, undefined, transport as never);
  return { adapter, urls, calls };
}

describe('a KPI count is answered by the platform, not by reading rows', () => {
  it('asks for one row and reads the count, over the transport that actually returns one', async () => {
    const { adapter, urls, calls } = countingAdapter(1295);

    const result = await countMatching(adapter, 'qdb_collectioncases', 'statecode eq 0');

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('$top=1');
    expect(urls[0]).toContain('$count=true');
    // The client API cannot answer this, so a count that went through it would be undefined.
    expect(calls, 'a count must not be asked of Xrm.WebApi').toHaveLength(0);
    expect(result.value).toBe(1295);
    expect(result.atLeast).toBe(false);
  });

  it('reports the platform cap as a floor rather than as a total', async () => {
    const { adapter } = countingAdapter(COUNT_CAP);
    const result = await countMatching(adapter, 'qdb_collectioncases');
    expect(result.atLeast).toBe(true);
    expect(formatCountResult(result)).toBe('5,000+');
  });

  it('shows an em dash for a count that never arrived', () => {
    expect(formatCountResult(undefined)).toBe('—');
    expect(formatCountResult({ atLeast: false })).toBe('—');
  });
});

// ── The column registry ──────────────────────────────────────────────────────

describe('every column the workspace reads is registered', () => {
  it('registers a read for each entity set the views use', () => {
    expect(READ_REGISTRY.length).toBeGreaterThanOrEqual(11);
    for (const entry of READ_REGISTRY) {
      expect(entry.columns.length, `${entry.entitySet} must declare columns`).toBeGreaterThan(0);
    }
  });

  it('turns a lookup value column back into its attribute name for verification', () => {
    expect(toAttributeName('_qdb_strategyid_value')).toBe('qdb_strategyid');
    expect(toAttributeName('qdb_casenumber')).toBe('qdb_casenumber');
    expect(toAttributeName(`_qdb_customerid_value${ANNOTATION}`)).toBeUndefined();
  });

  it('registers a column for every entity set a query module reads', () => {
    const registered = new Set(READ_REGISTRY.map(entry => entry.entitySet));
    expect(registered.size).toBe(READ_REGISTRY.length);
    for (const entitySet of Object.values(ENTITY_SETS)) {
      expect(registered.has(entitySet), `${entitySet} is reachable but unregistered`).toBe(true);
    }
  });

  it('registers no duplicate column within an entity', () => {
    expect(READ_REGISTRY.length, 'an empty registry would make the loop below assert nothing').toBeGreaterThan(0);
    for (const entry of READ_REGISTRY) {
      expect(new Set(entry.columns).size, `${entry.entitySet} repeats a column`).toBe(entry.columns.length);
    }
  });
});

describe('a case list narrowed by strategy and owner, for a dashboard drill-down', () => {
  it('sends the strategy to the source, and asks for no strategy at all with none', () => {
    expect(buildCaseFilter({ openOnly: true, strategy: 's-early' })).toBe('statecode eq 0 and _qdb_strategyid_value eq s-early');
    expect(buildCaseFilter({ openOnly: true, strategy: 'none' })).toBe('statecode eq 0 and _qdb_strategyid_value eq null');
  });

  it('sends the owner to the source', () => {
    expect(buildCaseFilter({ openOnly: true, ownerId: 'u-1' })).toBe('statecode eq 0 and _ownerid_value eq u-1');
  });
});
