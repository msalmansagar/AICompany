import { describe, it, expect } from 'vitest';
import { complaintIdFor } from '../services/caseManagement/complaintIdentity.js';

const KEY = { collectionCaseId: '11111111-1111-4111-8111-111111111111', requestId: '99999999-9999-4999-8999-999999999999', userId: 'user-a' };

describe('complaintIdFor', () => {
  it('complaintIdFor_sameSubmission_returnsSameId', () => {
    expect(complaintIdFor(KEY)).toBe(complaintIdFor({ ...KEY }));
  });

  it('complaintIdFor_anyKey_returnsVersion5Uuid', () => {
    expect(complaintIdFor(KEY)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('complaintIdFor_differentUser_returnsDifferentId', () => {
    expect(complaintIdFor({ ...KEY, userId: 'user-b' })).not.toBe(complaintIdFor(KEY));
  });

  it('complaintIdFor_differentCollectionCase_returnsDifferentId', () => {
    expect(complaintIdFor({ ...KEY, collectionCaseId: '22222222-2222-4222-8222-222222222222' })).not.toBe(complaintIdFor(KEY));
  });

  it('complaintIdFor_idCasing_doesNotChangeTheId', () => {
    expect(complaintIdFor({ ...KEY, requestId: KEY.requestId.toUpperCase() })).toBe(complaintIdFor(KEY));
  });
});
