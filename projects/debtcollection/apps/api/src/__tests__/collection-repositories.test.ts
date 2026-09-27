import { describe, expect, it } from 'vitest';
import { PlatformConfigurationError, openPromiseToPay, PTP_STATUS_CODES, ACTIVITY_STATUS_CODES } from '@dcp/domain';
import { CollectionActivityRepository, CollectionCaseRepository, CustomerResolutionService, DelinquencySnapshotRepository } from '../services/collection/index.js';
import { FakeCrmAdapter } from './helpers/FakeCrmAdapter.js';
import { housingLoanConfiguration } from './helpers/collectionFixtures.js';

const facility = { facilityNumber: '123456789', sourceSystem: 'HL' };
const caseId = '33333333-3333-4333-8333-333333333333';

describe('CustomerResolutionService', () => {
  it('looks the national id up on the configured column of the configured master', async () => {
    const crm = new FakeCrmAdapter();
    const id = crm.seed('contacts', 'contactid', { governmentid: '28912345678', fullname: 'Test' });
    const service = new CustomerResolutionService(crm, housingLoanConfiguration);
    const resolution = await service.resolve({ nationalId: '28912345678' }, {});
    expect(resolution).toMatchObject({ kind: 'Resolved', customer: { entity: 'contact', id, businessId: '28912345678', displayName: 'Test' } });
  });

  it('serves a BFD deployment from account with no code change', async () => {
    const crm = new FakeCrmAdapter();
    const id = crm.seed('accounts', 'accountid', { governmentid: 'CR-77', name: 'Test SME' });
    const service = new CustomerResolutionService(crm, { ...housingLoanConfiguration, organizationCode: 'BFD', customerEntity: 'accounts' });
    expect(await service.resolve({ nationalId: 'CR-77' }, {})).toMatchObject({ kind: 'Resolved', customer: { entity: 'account', id } });
  });

  it('refuses a customer master that is not a Dynamics customer entity', () => {
    expect(() => new CustomerResolutionService(new FakeCrmAdapter(), { ...housingLoanConfiguration, customerEntity: 'qdb_somemaster' }))
      .toThrow(PlatformConfigurationError);
  });

  it('skips the cross-check when the deployment maps no customer number', async () => {
    const crm = new FakeCrmAdapter();
    crm.seed('contacts', 'contactid', { governmentid: '28912345678' });
    const service = new CustomerResolutionService(crm, { ...housingLoanConfiguration, mappings: [] });
    expect(await service.resolve({ nationalId: '28912345678', customerNumber: 'ANY' }, {})).toMatchObject({ kind: 'Resolved' });
  });
});

describe('CollectionCaseRepository', () => {
  it('reports the invariant breached rather than returning one of two active cases', async () => {
    const crm = new FakeCrmAdapter();
    for (let i = 0; i < 2; i++) crm.seed('qdb_collectioncases', 'qdb_collectioncaseid', { qdb_facilitynumber: '123456789', qdb_facilitysourcesystem: 'HL', statecode: 0, statuscode: 100000600, qdb_episodenumber: i + 1 });
    await expect(new CollectionCaseRepository(crm).findActiveByFacility(facility)).rejects.toThrow(/Invariant breached/);
  });

  it('returns the latest closed episode', async () => {
    const crm = new FakeCrmAdapter();
    for (const episode of [1, 3, 2]) crm.seed('qdb_collectioncases', 'qdb_collectioncaseid', { qdb_facilitynumber: '123456789', qdb_facilitysourcesystem: 'HL', statecode: 1, statuscode: 100000614, qdb_episodenumber: episode });
    const latest = await new CollectionCaseRepository(crm).findLatestClosedByFacility(facility);
    expect(latest?.episodeNumber).toBe(3);
  });

  it('writes a terminal status with statecode 1 and a working status with statecode 0', async () => {
    const crm = new FakeCrmAdapter();
    const id = crm.seed('qdb_collectioncases', 'qdb_collectioncaseid', { statecode: 0 });
    const repo = new CollectionCaseRepository(crm);
    await repo.transition(id, 'Closed');
    expect(crm.rows('qdb_collectioncases')[0]).toMatchObject({ statecode: 1, statuscode: 100000614 });
    await repo.transition(id, 'Reopened');
    expect(crm.rows('qdb_collectioncases')[0]).toMatchObject({ statecode: 0, statuscode: 100000616 });
  });

  it('leaves an unmapped MIS bucket unset instead of inventing a value', async () => {
    const crm = new FakeCrmAdapter();
    const id = crm.seed('qdb_collectioncases', 'qdb_collectioncaseid', { statecode: 0 });
    await new CollectionCaseRepository(crm).updateCachedPosition(id, { dpd: 10, arrearBucket: 'NOT-A-BUCKET', loanBalance: 1, totalArrears: 1, misAsOfDate: '2026-06-30', syncedOn: 'now' });
    expect(crm.rows('qdb_collectioncases')[0]!['qdb_currentarrearbucket']).toBeUndefined();
  });
});

