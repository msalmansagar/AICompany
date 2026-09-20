import type { ContinuationToken, Page } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  ACCOUNT_COLUMNS, ACTIVITY_COLUMNS, BUCKET_LABELS, CASE_DETAIL_COLUMNS, CASE_STATUS_LABELS,
  CONTACT_COLUMNS, CUSTOMER_TYPE_LABELS, ELIGIBILITY_OUTCOME_LABELS, ENTITY_SETS, ORG_LABELS,
  PROMISE_TYPE_LABELS, PTP_COLUMNS, PTP_STATUS_LABELS, RESOLUTION_TYPE_LABELS, SNAPSHOT_COLUMNS,
} from './schema.js';
import {
  optional, readChoice, readLookupName, readNumber, readText, type CrmRow,
} from './rowReaders.js';
import { escapeOData, mapPage, toCaseRow, type CaseRow } from './collectionQueries.js';

/**
 * The reads behind the Case Workspace and Customer & Loan 360.
 *
 * Customer 360 is an **aggregation, not an entity**. It gathers what the CRM and the MIS snapshots
 * already hold about one customer business id; it creates no customer record, no facility record and
 * no persistent frontend master. That is ADR-DCP-05 and the Correction Prompt's §5, and it is the
 * reason nothing here writes.
 *
 * Which table the customer lives in is read from the case's own lookup annotation — contact for
 * Housing Loan, account for BFD. **Neither is hard-coded against an organisation**, because the
 * mapping is configuration (`qdb_platformconfiguration.qdb_customerentity`), and a deployment may
 * change it without this file changing.
 */

// ── One case, in full ────────────────────────────────────────────────────────

export interface CaseDetail extends CaseRow {
  customerType?: string;
  productTypeCode?: string;
  productDescription?: string;
  installmentAmount?: number;
  lastMisSyncOn?: string;
  cureDate?: string;
  resolutionType?: string;
  closedDate?: string;
  correlationId?: string;
  eligibilityRulesetVersion?: string;
  strategyId?: string;
  strategyName?: string;
  ownerName?: string;
  isOpen: boolean;
  createdOn?: string;
  modifiedOn?: string;
}

export function toCaseDetail(row: CrmRow): CaseDetail {
  return {
    ...toCaseRow(row),
    isOpen: readNumber(row, 'statecode') === 0,
    ...optional('customerType', readChoice(row, 'qdb_customertype', CUSTOMER_TYPE_LABELS)),
    ...optional('productTypeCode', readText(row, 'qdb_producttypecode')),
    ...optional('productDescription', readText(row, 'qdb_productdescription')),
    ...optional('installmentAmount', readNumber(row, 'qdb_installmentamount')),
    ...optional('lastMisSyncOn', readText(row, 'qdb_lastmissyncon')),
    ...optional('cureDate', readText(row, 'qdb_curedate')),
    ...optional('resolutionType', readChoice(row, 'qdb_resolutiontype', RESOLUTION_TYPE_LABELS)),
    ...optional('closedDate', readText(row, 'qdb_closeddate')),
    ...optional('correlationId', readText(row, 'qdb_correlationid')),
    ...optional('eligibilityRulesetVersion', readText(row, 'qdb_eligibilityrulesetversion')),
    ...optional('strategyId', readText(row, '_qdb_strategyid_value')),
    ...optional('strategyName', readLookupName(row, '_qdb_strategyid_value')),
    ...optional('ownerName', readLookupName(row, '_ownerid_value')),
    ...optional('createdOn', readText(row, 'createdon')),
    ...optional('modifiedOn', readText(row, 'modifiedon')),
  };
}

/** Reads one case. Returns `null` for an id that does not resolve, rather than throwing. */
export async function retrieveCase(adapter: XrmCrmAdapter, caseId: string): Promise<CaseDetail | null> {
  const row = await adapter.retrieve({ entity: ENTITY_SETS.collectionCase, id: caseId }, [...CASE_DETAIL_COLUMNS]);
  return row ? toCaseDetail(row) : null;
}

// ── The customer, from whichever table owns it ───────────────────────────────

export interface CustomerProfile {
  id: string;
  table: 'contact' | 'account';
  displayName: string;
  businessId?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  city?: string;
  isActive: boolean;
  /**
   * The native Dynamics channel preferences.
   *
   * Read as the platform stores them and named as what they are. They are **not** QDB Collection
   * Contact Hold — that policy has no authoritative source yet (KI-79), and relabelling a contact
   * preference as a collections hold would make an unimplemented control look implemented.
   *
   * Absent is read as `false`, which is the platform's own meaning for an unset two-option column
   * and the permissive reading. That is safe only because it is not the whole gate: the hold policy
   * fails closed separately.
   */
  restrictions: { doNotFax: boolean; doNotEmail: boolean; doNotPhone: boolean };
}

