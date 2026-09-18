import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { CASE_LIST_COLUMNS, ENTITY_SETS } from './schema.js';
import { buildCaseFilter, mapPage, toCaseRow, type CaseRow } from './collectionQueries.js';
import { retrieveCustomer, type CustomerProfile } from './caseQueries.js';

/**
 * Customer & Loan 360 — an aggregation over records that already exist.
 *
 * There is **no frontend customer master and no frontend facility master**. What a customer "has" is
 * whatever the collection cases say they have, and a facility is the MIS facility number carried on
 * those cases rather than a CRM record. This function gathers; it does not persist, and it does not
 * decide anything.
 *
 * The totals it returns are arithmetic over the rows it actually read — a sum, a maximum, a count.
 * No threshold, no bucket derivation and no eligibility appears here; those are the server's, and
 * duplicating one in the browser is precisely what Phase 5 was told not to do.
 *
 * A customer's facilities are a bounded set, so one page is normally the whole of it. When it is not,
 * `isComplete` is false and the screen says the totals are partial rather than presenting an
 * understated exposure as though it were the customer's position.
 */

/** A customer never has this many facilities; exceeding it means something is wrong, not busy. */
const MAX_CASES_PER_CUSTOMER = 200;

export interface CustomerAggregate {
  customerBusinessId: string;
  profile?: CustomerProfile;
  cases: readonly CaseRow[];
  /** One row per distinct facility number across those cases. */
  facilities: readonly FacilitySummary[];
  totalExposure?: number;
  totalOverdue?: number;
  openCaseCount: number;
  worstDpd?: number;
  /** False when more cases exist than were read, which makes every total above a partial figure. */
  isComplete: boolean;
}

export interface FacilitySummary {
  facilityNumber: string;
  sourceSystem: string;
  organization: string;
  productDescription?: string;
  loanBalance?: number;
  totalArrears?: number;
  dpd?: number;
  bucket?: string;
  caseId: string;
  caseNumber: string;
  caseStatus: string;
}

export async function loadCustomerAggregate(
  adapter: XrmCrmAdapter,
  customerBusinessId: string,
): Promise<CustomerAggregate> {
  const filter = buildCaseFilter({ customerBusinessId });
  const page = mapPage(
    await adapter.retrievePage(ENTITY_SETS.collectionCase, {
      select: [...CASE_LIST_COLUMNS],
      pageSize: MAX_CASES_PER_CUSTOMER,
      sort: [{ field: 'qdb_currentdpd', descending: true }],
      ...(filter !== undefined ? { filter } : {}),
      includeTotalCount: true,
    }),
    toCaseRow,
  );

  const cases = page.items;
  return {
    customerBusinessId,
    cases,
    facilities: summariseFacilities(cases),
    ...optionalNumber('totalExposure', sum(cases.map(c => c.loanBalance))),
    ...optionalNumber('totalOverdue', sum(cases.map(c => c.totalArrears))),
    openCaseCount: cases.length,
    ...optionalNumber('worstDpd', max(cases.map(c => c.dpd))),
    ...(await profileOf(adapter, cases)),
    isComplete: !page.hasMore,
  };
}

/**
 * The customer record behind the cases.
 *
 * Read from the first case that carries a resolved customer lookup, because the lookup annotation is
 * what names the table. A customer with no linked CRM record is a real state — an MIS-only identity
 * that has not been matched — and it returns no profile rather than an invented one.
 */
async function profileOf(
  adapter: XrmCrmAdapter,
  cases: readonly CaseRow[],
): Promise<{ profile?: CustomerProfile }> {
  const linked = cases.find(c => c.customerId !== undefined && c.customerTable !== undefined);
  if (!linked) return {};
  const profile = await retrieveCustomer(adapter, linked.customerTable!, linked.customerId!);
  return profile ? { profile } : {};
}

/** One row per facility. A facility appearing on two cases is one facility, shown once. */
function summariseFacilities(cases: readonly CaseRow[]): readonly FacilitySummary[] {
  const byFacility = new Map<string, FacilitySummary>();
  for (const row of cases) {
    if (byFacility.has(row.facilityNumber)) continue;
    byFacility.set(row.facilityNumber, {
      facilityNumber: row.facilityNumber,
      sourceSystem: row.sourceSystem,
      organization: row.organization,
      ...(row.loanBalance !== undefined ? { loanBalance: row.loanBalance } : {}),
      ...(row.totalArrears !== undefined ? { totalArrears: row.totalArrears } : {}),
      ...(row.dpd !== undefined ? { dpd: row.dpd } : {}),
      ...(row.bucket !== undefined ? { bucket: row.bucket } : {}),
      caseId: row.id,
      caseNumber: row.caseNumber,
      caseStatus: row.status,
    });
  }
  return [...byFacility.values()];
}

/** Undefined when no row carried a figure — an absent total, not a zero one. */
function sum(values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => v !== undefined);
  return present.length === 0 ? undefined : present.reduce((total, v) => total + v, 0);
}

function max(values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => v !== undefined);
  return present.length === 0 ? undefined : Math.max(...present);
}

function optionalNumber(key: string, value: number | undefined): Record<string, number> {
  return value === undefined ? {} : { [key]: value };
}
