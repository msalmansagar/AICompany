/**
 * qdb-option-set-defs.mjs
 *
 * ⚠️  AUTHORED, NOT PROVISIONED. Nothing in this file has been executed against any CRM
 *     organisation. Running provisioning requires explicit user go-ahead, every time.
 *
 * Global option sets for the `qdb_` Collection schema. Created alongside the `msst_` sets;
 * the existing ones are untouched (create-new-then-migrate).
 *
 * 🔴 OPTION VALUE BASE — must be resolved before provisioning.
 * Option values are publisher-bound: Dataverse allocates them from the publisher's
 * OptionValuePrefix. The `msst_` sets use 463 270 000 (MSST prefix 46327). The `qdb` publisher has
 * a DIFFERENT prefix, so these values cannot be reused — reusing them would either be rejected or
 * silently produce values outside the qdb publisher's range.
 *
 * `QDB_OPTION_VALUE_BASE` is therefore read from the environment at provisioning time and has no
 * hard-coded fallback: provisioning must fail loudly rather than write values into the wrong range.
 * Resolve it by reading `OptionValuePrefix` from the `qdb` publisher record and multiplying by
 * 10 000. `TBD — Requires QDB Confirmation`: the qdb publisher's OptionValuePrefix.
 *
 * Migration between `msst_` and `qdb_` maps by LABEL/CODE, never by integer (SchemaMigration §1.3).
 */
import { label1033, emptyLabel, optionItem } from './labels.mjs';

/**
 * Resolves the option-value base for the qdb publisher.
 * @param {Record<string, string|undefined>} [env]
 * @returns {number}
 */
export function resolveQdbOptionValueBase(env = process.env) {
  const raw = env.QDB_OPTION_VALUE_PREFIX;
  if (!raw || !/^\d+$/.test(raw)) {
    throw new Error(
      'QDB_OPTION_VALUE_PREFIX is required before provisioning qdb_ option sets. ' +
      "Read OptionValuePrefix from the qdb publisher record (GET /publishers?$filter=uniquename eq 'qdb') " +
      'and set it, e.g. QDB_OPTION_VALUE_PREFIX=12345. There is deliberately no default: a wrong base ' +
      'writes option values outside the publisher range and cannot be corrected in place.',
    );
  }
  return Number(raw) * 10000;
}

/**
 * Builds the option items for a set, offsetting each by the resolved publisher base.
 * @param {number} base @param {number} start @param {string[]} labels
 */
function items(base, start, labels) {
  return labels.map((label, i) => optionItem(base + start + i, label));
}

/** @param {string} name @param {string} displayName @param {object[]} optionItems */
function defOptionSet(name, displayName, optionItems) {
  return {
    name,
    definition: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      OptionSetType: 'Picklist',
      IsGlobal: true,
      Name: name,
      DisplayName: label1033(displayName),
      Description: emptyLabel(),
      Options: optionItems,
    },
  };
}

// ── value blocks ──────────────────────────────────────────────────────────────
// Each set gets a 20-value block so later additions never collide.
const BLOCK = {
  DPD_BUCKET:        0,
  CUSTOMER_TYPE:    20,
  CASE_STAGE:       40,
  ACTIVITY_STATUS:  60,
  PTP_STATUS:       80,
  COMM_CHANNEL:    100,
  PLATFORM_TYPE:   120,
  ORG_CODE:        140,
  PRODUCT_TYPE:    160,
  RISK_LEVEL:      180,
  PRIORITY:        200,
  ASSIGN_METHOD:   220,
  TRIGGER_EVENT:   240,
  ELIGIBILITY:     260,
  SNAPSHOT_POLICY: 280,
  EXCEPTION_REASON:300,
  EXCEPTION_STATUS:320,
  RESOLUTION_TYPE: 340,
  APPROVAL_STATUS: 360,
  BUSINESS_OBJECT: 380,
  MAPPING_ACCESS:  400,
  MAPPING_SOURCE:  420,
  LANGUAGE:        440,
  ACTIVITY_CATEGORY:460,
  OUTCOME_CATEGORY:480,
  DOCUMENT_PROVIDER:500,
  MIS_PROVIDER:    520,
  CONSENT_STATUS:  540,
  LAWFUL_BASIS:    560,
  PROMISE_TYPE:    580,
};