/**
 * Reads the CRM customer a case points at.
 *
 * The table comes from the case's lookup annotation. An unexpected table is refused rather than
 * coerced: a third customer table would be an architectural change, and silently reading it as a
 * contact would hide that.
 */
export async function retrieveCustomer(
  adapter: XrmCrmAdapter,
  table: string,
  customerId: string,
): Promise<CustomerProfile | null> {
  if (table !== 'contact' && table !== 'account') {
    throw new Error(
      `A collection case points its customer lookup at '${table}'. This workspace knows contact ` +
      '(Housing Loan) and account (BFD) only, and will not read an unknown customer table as though ' +
      'it were one of them.');
  }
  const isContact = table === 'contact';
  const row = await adapter.retrieve(
    { entity: isContact ? ENTITY_SETS.contact : ENTITY_SETS.account, id: customerId },
    isContact ? [...CONTACT_COLUMNS] : [...ACCOUNT_COLUMNS],
  );
  if (!row) return null;

  return {
    id: customerId,
    table,
    displayName: (isContact ? readText(row, 'fullname') : readText(row, 'name')) ?? '—',
    ...optional('businessId', isContact ? undefined : readText(row, 'accountnumber')),
    ...optional('phone', readText(row, 'telephone1')),
    ...optional('mobile', isContact ? readText(row, 'mobilephone') : undefined),
    ...optional('email', readText(row, 'emailaddress1')),
    ...optional('city', readText(row, 'address1_city')),
    isActive: readNumber(row, 'statecode') === 0,
    restrictions: {
      doNotFax: row['donotfax'] === true,
      doNotEmail: row['donotemail'] === true,
      doNotPhone: row['donotphone'] === true,
    },
  };
}

// ── Activities and promises ──────────────────────────────────────────────────

export interface ActivityRow {
  id: string;
  subject: string;
  activityNumber?: string;
  activityDate?: string;
  followUpDate?: string;
  amount?: number;
  activityType?: string;
  /** The type's id, which is what correlates an activity with a planned action. */
  activityTypeId?: string;
  ownerName?: string;
  status?: string;
  createdOn?: string;
  caseId?: string;
  caseNumber?: string;
}

export interface PtpRow extends ActivityRow {
  ptpDate?: string;
  promisedAmount?: number;
  promiseType?: string;
  ptpStatus?: string;
  amountReceived?: number;
  paymentReceivedDate?: string;
  brokenDate?: string;
  brokenReason?: string;
}

export function toActivityRow(row: CrmRow): ActivityRow {
  return {
    id: String(row['activityid']),
    subject: readText(row, 'subject') ?? '—',
    ...optional('activityNumber', readText(row, 'qdb_activitynumber')),
    ...optional('activityDate', readText(row, 'qdb_activitydate')),
    ...optional('followUpDate', readText(row, 'qdb_followupdate')),
    ...optional('amount', readNumber(row, 'qdb_amount')),
    ...optional('activityType', readLookupName(row, '_qdb_activitytypeid_value')),
    ...optional('activityTypeId', readText(row, '_qdb_activitytypeid_value')),
    ...optional('ownerName', readLookupName(row, '_ownerid_value')),
    ...optional('status', readChoice(row, 'statuscode')),
    ...optional('createdOn', readText(row, 'createdon')),
    ...optional('caseId', readText(row, '_qdb_collectioncaseid_value')),
    ...optional('caseNumber', readLookupName(row, '_qdb_collectioncaseid_value')),
  };
}

export function toPtpRow(row: CrmRow): PtpRow {
  return {
    ...toActivityRow(row),
    ...optional('ptpDate', readText(row, 'qdb_ptpdate')),
    ...optional('promisedAmount', readNumber(row, 'qdb_promisedamount')),
    ...optional('promiseType', readChoice(row, 'qdb_promisetype', PROMISE_TYPE_LABELS)),
    ...optional('ptpStatus', readChoice(row, 'qdb_ptpstatus', PTP_STATUS_LABELS)),
    ...optional('amountReceived', readNumber(row, 'qdb_amountreceived')),
    ...optional('paymentReceivedDate', readText(row, 'qdb_paymentreceiveddate')),
    ...optional('brokenDate', readText(row, 'qdb_brokendate')),
    ...optional('brokenReason', readText(row, 'qdb_brokenreason')),
  };
}

export interface ActivityQuery {
  caseId?: string;
  /** Only rows that carry a promise. Applied by the source, as `qdb_ptpdate ne null`. */
  promisesOnly?: boolean;
  scopeFilter?: string;
}

