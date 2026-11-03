import { countPortfolio } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { CASE_LIST_COLUMNS, ENTITY_SETS, PTP_STATUS_LABELS } from './schema.js';
import { buildCaseFilter, codeFor, escapeOData, mapPage, toCaseRow, type CaseRow } from './collectionQueries.js';
import { retrieveCustomer, type CustomerProfile } from './caseQueries.js';
import { escapeXml } from './caseFetchXml.js';
import { financialUnitTerms, type FinancialUnitKind } from './financialUnit.js';
import { countMatching } from './counts.js';

/**
 * Customer 360 — an aggregation over records that already exist (user instruction, 2026-09-28).
 *
 * There is **no customer master and no financial-unit master in DCP.** A Housing Loan customer is a
 * CRM contact whose delinquency sits on loan accounts; a BFD customer is a CRM account whose
 * delinquency sits on facilities. Both reach this module the same way: the collection cases that
 * carry the customer's business id (QID for HL, CR number for BFD, as MIS delivered it), each case
 * naming its unit by the canonical `facilityNumber` + `sourceSystem` key. This function gathers; it
 * persists nothing and decides nothing.
 *
 * The customer's position is the platform's own arithmetic — one FetchXML aggregate over the open
 * cases: sums, a maximum and a count — never a browser sum over whatever page happened to load. When
 * the platform refuses the aggregate, the figures fall back to the rows read and are marked partial.
 * Delinquency is never collapsed to one customer-level bucket: each unit keeps its own DPD and bucket.
 */

/** A customer never has this many units; exceeding it means something is wrong, not busy. */
const MAX_CASES_PER_CUSTOMER = 200;

export interface FinancialUnit {
  /** The canonical business key: MIS account/facility number plus source system. */
  unitNumber: string;
  sourceSystem: string;
  organization: string;
  kind: FinancialUnitKind;
  productDescription?: string;
  loanBalance?: number;
  totalArrears?: number;
  dpd?: number;
  bucket?: string;
  misAsOfDate?: string;
  lastMisSyncOn?: string;
  /** The collection case on the unit — the latest episode where several were read. */
  case: UnitCase;
}

export interface UnitCase {
  id: string;
  caseNumber: string;
  status: string;
  isOpen: boolean;
  episodeNumber?: number;
  strategyId?: string;
  strategyName?: string;
  ownerName?: string;
  ownerId?: string;
}

export interface CustomerPosition {
  totalExposure?: number;
  totalOverdue?: number;
  worstDpd?: number;
  openCases?: number;
  /** `aggregate`: the platform summed. `rows`: summed over the rows read, and possibly partial. */
  source: 'aggregate' | 'rows';
}

export interface CustomerAggregate {
  customerBusinessId: string;
  profile?: CustomerProfile;
  /** The distinct customer types the cases record — Individual, SME, or both. */
  segments: readonly string[];
  cases: readonly CaseRow[];
  /** One per distinct unit across the cases, HL loan accounts and BFD facilities alike. */
  financialUnits: readonly FinancialUnit[];
  position: CustomerPosition;
  /** The latest MIS as-of date and sync time across the units, for the stored-position notice. */
  misAsOfDate?: string;
  lastMisSyncOn?: string;
  /** False when more cases exist than were read, which makes every row-derived figure a partial one. */
  isComplete: boolean;
  /**
   * Units, open cases, past-due and current units across the **whole** portfolio. Present only when
   * the case read covered every case the customer has; a partial read offers no unit counts at all
   * rather than counts of whatever was read.
   */
  portfolio?: PortfolioSummary;
}

export interface PortfolioSummary {
  units: number;
  openCases: number;
  pastDue: number;
  current: number;
}

