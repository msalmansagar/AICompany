import { describe, expect, it } from 'vitest';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  activityCategoryFilter, customerHistoryReads, loadHistoryCounts, nextCustomerHistoryPage, startCustomerHistory, supportedCategories,
  type CategoryTypes,
} from '../data/customerHistoryQueries.js';
import { describeFinancialUnit, financialUnitTerms, financialUnitsHeading } from '../data/financialUnit.js';

/**
 * A customer's collection history across their cases: three native tables, read server-side and
 * filtered to the customer's cases, merged newest first with a stable tie-break, paged through an
 * opaque continuation, every entry naming its case. And the words: a Housing Loan unit is a loan
 * account, a BFD unit is a facility.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const at = (iso: string) => iso;
const TYPES: CategoryTypes = { legal: ['t-legal'], deceased: ['t-deceased'], concern: ['t-dispute'] };
const ALL = (caseIds: string[]) => ({ caseIds, filter: 'all' as const, types: TYPES });

function fakeAdapter(rows: Record<string, Record<string, unknown>[]>, pageSize = 25) {
  const reads: { entitySet: string; filter: string; continuation?: string }[] = [];
  const adapter = {
    async retrievePage(entitySet: string, query: { filter: string; continuation?: string; sort: { field: string }[] }) {
      reads.push({ entitySet, filter: query.filter, ...(query.continuation ? { continuation: query.continuation } : {}) });
      const all = [...(rows[entitySet] ?? [])].sort((a, b) => String(b['createdon']).localeCompare(String(a['createdon'])));
      const offset = query.continuation ? Number(query.continuation) : 0;
      const items = all.slice(offset, offset + pageSize);
      const next = offset + pageSize < all.length ? String(offset + pageSize) : undefined;
      return { items, hasMore: next !== undefined, appliedPageSize: pageSize, ...(next ? { continuation: next } : {}) };
    },
  } as unknown as XrmCrmAdapter;
  return { adapter, reads };
}

const activity = (id: string, caseId: string, createdon: string, extra: Record<string, unknown> = {}) => ({
  activityid: id, subject: `Activity ${id}`, createdon, statuscode: 1, [`statuscode${FORMATTED}`]: 'Open',
  '_qdb_collectioncaseid_value': caseId, [`_qdb_activitytypeid_value${FORMATTED}`]: 'Call', [`_ownerid_value${FORMATTED}`]: 'Officer One', ...extra,
});
const fax = (id: string, caseId: string, createdon: string, whatsapp = false) => ({
  activityid: id, subject: `Message ${id}`, createdon, statuscode: 1, [`statuscode${FORMATTED}`]: 'Open', directioncode: true,
  '_regardingobjectid_value': caseId, ...(whatsapp ? { qdb_whatsapptemplate: 'reminder' } : {}),
});
const email = (id: string, caseId: string, createdon: string) => ({
  activityid: id, subject: `Email ${id}`, createdon, statuscode: 1, [`statuscode${FORMATTED}`]: 'Sent', directioncode: true, '_regardingobjectid_value': caseId,
});

describe('the reads', () => {
  it('filter each table to every case the customer holds, by the lookup read forms', () => {
    const reads = customerHistoryReads(['c-1', 'c-2'], 'all', TYPES);

    expect([reads.activity!.filter, reads.fax!.filter, reads.email!.filter]).toEqual([
      '(_qdb_collectioncaseid_value eq c-1 or _qdb_collectioncaseid_value eq c-2)',
      '(_regardingobjectid_value eq c-1 or _regardingobjectid_value eq c-2)',
      '(_regardingobjectid_value eq c-1 or _regardingobjectid_value eq c-2)',
    ]);
  });

  it('shape a promise with its own amount and date, an SMS and a WhatsApp apart, and an email', () => {
    const reads = customerHistoryReads(['c-1'], 'all', TYPES);
    const promise = reads.activity!.toEntry(activity('a-1', 'c-1', at('2026-09-29T14:45:00Z'), { qdb_ptpdate: '2026-10-04', qdb_promisedamount: 30800, [`qdb_ptpstatus${FORMATTED}`]: 'Active' }));

    expect([promise.detail, promise.outcome, promise.category, promise.caseId, promise.recordedBy, reads.fax!.toEntry(fax('f-1', 'c-1', at('2026-09-28T10:00:00Z'))).channel,
      reads.fax!.toEntry(fax('f-2', 'c-1', at('2026-09-28T10:00:00Z'), true)).channel, reads.email!.toEntry(email('e-1', 'c-1', at('2026-09-28T10:12:00Z'))).channel])
      .toEqual(['QAR 30,800 promised for 4 Oct 2026', 'Active', 'ptp', 'c-1', 'Officer One', 'SMS', 'WhatsApp', 'Email']);
  });
});

describe('the merged page', () => {
  it('orders newest first across tables and cases, and names each entry\'s case', async () => {
    const { adapter } = fakeAdapter({
      qdb_collectionactivities: [activity('a-1', 'c-1', at('2026-09-29T14:45:00Z')), activity('a-2', 'c-2', at('2026-09-27T09:00:00Z'))],
      faxes: [fax('f-1', 'c-2', at('2026-09-28T10:00:00Z'))],
      emails: [email('e-1', 'c-1', at('2026-09-28T10:12:00Z'))],
    });

    const page = await nextCustomerHistoryPage(adapter, ALL(['c-1', 'c-2']), startCustomerHistory(), 10);

    expect([page.entries.map(e => `${e.id}@${e.caseId}`), page.complete]).toEqual([['a-1@c-1', 'e-1@c-1', 'f-1@c-2', 'a-2@c-2'], true]);
  });

  it('pages through a continuation without a duplicate or a gap, and asks each table only for what it needs', async () => {
    const activities = Array.from({ length: 7 }, (_, i) => activity(`a-${i}`, 'c-1', at(`2026-09-${String(20 - i).padStart(2, '0')}T08:00:00Z`)));
    const { adapter, reads } = fakeAdapter({ qdb_collectionactivities: activities, faxes: [], emails: [] }, 3);

    const first = await nextCustomerHistoryPage(adapter, ALL(['c-1']), startCustomerHistory(), 4);
    const second = await nextCustomerHistoryPage(adapter, ALL(['c-1']), first.cursor, 4);
    const ids = [...first.entries, ...second.entries].map(e => e.id);

    expect([ids, new Set(ids).size, second.complete, reads.filter(r => r.entitySet === 'faxes').length]).toEqual([
      ['a-0', 'a-1', 'a-2', 'a-3', 'a-4', 'a-5', 'a-6'], 7, true, 1,
    ]);
  });

  it('breaks a timestamp tie on the id, so two pages never disagree about the boundary row', async () => {
    const same = '2026-09-28T10:00:00Z';
    const { adapter } = fakeAdapter({ qdb_collectionactivities: [activity('a-b', 'c-1', same), activity('a-a', 'c-1', same), activity('a-c', 'c-1', same)], faxes: [], emails: [] });

    const first = await nextCustomerHistoryPage(adapter, ALL(['c-1']), startCustomerHistory(), 2);
    const second = await nextCustomerHistoryPage(adapter, ALL(['c-1']), first.cursor, 2);

    expect([...first.entries, ...second.entries].map(e => e.id)).toHaveLength(3);
    expect(new Set([...first.entries, ...second.entries].map(e => e.id)).size).toBe(3);
  });

  it('is complete and empty for a customer with no case, without reading anything', async () => {
    const { adapter, reads } = fakeAdapter({});

    const page = await nextCustomerHistoryPage(adapter, ALL([]), startCustomerHistory(), 10);

    expect([page.entries, page.complete, reads.length]).toEqual([[], true, 0]);
  });
});

describe('categories', () => {
  it('never overlap: each category excludes every earlier one', () => {
    expect(activityCategoryFilter('legal', TYPES)).toBe("(qdb_relatedrecordtype eq 'qdb_qdblegal' or _qdb_activitytypeid_value eq t-legal) and not ((qdb_relatedrecordtype eq 'incident' or _qdb_activitytypeid_value eq t-dispute))");
    expect(activityCategoryFilter('actions', TYPES)).toContain('not (qdb_ptpdate ne null)');
  });

  it('offers Deceased / Insurance only when its activity type is configured', () => {
    expect(supportedCategories(TYPES)).toContain('deceased');
    expect(supportedCategories({ ...TYPES, deceased: [] })).not.toContain('deceased');
  });

  it('reads only Fax and Email for Communications, and only activities for any other category', () => {
    expect(Object.keys(customerHistoryReads(['c-1'], 'communications', TYPES)).sort()).toEqual(['email', 'fax']);
    expect(Object.keys(customerHistoryReads(['c-1'], 'legal', TYPES))).toEqual(['activity']);
  });

  it('classifies a Legal hand-off by its external reference, with the number its owning module issued', () => {
    const entry = customerHistoryReads(['c-1'], 'all', TYPES).activity!.toEntry(activity('l-1', 'c-1', at('2026-09-29T10:00:00Z'), { qdb_relatedrecordtype: 'qdb_qdblegal', qdb_relatedrecordnumber: 'LGL-0042' }));
    expect([entry.category, entry.externalReference]).toEqual(['legal', { process: 'Legal', recordNumber: 'LGL-0042' }]);
  });
});

describe('counts', () => {
  const countingAdapter = (answer: (entitySet: string, filter?: string) => number | null) => ({
    async count(entitySet: string, filter?: string) { return answer(entitySet, filter); },
  }) as unknown as XrmCrmAdapter;

  it('adds Fax and Email for Communications and every category for All', async () => {
    const counts = await loadHistoryCounts(countingAdapter(set => (set === 'faxes' ? 3 : set === 'emails' ? 1 : 2)), { caseIds: ['c-1'], types: TYPES });
    expect(counts).toEqual({ actions: 2, ptp: 2, complaint: 2, legal: 2, deceased: 2, communications: 4, all: 14 });
  });

  it('returns no counts at all when one count is refused', async () => {
    expect(await loadHistoryCounts(countingAdapter(set => (set === 'emails' ? null : 1)), { caseIds: ['c-1'], types: TYPES })).toBeUndefined();
  });

  it('returns no counts at all when one count reaches the platform cap', async () => {
    expect(await loadHistoryCounts(countingAdapter(() => 5000), { caseIds: ['c-1'], types: TYPES })).toBeUndefined();
  });

  it('is zero for All for a customer with no case, without asking the platform', async () => {
    expect(await loadHistoryCounts({} as XrmCrmAdapter, { caseIds: [], types: TYPES })).toEqual({ all: 0 });
  });
});

describe('the words', () => {
  it('calls a Housing Loan unit a loan account and a BFD unit a facility, and never the other way round', () => {
    expect([financialUnitTerms('HL').noun, financialUnitTerms('BFD').noun, financialUnitTerms('HL').balanceLabel, financialUnitTerms('BFD').balanceLabel, financialUnitTerms('HL').customerTable, financialUnitTerms('BFD').customerTable])
      .toEqual(['Loan Account', 'Facility', 'Loan balance', 'Facility exposure', 'contact', 'account']);
  });

  it('names a unit in full for a timeline line', () => {
    expect([describeFinancialUnit('HL', 'HL-001245'), describeFinancialUnit('BFD', 'BFD-00982')]).toEqual(['HL Loan Account HL-001245', 'BFD Facility BFD-00982']);
  });

  it('heads the section by what the customer actually holds', () => {
    expect([financialUnitsHeading(['loanAccount']), financialUnitsHeading(['facility']), financialUnitsHeading(['loanAccount', 'facility']), financialUnitsHeading([])])
      .toEqual(['Loan Accounts', 'Facilities', 'Loan Accounts & Facilities', 'Loan Accounts & Facilities']);
  });
});