/**
 * The ten MIS arrear buckets. Labels are the MIS codes verbatim so the adapter can map
 * `arrearBucket` straight through — including the Excel artefact where `1-30` arrives as a date,
 * which the adapter normalises before it reaches here (HousingLoanDataAnalysis F11).
 */
const DPD_BUCKETS = ['1-30', '31-60', '61-90', '91-180', '181-270', '271-360', '361-500', '501-1000', '1001-2000', '>2000'];

/**
 * Product types are SEEDED FROM MIS DATA, not hard-coded policy. The nine loan-type codes observed
 * in the 30/06/2026 Housing Loan extract are a starting set for HL only; BFD products are unknown.
 * `TBD — Requires QDB Confirmation`: the authoritative product list per organisation.
 */
const PRODUCT_TYPES = [
  'Building Housing', 'Demolishing', 'Buying House', 'Old Housing Loan/Partial',
  'Land Loan', 'Land Loan Additional', 'LLD Real Estate', 'LLD Additional Loan',
  'Additional Loan', 'Other',
];

/**
 * Builds every qdb_ global option set definition.
 * Call with an explicit base in tests; defaults to the environment-resolved publisher base.
 * @param {number} [base]
 */
export function buildQdbOptionSetDefs(base = resolveQdbOptionValueBase()) {
  return [
    defOptionSet('qdb_dpd_bucket', 'QDB DPD Bucket',
      items(base, BLOCK.DPD_BUCKET, DPD_BUCKETS)),
    defOptionSet('qdb_customer_type', 'QDB Customer Type',
      items(base, BLOCK.CUSTOMER_TYPE, ['Individual', 'SME', 'Corporate'])),
    defOptionSet('qdb_case_stage', 'QDB Case Stage',
      items(base, BLOCK.CASE_STAGE, ['Early', 'Mid', 'Late', 'Legal', 'Workout', 'Closed'])),
    defOptionSet('qdb_activity_status', 'QDB Activity Status',
      items(base, BLOCK.ACTIVITY_STATUS, ['Open', 'In Progress', 'Awaiting Approval', 'Returned', 'Completed', 'Cancelled'])),
    defOptionSet('qdb_ptp_status', 'QDB PTP Status',
      items(base, BLOCK.PTP_STATUS, ['Active', 'Kept', 'Partially Kept', 'Broken', 'Rescheduled', 'Cancelled'])),
    defOptionSet('qdb_communication_channel', 'QDB Communication Channel',
      items(base, BLOCK.COMM_CHANNEL, ['SMS', 'WhatsApp', 'Email', 'Call', 'Official Letter'])),
    defOptionSet('qdb_platform_type', 'QDB Platform Type',
      items(base, BLOCK.PLATFORM_TYPE, ['OnPrem', 'Cloud'])),
    defOptionSet('qdb_organization_code', 'QDB Organization Code',
      items(base, BLOCK.ORG_CODE, ['HL', 'BFD'])),
    defOptionSet('qdb_product_type', 'QDB Product Type',
      items(base, BLOCK.PRODUCT_TYPE, PRODUCT_TYPES)),
    defOptionSet('qdb_risk_level', 'QDB Risk Level',
      items(base, BLOCK.RISK_LEVEL, ['Low', 'Medium', 'High', 'Critical'])),
    defOptionSet('qdb_priority', 'QDB Priority',
      items(base, BLOCK.PRIORITY, ['Low', 'Medium', 'High', 'Critical'])),
    defOptionSet('qdb_assignment_method', 'QDB Assignment Method',
      items(base, BLOCK.ASSIGN_METHOD, ['RoundRobin', 'Load', 'Territory', 'SmartAssignment', 'Manual'])),
    defOptionSet('qdb_trigger_event', 'QDB Trigger Event',
      items(base, BLOCK.TRIGGER_EVENT, ['DayOffset', 'BucketChange', 'BrokenPTP', 'Cure', 'NewDelinquency', 'SLA', 'Manual'])),

    // Collection Eligibility / Grace evaluation outcomes (ADR-DCP-11).
    // A MIS delinquency record is not automatically a Collection Case.
    defOptionSet('qdb_eligibility_outcome', 'QDB Eligibility Outcome',
      items(base, BLOCK.ELIGIBILITY, [
        'EligibleCreateCase', 'ExistingEpisodeUpdate', 'GraceMonitor',
        'ExcludedSpecialHandling', 'IdentityException', 'FacilityException',
      ])),

    // Which MIS records are persisted as snapshots. NO production default is set in Phase 0
    // (gate correction 3) — the deployment default is TBD pending volume validation.
    defOptionSet('qdb_snapshot_policy', 'QDB Snapshot Policy',
      items(base, BLOCK.SNAPSHOT_POLICY, ['AllReceived', 'EligibleOnly', 'ChangedOnly'])),

    defOptionSet('qdb_exception_reason', 'QDB Exception Reason',
      items(base, BLOCK.EXCEPTION_REASON, [
        'CustomerNotFound', 'FacilityNotFound', 'DuplicateCustomer',
        'DuplicateFacility', 'InvalidIdentifier', 'OneOrgOnly',
      ])),
    defOptionSet('qdb_exception_status', 'QDB Exception Status',
      items(base, BLOCK.EXCEPTION_STATUS, ['Open', 'UnderReview', 'Resolved', 'Rejected'])),
    defOptionSet('qdb_resolution_type', 'QDB Resolution Type',
      items(base, BLOCK.RESOLUTION_TYPE, ['Cured', 'Settled', 'Restructured', 'WrittenOff', 'Legal', 'Deceased', 'Closed'])),
    defOptionSet('qdb_approval_status', 'QDB Approval Status',
      items(base, BLOCK.APPROVAL_STATUS, ['NotRequired', 'Pending', 'Approved', 'Rejected', 'Returned'])),
    defOptionSet('qdb_business_object', 'QDB Business Object',
      items(base, BLOCK.BUSINESS_OBJECT, ['Customer', 'Facility', 'Case', 'Activity', 'Communication', 'Document'])),
    defOptionSet('qdb_mapping_access', 'QDB Mapping Access',
      items(base, BLOCK.MAPPING_ACCESS, ['Read', 'Write', 'ReadWrite'])),
    defOptionSet('qdb_mapping_source', 'QDB Mapping Source',
      items(base, BLOCK.MAPPING_SOURCE, ['CRM', 'MIS', 'Derived'])),
    defOptionSet('qdb_language', 'QDB Language',
      items(base, BLOCK.LANGUAGE, ['Arabic', 'English'])),
    defOptionSet('qdb_activity_category', 'QDB Activity Category',
      items(base, BLOCK.ACTIVITY_CATEGORY, ['Contact', 'Payment', 'Commitment', 'Visit', 'Recommendation', 'Complaint', 'General'])),
    defOptionSet('qdb_outcome_category', 'QDB Outcome Category',
      items(base, BLOCK.OUTCOME_CATEGORY, ['Positive', 'Negative', 'Neutral', 'NoContact'])),
    defOptionSet('qdb_document_provider', 'QDB Document Provider',
      items(base, BLOCK.DOCUMENT_PROVIDER, ['SharePoint', 'SharePointOnline', 'None'])),
    defOptionSet('qdb_mis_provider', 'QDB MIS Provider',
      items(base, BLOCK.MIS_PROVIDER, ['Mock', 'Api'])),
    defOptionSet('qdb_consent_status', 'QDB Consent Status',
      items(base, BLOCK.CONSENT_STATUS, ['Given', 'Withdrawn', 'NotRecorded'])),
    defOptionSet('qdb_lawful_basis', 'QDB Lawful Basis',
      items(base, BLOCK.LAWFUL_BASIS, ['Consent', 'LegitimateInterest', 'LegalObligation'])),
    defOptionSet('qdb_promise_type', 'QDB Promise Type',
      items(base, BLOCK.PROMISE_TYPE, ['Full', 'Partial'])),
  ];
}

export { BLOCK as QDB_OPTION_BLOCKS };