export async function loadCustomerAggregate(adapter: XrmCrmAdapter, customerBusinessId: string): Promise<CustomerAggregate> {
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
  const [profile, position] = await Promise.all([profileOf(adapter, cases), loadPosition(adapter, customerBusinessId, cases)]);
  const units = summariseUnits(cases);
  return {
    customerBusinessId,
    ...(profile ? { profile } : {}),
    segments: distinct(cases.map(c => c.customerType)),
    cases,
    financialUnits: units,
    position,
    ...optionalText('misAsOfDate', latest(cases.map(c => c.misAsOfDate))),
    ...optionalText('lastMisSyncOn', latest(cases.map(c => c.lastMisSyncOn))),
    isComplete: !page.hasMore,
    ...(page.hasMore ? {} : { portfolio: summarisePortfolio(units) }),
  };
}

function summarisePortfolio(units: readonly FinancialUnit[]): PortfolioSummary {
  const counts = countPortfolio(units.map(unit => unit.dpd));
  return { units: counts.units, openCases: units.filter(unit => unit.case.isOpen).length, pastDue: counts.pastDue, current: counts.current };
}

/**
 * The position the platform sums over the customer's open cases: exposure, overdue, worst DPD and
 * how many. One aggregate, bounded by the organisation's aggregate limit; a refusal is answered from
 * the rows read instead and says so through `source`.
 */
export function customerPositionFetchXml(customerBusinessId: string): string {
  return '<fetch aggregate="true"><entity name="qdb_collectioncase">'
    + '<attribute name="qdb_collectioncaseid" alias="cases" aggregate="count"/>'
    + '<attribute name="qdb_currenttotalarrears" alias="overdue" aggregate="sum"/>'
    + '<attribute name="qdb_currentloanbalance" alias="exposure" aggregate="sum"/>'
    + '<attribute name="qdb_currentdpd" alias="dpd" aggregate="max"/>'
    + '<filter type="and"><condition attribute="statecode" operator="eq" value="0"/>'
    + `<condition attribute="qdb_customerbusinessid" operator="eq" value="${escapeXml(customerBusinessId)}"/></filter>`
    + '</entity></fetch>';
}

async function loadPosition(adapter: XrmCrmAdapter, customerBusinessId: string, cases: readonly CaseRow[]): Promise<CustomerPosition> {
  const rows = await adapter.aggregate(ENTITY_SETS.collectionCase, customerPositionFetchXml(customerBusinessId)).catch(() => null);
  const row = rows?.[0];
  if (row && typeof row['cases'] === 'number') {
    return {
      source: 'aggregate',
      openCases: row['cases'],
      ...optionalNumber('totalExposure', asNumber(row['exposure'])),
      ...optionalNumber('totalOverdue', asNumber(row['overdue'])),
      ...optionalNumber('worstDpd', asNumber(row['dpd'])),
    };
  }
  const open = cases.filter(c => isOpenStatus(c.status));
  return {
    source: 'rows',
    openCases: open.length,
    ...optionalNumber('totalExposure', sum(open.map(c => c.loanBalance))),
    ...optionalNumber('totalOverdue', sum(open.map(c => c.totalArrears))),
    ...optionalNumber('worstDpd', max(open.map(c => c.dpd))),
  };
}

/**
 * Recorded promise performance across the customer's cases: how many promises were recorded and how
 * many the officer recorded as kept. Counted by the platform, never by measuring a page. Unknown
 * when a count is refused — never zero.
 */
export interface PromisePerformance {
  recorded?: number;
  kept?: number;
}

export async function loadPromisePerformance(adapter: XrmCrmAdapter, caseIds: readonly string[]): Promise<PromisePerformance> {
  if (caseIds.length === 0) return { recorded: 0, kept: 0 };
  const onCases = `(${caseIds.map(id => `_qdb_collectioncaseid_value eq ${escapeOData(id)}`).join(' or ')})`;
  const kept = codeFor(PTP_STATUS_LABELS, 'Kept');
  const [recorded, keptCount] = await Promise.all([
    countMatching(adapter, ENTITY_SETS.collectionActivity, `qdb_ptpdate ne null and ${onCases}`),
    countMatching(adapter, ENTITY_SETS.collectionActivity, `qdb_ptpdate ne null and qdb_ptpstatus eq ${kept} and ${onCases}`),
  ]);
  return {
    ...optionalNumber('recorded', recorded.value),
    ...optionalNumber('kept', keptCount.value),
  };
}

