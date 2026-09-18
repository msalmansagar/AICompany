import { describe, expect, it } from 'vitest';
import { CASE_STATUS_CODES, CollectionSettingsError } from '@dcp/domain';
import { DelinquencySyncService } from '../services/collection/index.js';
import { buildHarness, delinquentRecord, housingLoanConfiguration, MemoryLogger } from './helpers/collectionFixtures.js';
import { FakeCrmAdapter } from './helpers/FakeCrmAdapter.js';

const CASES = 'qdb_collectioncases';
const SNAPSHOTS = 'qdb_delinquencysnapshots';
const EXCEPTIONS = 'qdb_identityexceptions';

describe('a new delinquent facility', () => {
  it('opens episode 1 for the facility', async () => {
    const h = buildHarness();
    const outcome = await h.service.processRecord(delinquentRecord());
    expect(outcome).toMatchObject({ action: 'CaseCreated', episodeNumber: 1 });
  });

  it('binds the case to the resolved contact through the Customer lookup', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord());
    const [row] = h.crm.rows(CASES);
    expect(row!['_qdb_customerid_contact_value']).toBe(h.contactId);
    expect(row!['qdb_customerbusinessid']).toBe('28912345678');
  });

  it('identifies the facility by its MIS identity on the case itself', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord());
    const [row] = h.crm.rows(CASES);
    expect(row).toMatchObject({ qdb_facilitynumber: '123456789', qdb_facilitysourcesystem: 'HL', qdb_episodenumber: 1 });
    expect(row!['qdb_casenumber']).toBe('HL-123456789-E1');
  });

  it('never asks the organisation for a facility record — no Facility Limit, no Customer Product', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord());
    expect([...h.crm.touchedEntitySets].sort()).toEqual(['contacts', CASES, SNAPSHOTS].sort());
  });

  it('processes an HL facility when no Customer Product record exists anywhere', async () => {
    const h = buildHarness();
    expect(h.crm.tables.has('qdb_customerproducts')).toBe(false);
    expect((await h.service.processRecord(delinquentRecord())).action).toBe('CaseCreated');
  });

  it('processes a BFD facility without a Facility Limit relationship', async () => {
    const h = buildHarness({ configuration: { ...housingLoanConfiguration, organizationCode: 'BFD', customerEntity: 'accounts' } });
    h.crm.seed('accounts', 'accountid', { governmentid: '28912345678', employeeid: 'C-1001', name: 'Test SME' });
    const outcome = await h.service.processRecord(delinquentRecord({ sourceSystem: 'BFD', facilityNumber: '987654321' }));
    expect(outcome.action).toBe('CaseCreated');
    expect(h.crm.rows(CASES)[0]!['_qdb_customerid_account_value']).toBeDefined();
    expect(h.crm.tables.has('qdb_facilitylimits')).toBe(false);
  });

  it('caches the MIS position on the case, stamped with the as-of date and the sync time', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord());
    const [row] = h.crm.rows(CASES);
    expect(row).toMatchObject({ qdb_currentdpd: 45, qdb_currenttotalarrears: 12_500, qdb_misasofdate: '2026-06-30', qdb_lastmissyncon: h.now.value });
  });

  it('records the ruleset version that judged the facility eligible', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord());
    expect(h.crm.rows(CASES)[0]!['qdb_eligibilityrulesetversion']).toBe('test-evaluator');
  });

  it('writes a snapshot linked to the new case', async () => {
    const h = buildHarness();
    const outcome = await h.service.processRecord(delinquentRecord());
    expect(outcome.snapshot).toEqual({ key: 'HL|123456789|2026-06-30', written: true });
    expect(h.crm.rows(SNAPSHOTS)[0]!['_qdb_collectioncaseid_value']).toBe(outcome.caseId);
  });
});

