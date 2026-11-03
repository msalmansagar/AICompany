import { describe, it, expect } from 'vitest';
import { externalProcessOf, isConcernTypeCode, isHandOffTo, readExternalReference } from './externalProcessReference.js';

describe('externalProcessOf', () => {
  it('externalProcessOf_incident_isComplaint', () => { expect(externalProcessOf('incident')).toBe('Complaint'); });
  it('externalProcessOf_legalTable_isLegal', () => { expect(externalProcessOf('qdb_qdblegal')).toBe('Legal'); });
  it('externalProcessOf_fax_isNoProcess', () => { expect(externalProcessOf('fax')).toBeUndefined(); });
});

describe('readExternalReference', () => {
  it('readExternalReference_completeColumns_returnsReference', () => {
    expect(readExternalReference({ recordType: 'incident', recordId: 'id-1', organization: 'BFD', recordNumber: 'BFD-1' }))
      .toEqual({ process: 'Complaint', organization: 'BFD', recordId: 'id-1', recordNumber: 'BFD-1' });
  });

  it('readExternalReference_requestedButNotCreated_returnsNothing', () => {
    expect(readExternalReference({ recordType: 'incident', organization: 'BFD' })).toBeUndefined();
  });

  it('readExternalReference_noOrganization_returnsNothing', () => {
    expect(readExternalReference({ recordType: 'qdb_qdblegal', recordId: 'id-2' })).toBeUndefined();
  });
});

describe('isHandOffTo', () => {
  it('isHandOffTo_requestedComplaintWithoutRecord_isStillAComplaintHandOff', () => {
    expect(isHandOffTo('Complaint', { recordType: 'incident' })).toBe(true);
  });
});

describe('isConcernTypeCode', () => {
  it('isConcernTypeCode_dashDispute_matches', () => { expect(isConcernTypeCode('P6-DISPUTE')).toBe(true); });
  it('isConcernTypeCode_displayName_doesNotMatch', () => { expect(isConcernTypeCode('Complaint / Dispute')).toBe(false); });
});