/**
 * The customer record behind the cases.
 *
 * Read from the first case that carries a resolved customer lookup, because the lookup annotation is
 * what names the table. A customer with no linked CRM record is a real state — an MIS-only identity
 * that has not been matched — and it returns no profile rather than an invented one.
 */
async function profileOf(adapter: XrmCrmAdapter, cases: readonly CaseRow[]): Promise<CustomerProfile | undefined> {
  const linked = cases.find(c => c.customerId !== undefined && c.customerTable !== undefined);
  if (!linked) return undefined;
  return (await retrieveCustomer(adapter, linked.customerTable!, linked.customerId!)) ?? undefined;
}

/** One unit per canonical key. A unit with several episodes is shown once, on its latest case. */
function summariseUnits(cases: readonly CaseRow[]): readonly FinancialUnit[] {
  const byUnit = new Map<string, FinancialUnit>();
  for (const row of cases) {
    const key = `${row.sourceSystem}|${row.facilityNumber}`;
    const existing = byUnit.get(key);
    if (existing && (existing.case.episodeNumber ?? 0) >= (row.episodeNumber ?? 0)) continue;
    byUnit.set(key, toUnit(row));
  }
  return [...byUnit.values()].sort(byDpdThenNumber);
}

/** Deterministic: most days past due first, then by unit number; a unit with no DPD reported goes last. */
function byDpdThenNumber(a: FinancialUnit, b: FinancialUnit): number {
  const dpdOrder = (b.dpd ?? -1) - (a.dpd ?? -1);
  return dpdOrder !== 0 ? dpdOrder : a.unitNumber.localeCompare(b.unitNumber);
}

function toUnit(row: CaseRow): FinancialUnit {
  return {
    unitNumber: row.facilityNumber,
    sourceSystem: row.sourceSystem,
    organization: row.organization,
    kind: financialUnitTerms(row.organization === 'HL' || row.organization === 'BFD' ? row.organization : row.sourceSystem).kind,
    ...optionalText('productDescription', row.productDescription),
    ...optionalNumber('loanBalance', row.loanBalance),
    ...optionalNumber('totalArrears', row.totalArrears),
    ...optionalNumber('dpd', row.dpd),
    ...optionalText('bucket', row.bucket),
    ...optionalText('misAsOfDate', row.misAsOfDate),
    ...optionalText('lastMisSyncOn', row.lastMisSyncOn),
    case: {
      id: row.id,
      caseNumber: row.caseNumber,
      status: row.status,
      isOpen: isOpenStatus(row.status),
      ...optionalNumber('episodeNumber', row.episodeNumber),
      ...optionalText('strategyId', row.strategyId),
      ...optionalText('strategyName', row.strategyName),
      ...optionalText('ownerName', row.ownerName),
      ...optionalText('ownerId', row.ownerId),
    },
  };
}

/** Closed and cured statuses are the platform's; anything else on a case in the list is open work. */
function isOpenStatus(status: string): boolean {
  return !/closed|cured|written off|resolved|cancelled/i.test(status);
}

function distinct(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((v): v is string => v !== undefined && v.length > 0))];
}

function latest(values: readonly (string | undefined)[]): string | undefined {
  const present = values.filter((v): v is string => v !== undefined);
  return present.length === 0 ? undefined : present.reduce((a, b) => (a > b ? a : b));
}

function sum(values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => v !== undefined);
  return present.length === 0 ? undefined : present.reduce((total, v) => total + v, 0);
}

function max(values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((v): v is number => v !== undefined);
  return present.length === 0 ? undefined : Math.max(...present);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function optionalNumber(key: string, value: number | undefined): Record<string, number> {
  return value === undefined ? {} : { [key]: value };
}

function optionalText(key: string, value: string | undefined): Record<string, string> {
  return value === undefined ? {} : { [key]: value };
}