describe('one active case per facility per episode', () => {
  it('updates the same episode on the next observation rather than opening another case', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord());
    const second = await h.service.processRecord(delinquentRecord({ misAsOfDate: '2026-07-31', integrationBatchId: 'BATCH-2026-07-31' }));
    expect(second.action).toBe('CaseUpdated');
    expect(h.crm.rows(CASES)).toHaveLength(1);
  });

  it('opens a case per facility for a customer with several facilities', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord({ facilityNumber: '111' }));
    await h.service.processRecord(delinquentRecord({ facilityNumber: '222' }));
    expect(h.crm.rows(CASES).map(r => r['qdb_facilitynumber']).sort()).toEqual(['111', '222']);
  });

  it('treats the same facility number in two source systems as two facilities', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord({ sourceSystem: 'HL' }));
    await h.service.processRecord(delinquentRecord({ sourceSystem: 'BFD' }));
    expect(h.crm.rows(CASES)).toHaveLength(2);
  });

  it('reports the invariant breached rather than choosing between two active cases', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord());
    h.crm.seed(CASES, 'qdb_collectioncaseid', { qdb_facilitynumber: '123456789', qdb_facilitysourcesystem: 'HL', statecode: 0, statuscode: CASE_STATUS_CODES.New, qdb_episodenumber: 9 });
    const outcome = await h.service.processRecord(delinquentRecord());
    expect(outcome).toMatchObject({ action: 'Failed', detail: expect.stringContaining('Invariant breached') });
  });
});

describe('replay idempotency', () => {
  it('does not write a second snapshot for the same observation', async () => {
    const h = buildHarness();
    const first = await h.service.processRecord(delinquentRecord());
    const replay = await h.service.processRecord(delinquentRecord({ integrationBatchId: 'BATCH-RERUN' }));
    expect(first.snapshot?.written).toBe(true);
    expect(replay.snapshot).toEqual({ key: first.snapshot!.key, written: false });
    expect(h.crm.rows(SNAPSHOTS)).toHaveLength(1);
  });

  it('writes a new snapshot when the position moved', async () => {
    const h = buildHarness();
    await h.service.processRecord(delinquentRecord());
    const moved = await h.service.processRecord(delinquentRecord({ dpd: 75, arrearBucket: '61-90', misAsOfDate: '2026-07-31' }));
    expect(moved.snapshot?.written).toBe(true);
    expect(h.crm.rows(SNAPSHOTS)).toHaveLength(2);
  });
});

describe('cure, closure and re-delinquency', () => {
  async function openAndCure() {
    const h = buildHarness();
    const created = await h.service.processRecord(delinquentRecord());
    h.now.value = '2026-07-10T02:00:00.000Z';
    const cured = await h.service.processRecord(delinquentRecord({ dpd: 0, totalArrears: 0, misAsOfDate: '2026-07-10' }));
    return { h, created, cured };
  }

  it('records the cure: Settled, cure date, resolution Cured', async () => {
    const { h, created, cured } = await openAndCure();
    expect(cured).toMatchObject({ action: 'CureRecorded', caseId: created.caseId });
    const [row] = h.crm.rows(CASES);
    expect(row).toMatchObject({ statuscode: CASE_STATUS_CODES.Settled, qdb_curedate: '2026-07-10T02:00:00.000Z' });
  });

  it('opens a new episode after the cured case is closed — re-delinquency normally starts anew', async () => {
    const { h, created } = await openAndCure();
    await h.cases.transition(created.caseId!, 'Closed');
    await h.cases.markClosed(created.caseId!, '2026-07-15T00:00:00.000Z');
    h.now.value = '2026-09-01T02:00:00.000Z';
    const again = await h.service.processRecord(delinquentRecord({ misAsOfDate: '2026-08-31' }));
    expect(again).toMatchObject({ action: 'CaseCreated', episodeNumber: 2 });
    expect(h.crm.rows(CASES)).toHaveLength(2);
    expect(h.crm.rows(CASES).find(r => r['qdb_episodenumber'] === 2)!['qdb_casenumber']).toBe('HL-123456789-E2');
  });

  it('reopens the closed episode inside a configured reopen window', async () => {
    const h = buildHarness({ episodePolicy: { reopenWindowDays: 30 } });
    const created = await h.service.processRecord(delinquentRecord());
    await h.service.processRecord(delinquentRecord({ dpd: 0, totalArrears: 0, misAsOfDate: '2026-07-10' }));
    await h.cases.transition(created.caseId!, 'Closed');
    await h.cases.markClosed(created.caseId!, '2026-07-15T00:00:00.000Z');
    h.now.value = '2026-07-20T02:00:00.000Z';
    const again = await h.service.processRecord(delinquentRecord({ misAsOfDate: '2026-07-19' }));
    expect(again).toMatchObject({ action: 'CaseReopened', caseId: created.caseId, episodeNumber: 1 });
    expect(h.crm.rows(CASES)).toHaveLength(1);
    expect(h.crm.rows(CASES)[0]!['statuscode']).toBe(CASE_STATUS_CODES.Reopened);
  });

  it('ignores a non-delinquent facility with no open case', async () => {
    const h = buildHarness();
    const outcome = await h.service.processRecord(delinquentRecord({ dpd: 0, totalArrears: 0 }));
    expect(outcome.action).toBe('Ignored');
    expect(h.crm.rows(CASES)).toHaveLength(0);
  });
});

