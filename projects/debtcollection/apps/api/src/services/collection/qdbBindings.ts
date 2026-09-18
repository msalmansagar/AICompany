/**
 * The physical binding of the Collection domain to the `qdb_` schema.
 *
 * This is the ONLY module in the service layer that names a `qdb_` column, an entity set or a choice
 * value for the Collection tables. Repositories translate through it; services above them see the
 * domain types only. Keeping the binding in one file is what lets the same services run against an
 * on-premises organisation with an Organization Service adapter, and what makes a schema change a
 * one-file change.
 *
 * Choice values are the integers publisher `qdb` assigned on 2026-09-17, read back by
 * `verify-qdb-schema.mjs`. They are a translation table, not business logic.
 */

import {
  CASE_STATUS_CODES,
  ACTIVITY_STATUS_CODES,
  ACTIVITY_STATE_CODES,
  PTP_STATUS_CODES,
  type CaseResolutionType,
  type CaseStatus,
  type CustomerMasterEntity,
  type EligibilityOutcome,
  type OrganizationCode,
} from '@dcp/domain';

export const ENTITY_SETS = {
  collectionCase: 'qdb_collectioncases',
  delinquencySnapshot: 'qdb_delinquencysnapshots',
  collectionActivity: 'qdb_collectionactivities',
  collectionActivityType: 'qdb_collectionactivitytypes',
  identityException: 'qdb_identityexceptions',
} as const;

/** Single-valued navigation properties, as the organisation reports them (ReferencingEntityNavigationPropertyName). */
export const NAVIGATION = {
  caseCustomerContact: 'qdb_customerid_contact',
  caseCustomerAccount: 'qdb_customerid_account',
  // Read back from the organisation: a lookup with one relationship to its target keeps the bare
  // attribute name; the activity's lookups carry a suffix because regardingobjectid also targets the case.
  snapshotCase: 'qdb_collectioncaseid',
  activityCase: 'qdb_collectioncaseid_qdb_collectionactivity',
  activityRegardingCase: 'regardingobjectid_qdb_collectioncase_qdb_collectionactivity',
  activityType: 'qdb_activitytypeid_qdb_collectionactivity',
} as const;

/** Entity set of each customer master, for `@odata.bind`. */
export const CUSTOMER_ENTITY_SETS: Readonly<Record<CustomerMasterEntity, string>> = {
  contact: 'contacts',
  account: 'accounts',
};

export const CASE = {
  id: 'qdb_collectioncaseid',
  caseNumber: 'qdb_casenumber',
  customerType: 'qdb_customertype',
  customerBusinessId: 'qdb_customerbusinessid',
  customerLookupValue: '_qdb_customerid_value',
  customerLookupEntity: '_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname',
  facilityNumber: 'qdb_facilitynumber',
  facilitySourceSystem: 'qdb_facilitysourcesystem',
  productTypeCode: 'qdb_producttypecode',
  productDescription: 'qdb_productdescription',
  currentDpd: 'qdb_currentdpd',
  currentArrearBucket: 'qdb_currentarrearbucket',
  currentLoanBalance: 'qdb_currentloanbalance',
  currentTotalArrears: 'qdb_currenttotalarrears',
  installmentAmount: 'qdb_installmentamount',
  lastMisSyncOn: 'qdb_lastmissyncon',
  misAsOfDate: 'qdb_misasofdate',
  openDate: 'qdb_opendate',
  episodeNumber: 'qdb_episodenumber',
  cureDate: 'qdb_curedate',
  resolutionType: 'qdb_resolutiontype',
  closedDate: 'qdb_closeddate',
  organizationCode: 'qdb_organizationcode',
  correlationId: 'qdb_correlationid',
  eligibilityRulesetVersion: 'qdb_eligibilityrulesetversion',
  statusCode: 'statuscode',
  stateCode: 'statecode',
} as const;

export const SNAPSHOT = {
  id: 'qdb_delinquencysnapshotid',
  name: 'qdb_name',
  snapshotKey: 'qdb_snapshotkey',
  customerBusinessId: 'qdb_customerbusinessid',
  facilityNumber: 'qdb_facilitynumber',
  snapshotDate: 'qdb_snapshotdate',
  receivedOn: 'qdb_receivedon',
  integrationBatchId: 'qdb_integrationbatchid',
  misSourceTimestamp: 'qdb_missourcetimestamp',
  dpdAsOfDate: 'qdb_dpdasofdate',
  dpd: 'qdb_dpd',
  arrearBucket: 'qdb_arrearbucket',
  loanBalance: 'qdb_loanbalance',
  totalArrears: 'qdb_totalarrears',
  installmentAmount: 'qdb_installmentamount',
  firstArrearDate: 'qdb_firstarreardate',
  lastArrearAmount: 'qdb_lastarrearamount',
  arrearPercentage: 'qdb_arrearpercentage',
  productTypeCode: 'qdb_producttypecode',
  accountStatusCode: 'qdb_accountstatuscode',
  isDeceasedPerQcb: 'qdb_isdeceasedperqcb',
  exemptionPercentage: 'qdb_exemptionpercentage',
  exemptionAmount: 'qdb_exemptionamount',
  correlationId: 'qdb_correlationid',
  eligibilityOutcome: 'qdb_eligibilityoutcome',
  eligibilityReason: 'qdb_eligibilityreason',
  eligibilityRulesetCode: 'qdb_eligibilityrulesetcode',
  eligibilityRulesetVersion: 'qdb_eligibilityrulesetversion',
  eligibilityEvaluatedOn: 'qdb_eligibilityevaluatedon',
} as const;

