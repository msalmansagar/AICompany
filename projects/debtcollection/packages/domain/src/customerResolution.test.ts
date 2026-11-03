import { describe, expect, it } from 'vitest';
import { decideCustomerResolution, type CustomerLookupResult, type ResolvedCustomer } from './customerResolution.js';

const contact = (id: string, businessId = '28912345678'): ResolvedCustomer =>
  ({ entity: 'contact', id, businessId });

const A = contact('11111111-1111-4111-8111-111111111111');
const B = contact('22222222-2222-4222-8222-222222222222');

const lookup = (partial: Partial<CustomerLookupResult>): CustomerLookupResult => ({
  byNationalId: [], byCustomerNumber: [], customerNumberLookupAvailable: true, ...partial,
});

describe('resolution by national id (primary)', () => {
  it('resolves a single match', () => {
    const result = decideCustomerResolution({ nationalId: '28912345678' }, lookup({ byNationalId: [A] }));
    expect(result).toEqual({ kind: 'Resolved', customer: A, matchedOn: 'nationalId' });
  });

  it('fails as CustomerNotFound when nothing carries the id', () => {
    expect(decideCustomerResolution({ nationalId: '28912345678' }, lookup({})))
      .toMatchObject({ kind: 'Failed', failure: 'CustomerNotFound' });
  });

  it('fails as DuplicateCustomer when two records carry the id — never picks one', () => {
    expect(decideCustomerResolution({ nationalId: '28912345678' }, lookup({ byNationalId: [A, B] })))
      .toMatchObject({ kind: 'Failed', failure: 'DuplicateCustomer' });
  });
});

describe('customer-number cross-check', () => {
  it('passes when both identifiers point at the same record', () => {
    const result = decideCustomerResolution(
      { nationalId: '28912345678', customerNumber: 'C-1' },
      lookup({ byNationalId: [A], byCustomerNumber: [A] }),
    );
    expect(result).toMatchObject({ kind: 'Resolved', matchedOn: 'nationalId' });
  });

  it('fails as IdentifierMismatch when they point at different records', () => {
    const result = decideCustomerResolution(
      { nationalId: '28912345678', customerNumber: 'C-1' },
      lookup({ byNationalId: [A], byCustomerNumber: [B] }),
    );
    expect(result).toMatchObject({ kind: 'Failed', failure: 'IdentifierMismatch' });
  });

  it('does not contradict the national id when no record carries the customer number', () => {
    const result = decideCustomerResolution(
      { nationalId: '28912345678', customerNumber: 'C-1' },
      lookup({ byNationalId: [A], byCustomerNumber: [] }),
    );
    expect(result).toMatchObject({ kind: 'Resolved' });
  });

  it('skips the cross-check where the deployment has no customer-number mapping', () => {
    const result = decideCustomerResolution(
      { nationalId: '28912345678', customerNumber: 'C-1' },
      lookup({ byNationalId: [A], byCustomerNumber: [B], customerNumberLookupAvailable: false }),
    );
    expect(result).toMatchObject({ kind: 'Resolved' });
  });
});

describe('resolution by customer number (fallback)', () => {
  it('resolves on the customer number when no national id was supplied', () => {
    expect(decideCustomerResolution({ customerNumber: 'C-1' }, lookup({ byCustomerNumber: [A] })))
      .toEqual({ kind: 'Resolved', customer: A, matchedOn: 'customerNumber' });
  });

  it('cannot resolve on a customer number the deployment does not map', () => {
    expect(decideCustomerResolution({ customerNumber: 'C-1' }, lookup({ byCustomerNumber: [A], customerNumberLookupAvailable: false })))
      .toMatchObject({ kind: 'Failed', failure: 'CustomerNotFound' });
  });

  it('fails as DuplicateCustomer on an ambiguous customer number', () => {
    expect(decideCustomerResolution({ customerNumber: 'C-1' }, lookup({ byCustomerNumber: [A, B] })))
      .toMatchObject({ kind: 'Failed', failure: 'DuplicateCustomer' });
  });
});

describe('no identifier', () => {
  it('fails as NoIdentifier without looking anything up', () => {
    expect(decideCustomerResolution({}, lookup({ byNationalId: [A] })))
      .toMatchObject({ kind: 'Failed', failure: 'NoIdentifier' });
  });
});