describe('customer resolution outcomes', () => {
  it('records an identity exception for an unknown customer and opens no case', async () => {
    const h = buildHarness({ seedCustomer: false });
    const outcome = await h.service.processRecord(delinquentRecord());
    expect(outcome.action).toBe('IdentityException');
    expect(h.crm.rows(CASES)).toHaveLength(0);
    expect(h.crm.rows(EXCEPTIONS)[0]).toMatchObject({ qdb_customerbusinessid: '28912345678', qdb_facilitynumber: '123456789', qdb_source: 'HL', qdb_exceptionreason: 100000300 });
  });

  it('still persists the observation on its source identity, without a case link', async () => {
    const h = buildHarness({ seedCustomer: false });
    await h.service.processRecord(delinquentRecord());
    const [snapshot] = h.crm.rows(SNAPSHOTS);
    expect(snapshot).toMatchObject({ qdb_customerbusinessid: '28912345678', qdb_facilitynumber: '123456789', qdb_eligibilityoutcome: 100000264 });
    expect(snapshot!['_qdb_collectioncaseid_value']).toBeUndefined();
  });

  it('records a duplicate-customer exception rather than choosing a record', async () => {
    const h = buildHarness();
    h.crm.seed('contacts', 'contactid', { governmentid: '28912345678', fullname: 'Same QID Twice' });
    const outcome = await h.service.processRecord(delinquentRecord());
    expect(outcome.action).toBe('IdentityException');
    expect(h.crm.rows(EXCEPTIONS)[0]!['qdb_exceptionreason']).toBe(100000302);
  });

  it('records an identifier mismatch when the customer number contradicts the national id', async () => {
    const h = buildHarness();
    h.crm.seed('contacts', 'contactid', { governmentid: '00000000000', employeeid: 'C-2002', fullname: 'Other Person' });
    const outcome = await h.service.processRecord(delinquentRecord({ customer: { nationalId: '28912345678', customerNumber: 'C-2002' } }));
    expect(outcome).toMatchObject({ action: 'IdentityException', detail: expect.stringContaining('IdentifierMismatch') });
  });

  it('never resolves on a mobile number', async () => {
    const h = buildHarness({ seedCustomer: false });
    h.crm.seed('contacts', 'contactid', { mobilephone: '55512345', fullname: 'Mobile Only' });
    const outcome = await h.service.processRecord(delinquentRecord({ customer: {}, mobileNumber: '55512345' }));
    expect(outcome).toMatchObject({ action: 'IdentityException', detail: expect.stringContaining('NoIdentifier') });
  });
});

describe('facility identity from MIS', () => {
  it('raises a facility exception for a missing facility number before any customer lookup', async () => {
    const h = buildHarness();
    const outcome = await h.service.processRecord(delinquentRecord({ facilityNumber: '' }));
    expect(outcome).toMatchObject({ action: 'FacilityException', detail: expect.stringContaining('MissingFacilityNumber') });
    expect(h.crm.touchedEntitySets.has('contacts')).toBe(false);
    expect(h.crm.rows(EXCEPTIONS)[0]!['qdb_exceptionreason']).toBe(100000304);
  });

  it('raises a facility exception for a malformed facility number', async () => {
    const h = buildHarness();
    const outcome = await h.service.processRecord(delinquentRecord({ facilityNumber: '12 34' }));
    expect(outcome).toMatchObject({ action: 'FacilityException', detail: expect.stringContaining('Malformed') });
  });

  it('does not raise a facility exception merely because no CRM facility record exists', async () => {
    const h = buildHarness();
    expect((await h.service.processRecord(delinquentRecord())).action).toBe('CaseCreated');
  });
});

