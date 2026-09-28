import { describe, expect, it } from 'vitest';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { customerHistoryReads, nextCustomerHistoryPage, startCustomerHistory } from '../data/customerHistoryQueries.js';
import { describeFinancialUnit, financialUnitTerms, financialUnitsHeading } from '../data/financialUnit.js';

/**
 * A customer's collection history across their cases: three native tables, read server-side and
 * filtered to the customer's cases, merged newest first with a stable tie-break, paged through an
 * opaque continuation, every entry naming its case. And the words: a Housing Loan unit is a loan
 * account, a BFD unit is a facility.
 */

const FORMATTED = '@OData.Community.Display.V1.FormattedValue';
const at = (iso: string) => iso;

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
    const reads = customerHistoryReads(['c-1', 'c-2']);

    expect([reads.activity.filter, reads.fax.filter, reads.email.filter]).toEqual([
      '(_qdb_collectioncaseid_value eq c-1 or _qdb_collectioncaseid_value eq c-2)',
      '(_regardingobjectid_value eq c-1 or _regardingobjectid_value eq c-2)',
      '(_regardingobjectid_value eq c-1 or _regardingobjectid_value eq c-2)',
    ]);
  });

  it('shape a promise with its own amount and date, an SMS and a WhatsApp apart, and an email', () => {
    const reads = customerHistoryReads(['c-1']);
    const promise = reads.activity.toEntry(activity('a-1', 'c-1', at('2026-09-29T14:45:00Z'), { qdb_ptpdate: '2026-10-04', qdb_promisedamount: 30800, [`qdb_ptpstatus${FORMATTED}`]: 'Active' }));

    expect([promise.detail, promise.caseId, promise.recordedBy, reads.fax.toEntry(fax('f-1', 'c-1', at('2026-09-28T10:00:00Z'))).channel,
      reads.fax.toEntry(fax('f-2', 'c-1', at('2026-09-28T10:00:00Z'), true)).channel, reads.email.toEntry(email('e-1', 'c-1', at('2026-09-28T10:12:00Z'))).channel])
      .toEqual(['QAR 30,800 promised for 4 Oct 2026 · Active', 'c-1', 'Officer One', 'SMS', 'WhatsApp', 'Email']);
  });
});

describe('the merged page', () => {
  it('orders newest first across tables and cases, and names each entry\'s case', async () => {
    const { adapter } = fakeAdapter({
      qdb_collectionactivities: [activity('a-1', 'c-1', at('2026-09-29T14:45:00Z')), activity('a-2', 'c-2', at('2026-09-27T09:00:00Z'))],
      faxes: [fax('f-1', 'c-2', at('2026-09-28T10:00:00Z'))],
      emails: [email('e-1', 'c-1', at('2026-09-28T10:12:00Z'))],
    });

    const page = await nextCustomerHistoryPage(adapter, ['c-1', 'c-2'], startCustomerHistory(), 10);

    expect([page.entries.map(e => `${e.id}@${e.caseId}`), page.complete]).toEqual([['a-1@c-1', 'e-1@c-1', 'f-1@c-2', 'a-2@c-2'], true]);
  });

  it('pages through a continuation without a duplicate or a gap, and asks each table only for what it needs', async () => {
    const activities = Array.from({ length: 7 }, (_, i) => activity(`a-${i}`, 'c-1', at(`2026-09-${String(20 - i).padStart(2, '0')}T08:00:00Z`)));
    const { adapter, reads } = fakeAdapter({ qdb_collectionactivities: activities, faxes: [], emails: [] }, 3);

    const first = await nextCustomerHistoryPage(adapter, ['c-1'], startCustomerHistory(), 4);
    const second = await nextCustomerHistoryPage(adapter, ['c-1'], first.cursor, 4);
    const ids = [...first.entries, ...second.entries].map(e => e.id);

    expect([ids, new Set(ids).size, second.complete, reads.filter(r => r.entitySet === 'faxes').length]).toEqual([
      ['a-0', 'a-1', 'a-2', 'a-3', 'a-4', 'a-5', 'a-6'], 7, true, 1,
    ]);
  });

  it('breaks a timestamp tie on the id, so two pages never disagree about the boundary row', async () => {
    const same = '2026-09-28T10:00:00Z';
    const { adapter } = fakeAdapter({ qdb_collectionactivities: [activity('a-b', 'c-1', same), activity('a-a', 'c-1', same), activity('a-c', 'c-1', same)], faxes: [], emails: [] });

    const first = await nextCustomerHistoryPage(adapter, ['c-1'], startCustomerHistory(), 2);
    const second = await nextCustomerHistoryPage(adapter, ['c-1'], first.cursor, 2);

    expect([...first.entries, ...second.entries].map(e => e.id)).toHaveLength(3);
    expect(new Set([...first.entries, ...second.entries].map(e => e.id)).size).toBe(3);
  });

  it('is complete and empty for a customer with no case, without reading anything', async () => {
    const { adapter, reads } = fakeAdapter({});

    const page = await nextCustomerHistoryPage(adapter, [], startCustomerHistory(), 10);

    expect([page.entries, page.complete, reads.length]).toEqual([[], true, 0]);
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