describe('CollectionActivityRepository — promise to pay', () => {
  it('resolves the activity type by code, never by a compiled GUID', async () => {
    const crm = new FakeCrmAdapter();
    const typeId = crm.seed('qdb_collectionactivitytypes', 'qdb_collectionactivitytypeid', { qdb_code: 'PTP', qdb_name: 'Promise to Pay' });
    expect(await new CollectionActivityRepository(crm).findActivityTypeId('PTP')).toBe(typeId);
    expect(await new CollectionActivityRepository(crm).findActivityTypeId('NOPE')).toBeNull();
  });

  it('creates a promise with its facts and both case links, then moves and completes it', async () => {
    const crm = new FakeCrmAdapter();
    const typeId = crm.seed('qdb_collectionactivitytypes', 'qdb_collectionactivitytypeid', { qdb_code: 'PTP' });
    const repo = new CollectionActivityRepository(crm);
    const ptp = openPromiseToPay({ caseId, activityTypeCode: 'PTP', activityDate: '2026-07-01', ptpDate: '2026-07-15', promisedAmount: 5000, promiseType: 'Full' });
    const id = await repo.create(ptp, typeId, 'HL-123456789-E1-A1');
    const row = crm.rows('qdb_collectionactivities')[0]!;
    expect(row).toMatchObject({ qdb_ptpdate: '2026-07-15', qdb_promisedamount: 5000, qdb_ptpstatus: PTP_STATUS_CODES.Active, qdb_promisetype: 100000580 });
    expect(row['_qdb_collectioncaseid_qdb_collectionactivity_value']).toBe(caseId);
    expect(row['_regardingobjectid_qdb_collectioncase_qdb_collectionactivity_value']).toBe(caseId);

    await repo.updatePromiseStatus(id, 'Kept');
    await repo.complete(id);
    expect(crm.rows('qdb_collectionactivities')[0]).toMatchObject({ qdb_ptpstatus: PTP_STATUS_CODES.Kept, statecode: 1, statuscode: ACTIVITY_STATUS_CODES.Completed });
  });

  it('carries a native-record correlation without copying the communication', async () => {
    const crm = new FakeCrmAdapter();
    const typeId = crm.seed('qdb_collectionactivitytypes', 'qdb_collectionactivitytypeid', { qdb_code: 'SMS' });
    await new CollectionActivityRepository(crm).create({
      caseId, activityTypeCode: 'SMS', activityDate: '2026-07-01', status: 'Completed',
      relatedRecord: { entity: 'fax', id: '55555555-5555-4555-8555-555555555555' },
    }, typeId, 'HL-123456789-E1-A2');
    const row = crm.rows('qdb_collectionactivities')[0]!;
    expect(row).toMatchObject({ qdb_relatedrecordtype: 'fax', qdb_relatedrecordid: '55555555-5555-4555-8555-555555555555' });
    expect(Object.keys(row).some(k => /body|channel|recipient/i.test(k))).toBe(false);
  });
});

describe('DelinquencySnapshotRepository — source identity (KI-47)', () => {
  const snapshot = {
    customerBusinessId: '28912345678',
    facility: { facilityNumber: '123456789', sourceSystem: 'HL' },
    snapshotDate: '2026-06-30', receivedOn: '2026-07-01T02:00:00Z', integrationBatchId: 'B1',
    dpd: 45, loanBalance: 800_000, totalArrears: 12_500,
    eligibility: { outcome: 'GraceMonitor' as const, rulesetCode: 'R', rulesetVersion: '1', evaluatedOn: '2026-07-01T02:00:00Z' },
  };

  it('stores both halves of the facility identity as columns, not only inside the key', async () => {
    const crm = new FakeCrmAdapter();
    // A composition that deliberately omits the source system: the column must still be written.
    await new DelinquencySnapshotRepository(crm, ['facilityNumber', 'snapshotDate']).appendIfAbsent(snapshot);
    expect(crm.rows('qdb_delinquencysnapshots')[0]).toMatchObject({
      qdb_facilitynumber: '123456789', qdb_facilitysourcesystem: 'HL',
    });
  });

  it('does not require a case to append an observation', async () => {
    const crm = new FakeCrmAdapter();
    const result = await new DelinquencySnapshotRepository(crm, ['sourceSystem', 'facilityNumber', 'snapshotDate']).appendIfAbsent(snapshot);
    expect(result).toEqual({ key: 'HL|123456789|2026-06-30', written: true });
    expect(crm.rows('qdb_delinquencysnapshots')[0]!['_qdb_collectioncaseid_value']).toBeUndefined();
  });
});
