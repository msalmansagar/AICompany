import { describe, expect, it } from 'vitest';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  CustomerListRefusedError, createCustomerListQuery, customerListFetchXml, shapeCustomerRows, sortCustomerRows,
} from '../data/customerListQuery.js';

/**
 * Customers with arrears: one aggregate over open cases, grouped by customer, merged across CRMs.
 * The platform counts and sums; this module only asks, merges and pages.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';

const HL_GROUP = { cases: 2, arrears: 41250, exposure: 900000, dpd: 74, customer: '28912345678', customerref: 'cust-1', [`customerref${FORMATTED}`]: 'Aisha Al-Mansouri', org: 100000140 };
const BFD_GROUP = { cases: 1, arrears: 5000, exposure: 120000, dpd: 12, customer: '28912345678', customerref: 'acct-1', [`customerref${FORMATTED}`]: 'Aisha Al-Mansouri', org: 100000141 };
const OTHER = { cases: 1, arrears: 99000, exposure: 500000, dpd: 120, customer: '27700000001', customerref: 'cust-2', [`customerref${FORMATTED}`]: 'Bilal Haddad', org: 100000140 };

function adapterAnswering(rows: Record<string, unknown>[] | null): XrmCrmAdapter & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async aggregate(_entitySet: string, fetchXml: string) { asked.push(fetchXml); return rows; },
  } as unknown as XrmCrmAdapter & { asked: string[] };
}

describe('the question', () => {
  it('asks only for open cases, grouped by customer, with the platform counting and summing', () => {
    const fetchXml = customerListFetchXml({});

    expect([
      fetchXml.includes('<condition attribute="statecode" operator="eq" value="0"/>'),
      fetchXml.includes('<attribute name="qdb_customerbusinessid" alias="customer" groupby="true"/>'),
      fetchXml.includes('<attribute name="qdb_collectioncaseid" alias="cases" aggregate="count"/>'),
      fetchXml.includes('<attribute name="qdb_currenttotalarrears" alias="arrears" aggregate="sum"/>'),
      fetchXml.includes('<attribute name="qdb_currentdpd" alias="dpd" aggregate="max"/>'),
    ]).toEqual([true, true, true, true, true]);
  });

  it('narrows to the CRM in scope, exactly as the case list does', () => {
    expect(customerListFetchXml({ scopeFilter: 'qdb_organizationcode eq 100000140' }))
      .toContain('<condition attribute="qdb_organizationcode" operator="eq" value="100000140"/>');
  });

  it('sends a search to the source over identifiers and the customer name, joining the name tables', () => {
    const fetchXml = customerListFetchXml({ search: 'Aisha' });

    expect([
      fetchXml.includes('<link-entity name="contact"'),
      fetchXml.includes('<condition entityname="customercontact" attribute="fullname" operator="like" value="%Aisha%"/>'),
      fetchXml.includes('<condition attribute="qdb_customerbusinessid" operator="like" value="%Aisha%"/>'),
    ]).toEqual([true, true, true]);
  });
});

describe('the rows', () => {
  it('shows a customer with cases in both CRMs once, adding the counts and sums and keeping the worst DPD', () => {
    const [aisha] = shapeCustomerRows([HL_GROUP, BFD_GROUP]);

    expect(aisha).toEqual({
      customerBusinessId: '28912345678', customerName: 'Aisha Al-Mansouri', customerId: 'cust-1',
      organizations: ['HL', 'BFD'], caseCount: 3, totalArrears: 46250, totalExposure: 1020000, worstDpd: 74,
    });
  });

  it('ignores a grouped row that names no customer, rather than listing a blank one', () => {
    expect(shapeCustomerRows([{ arrears: 1500 }, OTHER]).map(row => row.customerBusinessId)).toEqual(['27700000001']);
  });

  it('leaves a total absent, never zero, when the platform summed nothing', () => {
    const [row] = shapeCustomerRows([{ cases: 1, customer: '1', org: 100000140 }]);

    expect(['totalArrears' in row!, 'worstDpd' in row!]).toEqual([false, false]);
  });

  it('sorts most overdue first by default, and by name when asked', () => {
    const rows = shapeCustomerRows([HL_GROUP, BFD_GROUP, OTHER]);

    expect([
      sortCustomerRows(rows).map(row => row.customerBusinessId),
      sortCustomerRows(rows, 'name').map(row => row.customerName),
    ]).toEqual([['27700000001', '28912345678'], ['Aisha Al-Mansouri', 'Bilal Haddad']]);
  });
});

describe('paging the answer', () => {
  it('asks the platform once per question and pages the merged answer in memory', async () => {
    const adapter = adapterAnswering([HL_GROUP, BFD_GROUP, OTHER]);
    const fetchPage = createCustomerListQuery(adapter);

    const first = await fetchPage({ pageSize: 1 });
    const second = await fetchPage({ pageSize: 1, continuation: first.continuation! });

    expect([
      adapter.asked.length, first.items.map(row => row.customerBusinessId), first.hasMore, first.totalCount,
      second.items.map(row => row.customerBusinessId), second.hasMore,
    ]).toEqual([1, ['27700000001'], true, 2, ['28912345678'], false]);
  });

  it('asks again when the question changes', async () => {
    const adapter = adapterAnswering([OTHER]);
    const fetchPage = createCustomerListQuery(adapter);

    await fetchPage({ pageSize: 50 });
    await fetchPage({ pageSize: 50, search: 'Bilal' });

    expect(adapter.asked).toHaveLength(2);
  });

  it('refuses rather than listing nobody when the platform refuses the aggregate', async () => {
    const fetchPage = createCustomerListQuery(adapterAnswering(null));

    await expect(fetchPage({ pageSize: 50 })).rejects.toBeInstanceOf(CustomerListRefusedError);
  });
});
