import { describe, expect, it } from 'vitest';
import { loadOpenArrears, myDayCountRequests, openArrearsFetchXml } from '../data/myDayOversight.js';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';

/**
 * My Day's oversight figures are questions the platform answers; what is asserted is the exact
 * question — scope on the case, scope through the case for activities, stated windows — and that
 * a refused sum is unknown rather than zero.
 */

const NOW = new Date('2026-09-26T09:30:00.000Z');
const HL = 'qdb_organizationcode eq 100000140';
const byKey = (scopeFilter?: string, userId?: string) =>
  Object.fromEntries(myDayCountRequests({ scopeFilter, userId, now: NOW, promiseHorizonDays: 7 }).map(r => [r.key, r]));

describe('My Day count requests', () => {
  it('counts open cases on the case, in scope', () => {
    expect(byKey(HL)['open']).toEqual({ key: 'open', entitySet: 'qdb_collectioncases', filter: `${HL} and statecode eq 0` });
  });

  it('scopes every activity count through the case, never on the activity (KI-147)', () => {
    const activityRequests = Object.values(byKey(HL, 'u-1')).filter(r => r.entitySet === 'qdb_collectionactivities');
    expect(activityRequests.length).toBe(5);
    expect(activityRequests.every(r => r.filter!.startsWith('qdb_collectioncaseid_qdb_collectionactivity/qdb_organizationcode eq 100000140 and '))).toBe(true);
    expect(activityRequests.some(r => / and qdb_organizationcode eq/.test(r.filter!))).toBe(false);
  });

  it('defines overdue and upcoming by the follow-up date against now, on open activities only', () => {
    expect(byKey()['followUpsOverdue']!.filter).toBe('qdb_followupdate ne null and statecode eq 0 and qdb_followupdate lt 2026-09-26T09:30:00.000Z');
    expect(byKey()['followUpsUpcoming']!.filter).toBe('qdb_followupdate ne null and statecode eq 0 and qdb_followupdate ge 2026-09-26T09:30:00.000Z');
  });

  it('defines a promise due as Active with a promised date inside the stated window, from the start of today', () => {
    expect(byKey()['promisesDue']!.filter).toBe('qdb_ptpdate ne null and qdb_ptpstatus eq 100000080 and qdb_ptpdate ge 2026-09-26T00:00:00.000Z and qdb_ptpdate lt 2026-10-03T00:00:00.000Z');
  });

  it('asks for the signed-in user\'s open work only when the user is known', () => {
    expect(byKey(undefined, 'u-1')['myOpenWork']!.filter).toBe('statecode eq 0 and _ownerid_value eq u-1');
    expect(byKey()['myOpenWork']).toBeUndefined();
  });

  it('counts identity exceptions across both CRMs, because the exception carries no organisation', () => {
    expect(byKey(HL)['identityExceptions']).toEqual({ key: 'identityExceptions', entitySet: 'qdb_identityexceptions', filter: 'statecode eq 0' });
  });
});

describe('the current-arrears sum', () => {
  it('is one aggregate over open cases in scope, no rows read', () => {
    expect(openArrearsFetchXml(HL)).toBe('<fetch aggregate="true"><entity name="qdb_collectioncase"><attribute name="qdb_currenttotalarrears" alias="arrears" aggregate="sum"/><filter><condition attribute="statecode" operator="eq" value="0"/><condition attribute="qdb_organizationcode" operator="eq" value="100000140"/></filter></entity></fetch>');
    expect(openArrearsFetchXml(undefined)).not.toContain('qdb_organizationcode');
  });

  it('refuses a scope it cannot render rather than silently widening the sum', () => {
    expect(() => openArrearsFetchXml("qdb_casenumber eq 'x'")).toThrow(/scope filter/);
  });

  it('reads the platform\'s sum, and is unknown — never zero — when the platform refuses', async () => {
    const answering = { aggregate: async () => [{ arrears: 213_281_419.61 }] } as unknown as XrmCrmAdapter;
    const refusing = { aggregate: async () => null } as unknown as XrmCrmAdapter;
    const empty = { aggregate: async () => [{}] } as unknown as XrmCrmAdapter;

    expect([await loadOpenArrears(answering, HL), await loadOpenArrears(refusing, HL), await loadOpenArrears(empty, HL)]).toEqual([213_281_419.61, null, 0]);
  });
});