describe('eligibility outcomes that create no case', () => {
  it('keeps a GraceMonitor observation as a snapshot without a case', async () => {
    const h = buildHarness({ decide: () => 'GraceMonitor' });
    const outcome = await h.service.processRecord(delinquentRecord());
    expect(outcome.action).toBe('GraceMonitored');
    expect(h.crm.rows(CASES)).toHaveLength(0);
    expect(h.crm.rows(SNAPSHOTS)[0]!['qdb_eligibilityoutcome']).toBe(100000262);
  });

  it('respects an EligibleOnly snapshot policy: a GraceMonitor decision leaves no snapshot', async () => {
    const h = buildHarness({ decide: () => 'GraceMonitor', configuration: { ...housingLoanConfiguration, snapshotPolicy: 'EligibleOnly' } });
    const outcome = await h.service.processRecord(delinquentRecord());
    expect(outcome.snapshot).toBeUndefined();
    expect(h.crm.rows(SNAPSHOTS)).toHaveLength(0);
  });

  it('hands the ruleset the open case as a criterion', async () => {
    const seen: unknown[] = [];
    const h = buildHarness({ decide: (input) => { seen.push(input.activeCase); return 'EligibleCreateCase'; } });
    await h.service.processRecord(delinquentRecord());
    await h.service.processRecord(delinquentRecord({ misAsOfDate: '2026-07-31' }));
    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toMatchObject({ status: 'New', episodeNumber: 1 });
  });
});

describe('failing closed', () => {
  it('refuses to start without a snapshot policy', () => {
    const h = buildHarness();
    expect(() => new DelinquencySyncService({
      configuration: { ...housingLoanConfiguration, snapshotPolicy: undefined },
      customers: { resolve: async () => { throw new Error('unused'); } },
      eligibility: { evaluate: async () => { throw new Error('unused'); } },
      cases: h.cases, snapshots: h.snapshots, exceptions: { create: async () => 'x' } as never,
      logger: new MemoryLogger(), episodePolicy: {}, now: () => 'now',
    })).toThrow(CollectionSettingsError);
  });

  it('refuses to start without an eligibility ruleset', () => {
    const h = buildHarness();
    expect(() => new DelinquencySyncService({
      configuration: { ...housingLoanConfiguration, eligibilityRulesetCode: undefined },
      customers: { resolve: async () => { throw new Error('unused'); } },
      eligibility: { evaluate: async () => { throw new Error('unused'); } },
      cases: h.cases, snapshots: h.snapshots, exceptions: { create: async () => 'x' } as never,
      logger: new MemoryLogger(), episodePolicy: {}, now: () => 'now',
    })).toThrow(CollectionSettingsError);
  });

  it('isolates a failing record so the batch continues', async () => {
    const h = buildHarness();
    h.crm.failCreateWhen = (entity, values) => entity === CASES && values['qdb_facilitynumber'] === '222';
    const batch = await h.service.processBatch([
      delinquentRecord({ facilityNumber: '111' }), delinquentRecord({ facilityNumber: '222' }), delinquentRecord({ facilityNumber: '333' }),
    ], 'BATCH-X');
    expect(batch.counts).toEqual({ CaseCreated: 2, Failed: 1 });
    expect(h.logger.entries.some(e => e.severity === 'Error' && e.sourceReference === 'HL/222')).toBe(true);
  });
});

describe('the fake organisation itself', () => {
  it('refuses a filter shape the repositories were not written against', async () => {
    const crm = new FakeCrmAdapter();
    await expect(crm.retrieveMultiple('contacts', { select: ['x'], filter: "startswith(name,'a')" })).rejects.toThrow(/cannot evaluate/);
  });
});