export const ACTIVITY = {
  id: 'activityid',
  subject: 'subject',
  activityNumber: 'qdb_activitynumber',
  activityDate: 'qdb_activitydate',
  followUpDate: 'qdb_followupdate',
  amount: 'qdb_amount',
  ptpDate: 'qdb_ptpdate',
  promisedAmount: 'qdb_promisedamount',
  promiseType: 'qdb_promisetype',
  ptpStatus: 'qdb_ptpstatus',
  amountReceived: 'qdb_amountreceived',
  paymentReceivedDate: 'qdb_paymentreceiveddate',
  brokenDate: 'qdb_brokendate',
  brokenReason: 'qdb_brokenreason',
  relatedRecordType: 'qdb_relatedrecordtype',
  relatedRecordId: 'qdb_relatedrecordid',
  statusCode: 'statuscode',
  stateCode: 'statecode',
} as const;

export const ACTIVITY_TYPE = {
  id: 'qdb_collectionactivitytypeid',
  code: 'qdb_code',
  name: 'qdb_name',
} as const;

export const IDENTITY_EXCEPTION = {
  id: 'qdb_identityexceptionid',
  name: 'qdb_name',
  customerBusinessId: 'qdb_customerbusinessid',
  facilityNumber: 'qdb_facilitynumber',
  source: 'qdb_source',
  exceptionReason: 'qdb_exceptionreason',
  exceptionStatus: 'qdb_exceptionstatus',
  sourceReference: 'qdb_sourcereference',
  integrationBatchId: 'qdb_integrationbatchid',
  correlationId: 'qdb_correlationid',
  receivedDate: 'qdb_receiveddate',
  payload: 'qdb_payload',
} as const;

// ── Choice values ────────────────────────────────────────────────────────────

export const ORGANIZATION_CODE_VALUES: Readonly<Record<OrganizationCode, number>> = { HL: 100000140, BFD: 100000141 };

export const CUSTOMER_TYPE_VALUES: Readonly<Record<'Individual' | 'SME' | 'Corporate', number>> = {
  Individual: 100000020, SME: 100000021, Corporate: 100000022,
};

export const RESOLUTION_TYPE_VALUES: Readonly<Record<CaseResolutionType, number>> = {
  Cured: 100000340, Settled: 100000341, Restructured: 100000342, WrittenOff: 100000343,
  Legal: 100000344, Deceased: 100000345, Closed: 100000346,
};

/** `qdb_dpd_bucket`: the ten MIS bucket codes as labels. A code outside this table is not invented — it is left unset and logged. */
export const ARREAR_BUCKET_VALUES: Readonly<Record<string, number>> = {
  '1-30': 100000000, '31-60': 100000001, '61-90': 100000002, '91-180': 100000003, '181-270': 100000004,
  '271-360': 100000005, '361-500': 100000006, '501-1000': 100000007, '1001-2000': 100000008, '>2000': 100000009,
};

export const ELIGIBILITY_OUTCOME_VALUES: Readonly<Record<EligibilityOutcome, number>> = {
  EligibleCreateCase: 100000260,
  ExistingEpisodeUpdate: 100000261,
  GraceMonitor: 100000262,
  ExcludedSpecialHandling: 100000263,
  IdentityException: 100000264,
  FacilityException: 100000265,
};

export const PROMISE_TYPE_VALUES: Readonly<Record<'Full' | 'Partial', number>> = { Full: 100000580, Partial: 100000581 };

export const EXCEPTION_REASON_VALUES = {
  CustomerNotFound: 100000300,
  FacilityNotFound: 100000301,
  DuplicateCustomer: 100000302,
  DuplicateFacility: 100000303,
  InvalidIdentifier: 100000304,
  OneOrgOnly: 100000305,
} as const;
export type ExceptionReason = keyof typeof EXCEPTION_REASON_VALUES;

export const EXCEPTION_STATUS_VALUES = { Open: 100000320, UnderReview: 100000321, Resolved: 100000322, Rejected: 100000323 } as const;

export { CASE_STATUS_CODES, ACTIVITY_STATUS_CODES, ACTIVITY_STATE_CODES, PTP_STATUS_CODES };

/** Native `statecode` of a case status: terminal statuses are Inactive (1), everything else Active (0). */
export function caseStateCodeOf(status: CaseStatus): 0 | 1 {
  return status === 'Closed' || status === 'WrittenOff' ? 1 : 0;
}

/** Builds an `@odata.bind` payload entry for a lookup. */
export function bind(navigation: string, entitySet: string, id: string): Record<string, string> {
  return { [`${navigation}@odata.bind`]: `/${entitySet}(${id})` };
}
