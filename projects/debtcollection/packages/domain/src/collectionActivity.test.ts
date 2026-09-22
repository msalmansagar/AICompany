import { describe, expect, it } from 'vitest';
import { CollectionActivitySchema, isPromiseToPay, openPromiseToPay } from './collectionActivity.js';

const caseId = '33333333-3333-4333-8333-333333333333';

describe('promise to pay as an activity', () => {
  it('opens with the activity Open and the promise Active', () => {
    const ptp = openPromiseToPay({ caseId, activityTypeCode: 'PTP', activityDate: '2026-07-01', ptpDate: '2026-07-15', promisedAmount: 5000 });
    expect(ptp.status).toBe('Open');
    expect(ptp.promise?.status).toBe('Active');
    expect(isPromiseToPay(ptp)).toBe(true);
  });

  it('is not a promise when it carries no promise facts', () => {
    const call = CollectionActivitySchema.parse({ caseId, activityTypeCode: 'CALL', activityDate: '2026-07-01', status: 'Open' });
    expect(isPromiseToPay(call)).toBe(false);
  });

  it('refuses a promise without an amount', () => {
    expect(() => CollectionActivitySchema.parse({
      caseId, activityTypeCode: 'PTP', activityDate: '2026-07-01', status: 'Open',
      promise: { ptpDate: '2026-07-15', promisedAmount: 0, status: 'Active' },
    })).toThrow();
  });
});

describe('communication correlation without duplicated storage', () => {
  it('can point at a native communication record', () => {
    const activity = CollectionActivitySchema.parse({
      caseId, activityTypeCode: 'SMS_SENT', activityDate: '2026-07-01', status: 'Completed',
      relatedRecord: { entity: 'fax', id: '55555555-5555-4555-8555-555555555555' },
    });
    expect(activity.relatedRecord).toEqual({ entity: 'fax', id: '55555555-5555-4555-8555-555555555555' });
  });

  it('carries no message body, channel or recipient — those live on the native record', () => {
    const keys = Object.keys(CollectionActivitySchema.shape);
    for (const forbidden of ['body', 'messageBody', 'channel', 'recipient', 'sender', 'deliveryStatus']) {
      expect(keys, `activity must not carry '${forbidden}'`).not.toContain(forbidden);
    }
  });
});