export function buildActivityFilter(query: ActivityQuery): string | undefined {
  const clauses: string[] = [];
  if (query.caseId) clauses.push(`_qdb_collectioncaseid_value eq ${escapeOData(query.caseId)}`);
  if (query.promisesOnly) clauses.push('qdb_ptpdate ne null');
  return clauses.length > 0 ? clauses.join(' and ') : undefined;
}

/** Collection activities for a case, newest first. */
export function createActivityQuery(adapter: XrmCrmAdapter) {
  return async (
    request: ActivityQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<ActivityRow>> => {
    const filter = buildActivityFilter(request);
    const page = await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
      select: [...ACTIVITY_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'createdon', descending: true }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toActivityRow);
  };
}

/** Promises, which are collection activities carrying a PTP date. */
export function createPtpQuery(adapter: XrmCrmAdapter) {
  return async (
    request: ActivityQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<PtpRow>> => {
    const filter = buildActivityFilter({ ...request, promisesOnly: true });
    const page = await adapter.retrievePage(ENTITY_SETS.collectionActivity, {
      select: [...PTP_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'qdb_ptpdate', descending: true }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toPtpRow);
  };
}

// ── Delinquency snapshots ────────────────────────────────────────────────────

export interface SnapshotRow {
  id: string;
  snapshotKey?: string;
  customerBusinessId?: string;
  facilityNumber?: string;
  sourceSystem?: string;
  snapshotDate?: string;
  receivedOn?: string;
  misSourceTimestamp?: string;
  dpd?: number;
  bucket?: string;
  loanBalance?: number;
  totalArrears?: number;
  installmentAmount?: number;
  productTypeCode?: string;
  eligibilityOutcome?: string;
  eligibilityReason?: string;
  batchId?: string;
  caseId?: string;
}

export function toSnapshotRow(row: CrmRow): SnapshotRow {
  return {
    id: String(row['qdb_delinquencysnapshotid']),
    ...optional('snapshotKey', readText(row, 'qdb_snapshotkey')),
    ...optional('customerBusinessId', readText(row, 'qdb_customerbusinessid')),
    ...optional('facilityNumber', readText(row, 'qdb_facilitynumber')),
    ...optional('sourceSystem', readText(row, 'qdb_facilitysourcesystem')),
    ...optional('snapshotDate', readText(row, 'qdb_snapshotdate')),
    ...optional('receivedOn', readText(row, 'qdb_receivedon')),
    ...optional('misSourceTimestamp', readText(row, 'qdb_missourcetimestamp')),
    ...optional('dpd', readNumber(row, 'qdb_dpd')),
    ...optional('bucket', readChoice(row, 'qdb_arrearbucket', BUCKET_LABELS)),
    ...optional('loanBalance', readNumber(row, 'qdb_loanbalance')),
    ...optional('totalArrears', readNumber(row, 'qdb_totalarrears')),
    ...optional('installmentAmount', readNumber(row, 'qdb_installmentamount')),
    ...optional('productTypeCode', readText(row, 'qdb_producttypecode')),
    ...optional('eligibilityOutcome', readChoice(row, 'qdb_eligibilityoutcome', ELIGIBILITY_OUTCOME_LABELS)),
    ...optional('eligibilityReason', readText(row, 'qdb_eligibilityreason')),
    ...optional('batchId', readText(row, 'qdb_integrationbatchid')),
    ...optional('caseId', readText(row, '_qdb_collectioncaseid_value')),
  };
}

export interface SnapshotQuery {
  caseId?: string;
  customerBusinessId?: string;
  facilityNumber?: string;
}

export function buildSnapshotFilter(query: SnapshotQuery): string | undefined {
  const clauses: string[] = [];
  if (query.caseId) clauses.push(`_qdb_collectioncaseid_value eq ${escapeOData(query.caseId)}`);
  if (query.customerBusinessId) {
    clauses.push(`qdb_customerbusinessid eq '${escapeOData(query.customerBusinessId)}'`);
  }
  if (query.facilityNumber) clauses.push(`qdb_facilitynumber eq '${escapeOData(query.facilityNumber)}'`);
  return clauses.length > 0 ? clauses.join(' and ') : undefined;
}

/**
 * The MIS positions recorded against a case or customer, newest first.
 *
 * These are **what DCP stored when MIS last reported**, not a live MIS read. The distinction is the
 * whole of Phase 4's freshness rule, and every screen showing these rows says so.
 */
export function createSnapshotQuery(adapter: XrmCrmAdapter) {
  return async (
    request: SnapshotQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<SnapshotRow>> => {
    const filter = buildSnapshotFilter(request);
    const page = await adapter.retrievePage(ENTITY_SETS.delinquencySnapshot, {
      select: [...SNAPSHOT_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'qdb_snapshotdate', descending: true }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toSnapshotRow);
  };
}

export { CASE_STATUS_LABELS, ORG_LABELS };
