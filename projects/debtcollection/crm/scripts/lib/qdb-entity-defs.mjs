/**
 * qdb-entity-defs.mjs
 *
 * ⚠️  AUTHORED, NOT PROVISIONED. Nothing in this file has been executed against any CRM
 *     organisation. Running provisioning requires explicit user go-ahead, every time.
 *
 * The `qdb_` Collection schema (non-lookup attributes only), authored from
 * `docs/FieldDictionary-Transaction.md`, `-Configuration.md` and `-Platform.md`.
 * Lookups are provisioned separately (see QDB_LOOKUPS / QDB_CUSTOMER_LOOKUPS below), matching the
 * existing convention in `relationship-defs.mjs`.
 *
 * Created ALONGSIDE the `msst_` definitions — those stay untouched so the deployed org keeps
 * working (create-new → migrate → validate → retire).
 *
 * Deliberately absent, and why:
 *   • no integration-log entity — technical logging REUSES the existing `qdb_crmlogs`
 *     (QDB gate decision; `docs/QdbCrmLogsReuseAssessment.md`)
 *   • no customer or facility master — HL uses `contact`, BFD uses `account`, and the facility
 *     masters are the existing HL/BFD entities
 *   • no `qdb_facilityid` lookup in the shared schema — the canonical contract is
 *     `qdb_facilitynumber` + `qdb_facilitysourcesystem`; a physical lookup is an OPTIONAL
 *     per-deployment extension (see OPTIONAL_FACILITY_LOOKUP_EXTENSION)
 *   • no business threshold of any kind — every DPD, arrears or grace value is configuration
 */
import {
  strAttr, memoAttr, intAttr, moneyAttr, boolAttr, dtAttr, picklistAttr, piiStrAttr,
  memoAttrN, decAttr, dateAttr, multiPicklistAttr, oneToMany, customerLookup,
} from './qdb-attr-builders.mjs';
import { label1033 } from './labels.mjs';

/**
 * Builds the EntityMetadata body for POST /EntityDefinitions.
 *
 * Extends the `msst_` helper with `isValidForQueue`: `qdb_collectioncase` must be queue-enabled
 * AT CREATION. The deployed `msst_dcpcollectioncase` has IsValidForQueue = false, which is why
 * AddToQueueRequest fails there (Known Issue KI-01) — it cannot be fixed by a later metadata PATCH
 * as reliably as by getting it right at create time.
 */
function entityDef({ logicalName, displayLabel, pluralLabel, description, primaryAttr,
                     ownershipType, isActivity, hasNotes, hasActivities, isValidForQueue, attributes }) {
  const activitySubject = () => ({
    ...strAttr('subject', 'Subject', 200, 'ApplicationRequired'),
    SchemaName: 'Subject', IsPrimaryName: true,
  });
  const finalAttrs = isActivity
    ? [activitySubject(), ...attributes]
    : attributes.map(a => (a.LogicalName === primaryAttr ? { ...a, IsPrimaryName: true } : a));
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
    SchemaName: logicalName,
    LogicalName: logicalName,
    DisplayName: label1033(displayLabel),
    DisplayCollectionName: label1033(pluralLabel),
    Description: label1033(description),
    OwnershipType: ownershipType,
    IsActivity: isActivity ?? false,
    IsAvailableOffline: isActivity ?? false,
    HasNotes: isActivity ? true : (hasNotes ?? false),
    HasActivities: hasActivities ?? false,
    // IsValidForQueue is a BooleanManagedProperty, not a plain boolean: the Web API rejects a bare
    // `true` with 0x80048d19 ("a 'StartObject' node ... was expected"). Queue-enabling the case at
    // creation is what fixes KI-01 — the deployed msst_ case has IsValidForQueue = false, so
    // AddToQueueRequest has never worked.
    IsValidForQueue: {
      Value: isValidForQueue ?? false,
      CanBeChanged: true,
      ManagedPropertyLogicalName: 'canmodifyqueuesettings',
    },
    Attributes: finalAttrs,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. qdb_collectioncase — the operational Collection record
//    One ACTIVE case per facility/account per delinquency episode (plugin-enforced, not an
//    alternate key: the uniqueness is status-aware and an alternate key cannot express that).
// ─────────────────────────────────────────────────────────────────────────────
const caseAttrs = [
  // Case Number is the primary name. Numbering mechanism is NOT fixed here: the Phase 1 §4 reuse
  // assessment found QDB already has `qdb_autonumberconfig` (prefix/separator/seed/counter), and
  // Dataverse AutoNumberFormat availability on CE 9.1 on-premises is not guaranteed. Provisioned
  // as a plain string; the numbering mechanism is TBD — Requires QDB Confirmation.
  strAttr('qdb_casenumber',              'Case Number',                100, 'ApplicationRequired'),
  picklistAttr('qdb_customertype',       'Customer Type',              'qdb_customer_type', 'ApplicationRequired'),
  piiStrAttr('qdb_customerbusinessid',   'Customer Business ID',       50,  'ApplicationRequired'),

  // Canonical facility contract — shared schema, no physical lookup. `sourceSystem` says which
  // system the number belongs to, so Collection logic never needs the physical entity name.
  strAttr('qdb_facilitynumber',          'Facility Number',            50,  'ApplicationRequired'),
  strAttr('qdb_facilitysourcesystem',    'Facility Source System',     50),

  strAttr('qdb_producttypecode',         'Product Type Code',          20),
  picklistAttr('qdb_producttype',        'Product Type',               'qdb_product_type'),
  strAttr('qdb_productdescription',      'Product Description',        200),
  strAttr('qdb_casereason',              'Case Reason',                500),

  // Cached latest MIS position. Cache only — a successful live MIS response wins for display.
  intAttr('qdb_currentdpd',              'Current DPD'),
  picklistAttr('qdb_currentarrearbucket','Current Arrear Bucket',      'qdb_dpd_bucket'),
  moneyAttr('qdb_currentloanbalance',    'Current Loan Balance'),
  moneyAttr('qdb_currenttotalarrears',   'Current Total Arrears'),
  moneyAttr('qdb_installmentamount',     'Installment Amount'),
  boolAttr('qdb_nplindicator',           'NPL Indicator'),
  dtAttr('qdb_lastmissyncon',            'Last MIS Sync'),
  dtAttr('qdb_misasofdate',              'MIS As-Of Date'),

  picklistAttr('qdb_risklevel',          'Risk Level',                 'qdb_risk_level'),
  picklistAttr('qdb_priority',           'Priority',                   'qdb_priority'),
  picklistAttr('qdb_casestage',          'Case Stage',                 'qdb_case_stage'),

  dtAttr('qdb_opendate',                 'Open Date',                  'ApplicationRequired'),
  dtAttr('qdb_lastactivitydate',         'Last Activity Date'),
  dtAttr('qdb_nextactiondate',           'Next Action Date'),
  intAttr('qdb_episodenumber',           'Episode Number',             'ApplicationRequired'),
  dtAttr('qdb_curedate',                 'Cure Date'),

  picklistAttr('qdb_resolutiontype',     'Resolution Type',            'qdb_resolution_type'),
  dtAttr('qdb_resolutiondate',           'Resolution Date'),
  strAttr('qdb_closurereason',           'Closure Reason',             500),
  dtAttr('qdb_closeddate',               'Closed Date'),
  strAttr('qdb_reopenreason',            'Reopen Reason',              500),
  boolAttr('qdb_collectionpaused',       'Collection Paused'),
  picklistAttr('qdb_organizationcode',   'Organization Code',          'qdb_organization_code', 'ApplicationRequired'),
  memoAttrN('qdb_remarks',               'Remarks',                    4000),
  strAttr('qdb_correlationid',           'Correlation ID',             100),

  // Provenance: which eligibility ruleset version judged this facility eligible (ADR-DCP-11).
  // Answers "why does this case exist?" after the rules have moved on.
  strAttr('qdb_eligibilityrulesetversion', 'Eligibility Ruleset Version', 50),
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. qdb_collectionactivity — custom ACTIVITY. What Collections does.
//    PTP is an activity TYPE, not a separate entity; its core fields are physical here, while
//    descriptive fields (field visit, restructuring, legal, deceased, dispute) are Form Engine
//    configuration keyed by qdb_collectionactivitytype.qdb_defaultformcode.
// ─────────────────────────────────────────────────────────────────────────────
const activityAttrs = [
  strAttr('qdb_activitynumber',          'Activity Number',            100, 'ApplicationRequired'),
  strAttr('qdb_activitysubtype',         'Activity Sub-Type',          100),
  dtAttr('qdb_activitydate',             'Activity Date',              'ApplicationRequired'),
  dtAttr('qdb_followupdate',             'Follow-up Date'),
  moneyAttr('qdb_amount',                'Amount'),
  boolAttr('qdb_requiresapproval',       'Requires Approval'),
  picklistAttr('qdb_approvalstatus',     'Approval Status',            'qdb_approval_status'),
  strAttr('qdb_processinstanceid',       'Process Instance',           100),
  strAttr('qdb_formsubmissionref',       'Form Submission Ref',        100),
  strAttr('qdb_relatedrecordtype',       'Related Record Type',        50),
  strAttr('qdb_relatedrecordid',         'Related Record ID',          50),
  dtAttr('qdb_misrevalidatedon',         'MIS Revalidated On'),

  // PTP core (physical because the lifecycle is evaluated by rules and background sync).
  dtAttr('qdb_ptpdate',                  'PTP Date'),
  moneyAttr('qdb_promisedamount',        'Promised Amount'),
  picklistAttr('qdb_promisetype',        'Promise Type',               'qdb_promise_type'),
  picklistAttr('qdb_ptpstatus',          'PTP Status',                 'qdb_ptp_status'),
  moneyAttr('qdb_amountreceived',        'Amount Received'),
  dtAttr('qdb_paymentreceiveddate',      'Payment Received Date'),
  dtAttr('qdb_brokendate',               'Broken Date'),
  strAttr('qdb_brokenreason',            'Broken Reason',              500),
  intAttr('qdb_reschedulecount',         'Reschedule Count'),
  dtAttr('qdb_previousptpdate',          'Previous PTP Date'),
  dtAttr('qdb_reminderdate',             'Reminder Date'),
  boolAttr('qdb_supervisorescalated',    'Supervisor Escalated'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. qdb_delinquencysnapshot — append-only MIS history + the eligibility decision.
//    An observation may legitimately exist with NO case and NO resolved CRM customer/facility:
//    the source-identity columns are required at persist, every CRM lookup is optional.
// ─────────────────────────────────────────────────────────────────────────────
const snapshotAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),

  // Alternate key for replay idempotency. COMPOSITION IS PROVISIONAL and set at provisioning time;
  // the final physical rule is TBD — Requires QDB/MIS Confirmation (gate correction 2). DPD carries
  // a different as-of date from the balances, and an unconditional batch id would break replay.
  strAttr('qdb_snapshotkey',             'Snapshot Key',               200, 'ApplicationRequired'),

  // Source identity — required at persist, straight from the MIS payload, never from a CRM lookup.
  piiStrAttr('qdb_customerbusinessid',   'Customer Business ID',       50,  'ApplicationRequired'),
  strAttr('qdb_facilitynumber',          'Facility Number',            50,  'ApplicationRequired'),
  // The other half of the canonical facility identity. Added 2026-09-18 (KI-47, approved): the
  // identity is facility number + source system, so the observation must carry both explicitly.
  // The idempotency key may also include it, but a key is an implementation mechanism and must never
  // be the only place the business data model can be read from. Not ApplicationRequired: existing
  // rows predate the column, and a value is written by every new observation.
  strAttr('qdb_facilitysourcesystem',    'Facility Source System',     50),
  dtAttr('qdb_snapshotdate',             'Snapshot Date (As Of)',      'ApplicationRequired'),
  dtAttr('qdb_receivedon',               'Received On',                'ApplicationRequired'),
  strAttr('qdb_integrationbatchid',      'Integration Batch ID',       100, 'ApplicationRequired'),
  dtAttr('qdb_missourcetimestamp',       'MIS Source Timestamp'),

  // The DPD counter's own as-of, where materially distinct from the balance as-of.
  dtAttr('qdb_dpdasofdate',              'DPD As-Of Date'),

  intAttr('qdb_dpd',                     'DPD',                        'ApplicationRequired'),
  picklistAttr('qdb_arrearbucket',       'Arrear Bucket',              'qdb_dpd_bucket', 'ApplicationRequired'),
  moneyAttr('qdb_loanbalance',           'Loan Balance',               'ApplicationRequired'),
  moneyAttr('qdb_totalarrears',          'Total Arrears',              'ApplicationRequired'),
  moneyAttr('qdb_installmentamount',     'Installment Amount'),
  dateAttr('qdb_firstarreardate',        'First Arrear Date'),
  moneyAttr('qdb_lastarrearamount',      'Last Arrear Amount'),
  decAttr('qdb_arrearpercentage',        'Arrear Percentage',          4, 'None', 0, 1),
  boolAttr('qdb_nplindicator',           'NPL Indicator'),
  strAttr('qdb_producttypecode',         'Product Type Code',          20),
  strAttr('qdb_accountstatuscode',       'Account Status Code',        10),
  boolAttr('qdb_isdeceasedperqcb',       'Deceased per QCB'),
  decAttr('qdb_exemptionpercentage',     'Exemption Percentage',       4, 'None', 0, 1),
  moneyAttr('qdb_exemptionamount',       'Exemption Amount'),
  strAttr('qdb_correlationid',           'Correlation ID',             100),

  // Collection Eligibility / Grace decision (ADR-DCP-11), recorded so a record that produced no
  // case still has auditable history. Reason text comes from the ruleset, never from source.
  picklistAttr('qdb_eligibilityoutcome', 'Eligibility Outcome',        'qdb_eligibility_outcome', 'ApplicationRequired'),
  strAttr('qdb_eligibilityreason',       'Eligibility Reason',         500),
  strAttr('qdb_eligibilityrulesetcode',  'Eligibility Ruleset Code',   100),
  strAttr('qdb_eligibilityrulesetversion','Eligibility Ruleset Version', 50),
  dtAttr('qdb_eligibilityevaluatedon',   'Eligibility Evaluated On'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 4–5. Activity taxonomy
// ─────────────────────────────────────────────────────────────────────────────
const activityTypeAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  strAttr('qdb_code',                    'Code',                       50,  'ApplicationRequired'),
  strAttr('qdb_namearabic',              'Name (Arabic)',              200),
  picklistAttr('qdb_category',           'Category',                   'qdb_activity_category', 'ApplicationRequired'),
  multiPicklistAttr('qdb_applicablecustomertype', 'Applicable Customer Type', 'qdb_customer_type'),
  multiPicklistAttr('qdb_applicableproduct',      'Applicable Product',       'qdb_product_type'),
  strAttr('qdb_defaultformcode',         'Default Form Code',          100),
  strAttr('qdb_processcode',             'Process Code',               100),
  strAttr('qdb_rulecode',                'Rule Code',                  100),
  boolAttr('qdb_requiresapproval',       'Requires Approval',          'ApplicationRequired'),
  boolAttr('qdb_requiresfollowup',       'Requires Follow-up',         'ApplicationRequired'),
  intAttr('qdb_slahours',                'SLA Hours'),
  boolAttr('qdb_amountrequired',         'Amount Required',            'ApplicationRequired'),
  boolAttr('qdb_notesrequired',          'Notes Required',             'ApplicationRequired'),
  boolAttr('qdb_attachmentallowed',      'Attachment Allowed',         'ApplicationRequired'),
  boolAttr('qdb_requiresmisrevalidation','Requires MIS Revalidation',  'ApplicationRequired'),
  boolAttr('qdb_isactive',               'Active',                     'ApplicationRequired'),
  intAttr('qdb_sequence',                'Sequence'),
];

const activityOutcomeAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  strAttr('qdb_code',                    'Code',                       50,  'ApplicationRequired'),
  strAttr('qdb_namearabic',              'Name (Arabic)',              200),
  picklistAttr('qdb_category',           'Category',                   'qdb_outcome_category'),
  boolAttr('qdb_requiresfollowup',       'Requires Follow-up',         'ApplicationRequired'),
  boolAttr('qdb_requiresnotes',          'Requires Notes',             'ApplicationRequired'),
  intAttr('qdb_followupdays',            'Follow-up Days'),
  boolAttr('qdb_escalationrequired',     'Escalation Required',        'ApplicationRequired'),
  boolAttr('qdb_closeactivity',          'Close Activity',             'ApplicationRequired'),
  boolAttr('qdb_isactive',               'Active',                     'ApplicationRequired'),
  intAttr('qdb_sequence',                'Sequence'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 6–7. Strategy. Ranges (from/to) replace bucket choices so a `1001-2000` rule is expressible.
//      Exposure is RETAINED as an optional criterion — unconfigured by default for HL, available
//      for BFD. No threshold is set here; these are empty columns awaiting configuration rows.
// ─────────────────────────────────────────────────────────────────────────────
const strategyAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  strAttr('qdb_code',                    'Code',                       50),
  picklistAttr('qdb_customertype',       'Customer Type',              'qdb_customer_type'),
  picklistAttr('qdb_producttype',        'Product Type',               'qdb_product_type'),
  intAttr('qdb_dpdfrom',                 'DPD From'),
  intAttr('qdb_dpdto',                   'DPD To'),
  moneyAttr('qdb_arrearsfrom',           'Arrears From'),
  moneyAttr('qdb_arrearsto',             'Arrears To'),
  moneyAttr('qdb_exposurefrom',          'Exposure From'),
  moneyAttr('qdb_exposureto',            'Exposure To'),
  picklistAttr('qdb_risklevel',          'Risk Level',                 'qdb_risk_level'),
  boolAttr('qdb_nplflag',                'NPL Only'),
  intAttr('qdb_brokenptpcountfrom',      'Broken PTP Count From'),
  strAttr('qdb_legalstatus',             'Legal Status',               50),
  strAttr('qdb_restructurestatus',       'Restructure Status',         50),
  intAttr('qdb_priority',                'Priority',                   'ApplicationRequired'),
  dtAttr('qdb_effectivefrom',            'Effective From'),
  dtAttr('qdb_effectiveto',              'Effective To'),
  strAttr('qdb_rulecode',                'Rule Code',                  100),
  // The MECHANISM by which a strategy may suppress automated contact. Whether it is switched on,
  // and at what threshold, is configuration and TBD — Requires QDB Confirmation. Never encoded.
  boolAttr('qdb_noautomatedcontact',     'No Automated Contact',       'ApplicationRequired'),
  memoAttrN('qdb_description',           'Description',                2000),
  boolAttr('qdb_isactive',               'Active',                     'ApplicationRequired'),
];

const strategyActionAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  intAttr('qdb_sequence',                'Sequence',                   'ApplicationRequired'),
  picklistAttr('qdb_communicationchannel','Communication Channel',     'qdb_communication_channel'),
  intAttr('qdb_dayoffset',               'Day Offset',                 'ApplicationRequired'),
  picklistAttr('qdb_triggerevent',       'Trigger Event',              'qdb_trigger_event', 'ApplicationRequired'),
  strAttr('qdb_queuename',               'Queue Name',                 100),
  boolAttr('qdb_requiresapproval',       'Requires Approval',          'ApplicationRequired'),
  strAttr('qdb_processcode',             'Process Code',               100),
  strAttr('qdb_rulecode',                'Rule Code',                  100),
  boolAttr('qdb_ismandatory',            'Mandatory',                  'ApplicationRequired'),
  boolAttr('qdb_stoponpayment',          'Stop on Payment',            'ApplicationRequired'),
  boolAttr('qdb_stoponptp',              'Stop on PTP',                'ApplicationRequired'),
  boolAttr('qdb_escalateifnotcompleted', 'Escalate if Not Completed',  'ApplicationRequired'),
  intAttr('qdb_escalationhours',         'Escalation Hours'),
  boolAttr('qdb_isactive',               'Active',                     'ApplicationRequired'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 8. Assignment configuration — DCP-SPECIFIC CONFIGURATION ONLY.
//    This must NOT become a generic assignment engine: QDB Smart Assignment is the engine, and its
//    contract/runtime is TBD — Requires QDB Confirmation. `qdb_smartassignmentref` is the handle.
// ─────────────────────────────────────────────────────────────────────────────
const assignmentAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  picklistAttr('qdb_customertype',       'Customer Type',              'qdb_customer_type'),
  picklistAttr('qdb_producttype',        'Product Type',               'qdb_product_type'),
  intAttr('qdb_dpdfrom',                 'DPD From'),
  intAttr('qdb_dpdto',                   'DPD To'),
  moneyAttr('qdb_arrearsfrom',           'Arrears From'),
  moneyAttr('qdb_arrearsto',             'Arrears To'),
  moneyAttr('qdb_exposurefrom',          'Exposure From'),
  moneyAttr('qdb_exposureto',            'Exposure To'),
  picklistAttr('qdb_risklevel',          'Risk Level',                 'qdb_risk_level'),
  strAttr('qdb_region',                  'Region',                     100),
  strAttr('qdb_legalstatus',             'Legal Status',               50),
  picklistAttr('qdb_assignmentmethod',   'Assignment Method',          'qdb_assignment_method', 'ApplicationRequired'),
  intAttr('qdb_slahours',                'SLA Hours'),
  intAttr('qdb_priority',                'Priority',                   'ApplicationRequired'),
  dtAttr('qdb_effectivefrom',            'Effective From'),
  dtAttr('qdb_effectiveto',              'Effective To'),
  strAttr('qdb_smartassignmentref',      'Smart Assignment Reference', 100),
  boolAttr('qdb_isactive',               'Active',                     'ApplicationRequired'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 9. Communication template — CONDITIONAL on the qdb_emailtemplate / EmailEditor reuse decision
//    (TBD — Requires QDB Confirmation). Authored so the model is complete; provisioning it is a
//    separate decision.
// ─────────────────────────────────────────────────────────────────────────────
const templateAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  strAttr('qdb_code',                    'Code',                       50,  'ApplicationRequired'),
  picklistAttr('qdb_channel',            'Channel',                    'qdb_communication_channel', 'ApplicationRequired'),
  picklistAttr('qdb_language',           'Language',                   'qdb_language', 'ApplicationRequired'),
  strAttr('qdb_subject',                 'Subject',                    500),
  memoAttrN('qdb_body',                  'Body',                       100000, 'ApplicationRequired'),
  memoAttrN('qdb_placeholders',          'Placeholders',               4000),
  picklistAttr('qdb_customertype',       'Customer Type',              'qdb_customer_type'),
  picklistAttr('qdb_producttype',        'Product Type',               'qdb_product_type'),
  dtAttr('qdb_effectivefrom',            'Effective From'),
  dtAttr('qdb_effectiveto',              'Effective To'),
  picklistAttr('qdb_approvalstatus',     'Approval Status',            'qdb_approval_status', 'ApplicationRequired'),
  intAttr('qdb_version',                 'Version',                    'ApplicationRequired'),
  boolAttr('qdb_freetextallowed',        'Free Text Allowed',          'ApplicationRequired'),
  boolAttr('qdb_editingallowed',         'Editing Allowed',            'ApplicationRequired'),
  boolAttr('qdb_approvalrequired',       'Approval Required',          'ApplicationRequired'),
  boolAttr('qdb_attachmentsallowed',     'Attachments Allowed',        'ApplicationRequired'),
  strAttr('qdb_externaltemplateref',     'External Template Reference',100),
  boolAttr('qdb_isactive',               'Active',                     'ApplicationRequired'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 10–11. Platform configuration + mapping.
//    Entity/field bindings are LOGICAL-NAME STRINGS, following the Form Engine and Report Engine
//    precedent rather than lookups into the crmi_ metadata catalogue: the catalogue must be
//    populated per organisation and DCP cannot assume it exists on HL, BFD or an on-prem org
//    (Phase 1 §4 reuse assessment §3.2).
//    NEVER stores secrets, passwords or client secrets (MP §13).
// ─────────────────────────────────────────────────────────────────────────────
const platformConfigAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  picklistAttr('qdb_platformtype',       'Platform Type',              'qdb_platform_type', 'ApplicationRequired'),
  picklistAttr('qdb_organizationcode',   'Organization Code',          'qdb_organization_code', 'ApplicationRequired'),
  strAttr('qdb_environmentcode',         'Environment Code',           50),
  picklistAttr('qdb_customertype',       'Customer Type',              'qdb_customer_type', 'ApplicationRequired'),
  strAttr('qdb_customerentity',          'Customer Entity',            100, 'ApplicationRequired'),
  strAttr('qdb_customerprimaryid',       'Customer Primary ID',        100, 'ApplicationRequired'),
  strAttr('qdb_customerbusinessidfield', 'Customer Business ID Field', 100, 'ApplicationRequired'),
  strAttr('qdb_customerdisplaynamefield','Customer Display Name Field',100, 'ApplicationRequired'),
  strAttr('qdb_facilityentity',          'Facility Entity',            100),
  strAttr('qdb_facilityprimaryid',       'Facility Primary ID',        100),
  strAttr('qdb_facilitybusinessidfield', 'Facility Business ID Field', 100),
  strAttr('qdb_collectioncaseentity',    'Collection Case Entity',     100, 'ApplicationRequired'),
  strAttr('qdb_collectionactivityentity','Collection Activity Entity', 100, 'ApplicationRequired'),
  strAttr('qdb_smsentity',               'SMS Entity',                 100, 'ApplicationRequired'),
  strAttr('qdb_whatsappentity',          'WhatsApp Entity',            100, 'ApplicationRequired'),
  strAttr('qdb_emailentity',             'Email Entity',               100, 'ApplicationRequired'),
  picklistAttr('qdb_documentprovider',   'Document Provider',          'qdb_document_provider', 'ApplicationRequired'),
  boolAttr('qdb_misintegrationenabled',  'MIS Integration Enabled',    'ApplicationRequired'),
  picklistAttr('qdb_misprovider',        'MIS Provider',               'qdb_mis_provider', 'ApplicationRequired'),

  // Rule Engine ruleset POINTERS, not thresholds. Every DPD / arrears / grace / contact-hold value
  // lives inside the referenced ruleset, so HL and BFD differ by configuration with no code change.
  strAttr('qdb_eligibilityrulesetcode',  'Eligibility Ruleset Code',   100),
  strAttr('qdb_strategyrulesetcode',     'Strategy Ruleset Code',      100),
  strAttr('qdb_contactholdrulesetcode',  'Contact Hold Ruleset Code',  100),

  // Which MIS records are persisted as snapshots. NO production default in Phase 0 — the
  // deployment default is TBD pending volume validation (gate correction 3).
  picklistAttr('qdb_snapshotpolicy',     'Snapshot Policy',            'qdb_snapshot_policy'),

  memoAttrN('qdb_featureflags',          'Feature Flags',              100000),
  boolAttr('qdb_isactive',               'Active',                     'ApplicationRequired'),
];

const platformMappingAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  picklistAttr('qdb_businessobject',     'Business Object',            'qdb_business_object', 'ApplicationRequired'),
  strAttr('qdb_canonicalfield',          'Canonical Field',            100, 'ApplicationRequired'),
  strAttr('qdb_crmentitylogicalname',    'CRM Entity Logical Name',    100, 'ApplicationRequired'),
  strAttr('qdb_crmfieldlogicalname',     'CRM Field Logical Name',     100, 'ApplicationRequired'),
  strAttr('qdb_datatype',                'Data Type',                  50),
  boolAttr('qdb_isrequired',             'Required',                   'ApplicationRequired'),
  picklistAttr('qdb_accessmode',         'Access Mode',                'qdb_mapping_access', 'ApplicationRequired'),
  picklistAttr('qdb_source',             'Source',                     'qdb_mapping_source', 'ApplicationRequired'),
  boolAttr('qdb_isactive',               'Active',                     'ApplicationRequired'),
];

// ─────────────────────────────────────────────────────────────────────────────
// 12. Identity exception — MIS rows that cannot be safely resolved. Never creates a corrupt case.
// ─────────────────────────────────────────────────────────────────────────────
const identityExceptionAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  piiStrAttr('qdb_customerbusinessid',   'Customer Business ID',       50),
  strAttr('qdb_facilitynumber',          'Facility Number',            50),
  strAttr('qdb_source',                  'Source',                     50,  'ApplicationRequired'),
  picklistAttr('qdb_exceptionreason',    'Exception Reason',           'qdb_exception_reason', 'ApplicationRequired'),
  picklistAttr('qdb_exceptionstatus',    'Status',                     'qdb_exception_status', 'ApplicationRequired'),
  strAttr('qdb_sourcereference',         'Source Reference',           200),
  strAttr('qdb_integrationbatchid',      'Integration Batch ID',       100),
  strAttr('qdb_correlationid',           'Correlation ID',             100),
  dtAttr('qdb_receiveddate',             'Received Date',              'ApplicationRequired'),
  dtAttr('qdb_reviewdate',               'Review Date'),
  memoAttrN('qdb_resolution',            'Resolution',                 4000),
  strAttr('qdb_resolvedfacilitynumber',  'Resolved Facility Number',   50),
  memoAttrN('qdb_payload',               'Payload',                    100000),
];

// ─────────────────────────────────────────────────────────────────────────────
// 13. Consent — CONDITIONAL. Only provisioned if QDB has no existing consent / opt-out /
//     channel-permission capability (TBD — Requires QDB Confirmation).
// ─────────────────────────────────────────────────────────────────────────────
const consentAttrs = [
  strAttr('qdb_name',                    'Name',                       200, 'ApplicationRequired'),
  picklistAttr('qdb_channel',            'Channel',                    'qdb_communication_channel', 'ApplicationRequired'),
  picklistAttr('qdb_consentstatus',      'Consent Status',             'qdb_consent_status', 'ApplicationRequired'),
  picklistAttr('qdb_lawfulbasis',        'Lawful Basis',               'qdb_lawful_basis'),
  strAttr('qdb_source',                  'Source',                     100),
  dtAttr('qdb_recordedon',               'Recorded On',                'ApplicationRequired'),
];

// ─────────────────────────────────────────────────────────────────────────────
// Entity list, in creation order (no forward lookup dependencies).
// ─────────────────────────────────────────────────────────────────────────────
export const QDB_ENTITY_DEFS = [
  entityDef({
    logicalName: 'qdb_collectioncase', displayLabel: 'Collection Case', pluralLabel: 'Collection Cases',
    description: 'Operational Collection record — one active case per facility/account per delinquency episode.',
    primaryAttr: 'qdb_casenumber', ownershipType: 'UserOwned',
    hasActivities: true, isValidForQueue: true, attributes: caseAttrs,
  }),
  entityDef({
    logicalName: 'qdb_collectionactivity', displayLabel: 'Collection Activity', pluralLabel: 'Collection Activities',
    description: 'What Collections does: call, follow-up, meeting, payment request, PTP, field visit, recommendations, complaint.',
    ownershipType: 'UserOwned', isActivity: true, attributes: activityAttrs,
  }),
  entityDef({
    logicalName: 'qdb_delinquencysnapshot', displayLabel: 'Delinquency Snapshot', pluralLabel: 'Delinquency Snapshots',
    description: 'Append-only MIS observation history, including the Collection Eligibility decision.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: snapshotAttrs,
  }),
  entityDef({
    logicalName: 'qdb_collectionactivitytype', displayLabel: 'Collection Activity Type', pluralLabel: 'Collection Activity Types',
    description: 'Configurable activity taxonomy with Form/Process/Rule Engine references.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: activityTypeAttrs,
  }),
  entityDef({
    logicalName: 'qdb_activityoutcome', displayLabel: 'Activity Outcome', pluralLabel: 'Activity Outcomes',
    description: 'Outcome/reason per activity type, with follow-up and escalation behaviour.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: activityOutcomeAttrs,
  }),
  entityDef({
    logicalName: 'qdb_collectionstrategy', displayLabel: 'Collection Strategy', pluralLabel: 'Collection Strategies',
    description: 'Which treatment applies — configurable criteria, no threshold in application source.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: strategyAttrs,
  }),
  entityDef({
    logicalName: 'qdb_strategyaction', displayLabel: 'Strategy Action', pluralLabel: 'Strategy Actions',
    description: 'What happens, in sequence, for a strategy.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: strategyActionAttrs,
  }),
  entityDef({
    logicalName: 'qdb_assignmentconfiguration', displayLabel: 'Assignment Configuration', pluralLabel: 'Assignment Configurations',
    description: 'DCP-specific assignment configuration. Delegates to QDB Smart Assignment; not a generic assignment engine.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: assignmentAttrs,
  }),
  entityDef({
    logicalName: 'qdb_communicationtemplate', displayLabel: 'Communication Template', pluralLabel: 'Communication Templates',
    description: 'CONDITIONAL — only if the existing qdb_emailtemplate / EmailEditor cannot serve. Channel/language templates with placeholders.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: templateAttrs,
  }),
  entityDef({
    logicalName: 'qdb_platformconfiguration', displayLabel: 'Platform Configuration', pluralLabel: 'Platform Configurations',
    description: 'One active row per deployment: platform, organisation, entity bindings, providers, ruleset pointers, flags. Never secrets.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: platformConfigAttrs,
  }),
  entityDef({
    logicalName: 'qdb_platformmapping', displayLabel: 'Platform Mapping', pluralLabel: 'Platform Mappings',
    description: 'Canonical Collection field to physical CRM entity/field binding, by logical name.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: platformMappingAttrs,
  }),
  entityDef({
    logicalName: 'qdb_identityexception', displayLabel: 'Identity Exception', pluralLabel: 'Identity Exceptions',
    description: 'MIS records that cannot be resolved to an existing customer/facility; resolved under control.',
    primaryAttr: 'qdb_name', ownershipType: 'UserOwned', attributes: identityExceptionAttrs,
  }),
];

/**
 * CONDITIONAL entity — provisioned only if QDB confirms no existing consent capability serves.
 * Kept out of QDB_ENTITY_DEFS so a default provisioning run cannot create it by accident.
 */
export const QDB_CONDITIONAL_ENTITY_DEFS = [
  entityDef({
    logicalName: 'qdb_consent', displayLabel: 'Consent', pluralLabel: 'Consents',
    description: 'CONDITIONAL — PDPPL consent per customer per channel, only if no existing QDB capability serves.',
    primaryAttr: 'qdb_name', ownershipType: 'OrganizationOwned', attributes: consentAttrs,
  }),
];

/**
 * Customer lookups — created with the CreateCustomerRelationships action, not as attributes.
 * ONE canonical column serves HL (contact) and BFD (account) with no branch in Collection logic.
 */
export const QDB_CUSTOMER_LOOKUPS = [
  customerLookup({
    referencing: 'qdb_collectioncase', lookupLogical: 'qdb_customerid', lookupLabel: 'Customer',
    relPrefix: 'qdb_collectioncase_customer', req: 'ApplicationRequired',
  }),
  customerLookup({
    referencing: 'qdb_identityexception', lookupLogical: 'qdb_resolvedcustomerid', lookupLabel: 'Resolved Customer',
    relPrefix: 'qdb_identityexception_resolvedcustomer',
  }),
  customerLookup({
    referencing: 'qdb_consent', lookupLogical: 'qdb_customerid', lookupLabel: 'Customer',
    relPrefix: 'qdb_consent_customer', req: 'ApplicationRequired',
  }),
];

/**
 * Ordinary lookups, created after both entities exist (/RelationshipDefinitions).
 * Every one of these targets a qdb_ entity or a system entity present on both platforms —
 * none targets an organisation-specific facility entity.
 */
export const QDB_LOOKUPS = [
  oneToMany({ schemaName: 'qdb_collectioncase_strategy', referencing: 'qdb_collectioncase', referenced: 'qdb_collectionstrategy', lookupLogical: 'qdb_strategyid', lookupLabel: 'Current Strategy' }),
  oneToMany({ schemaName: 'qdb_collectioncase_assignedteam', referencing: 'qdb_collectioncase', referenced: 'team', lookupLogical: 'qdb_assignedteamid', lookupLabel: 'Assigned Team' }),

  oneToMany({ schemaName: 'qdb_collectionactivity_case', referencing: 'qdb_collectionactivity', referenced: 'qdb_collectioncase', lookupLogical: 'qdb_collectioncaseid', lookupLabel: 'Collection Case', req: 'ApplicationRequired' }),
  oneToMany({ schemaName: 'qdb_collectionactivity_type', referencing: 'qdb_collectionactivity', referenced: 'qdb_collectionactivitytype', lookupLogical: 'qdb_activitytypeid', lookupLabel: 'Activity Type', req: 'ApplicationRequired' }),
  oneToMany({ schemaName: 'qdb_collectionactivity_outcome', referencing: 'qdb_collectionactivity', referenced: 'qdb_activityoutcome', lookupLogical: 'qdb_outcomeid', lookupLabel: 'Outcome' }),

  // Snapshot -> case is OPTIONAL: a GraceMonitor / exception observation has no case.
  oneToMany({ schemaName: 'qdb_delinquencysnapshot_case', referencing: 'qdb_delinquencysnapshot', referenced: 'qdb_collectioncase', lookupLogical: 'qdb_collectioncaseid', lookupLabel: 'Collection Case' }),

  oneToMany({ schemaName: 'qdb_activityoutcome_type', referencing: 'qdb_activityoutcome', referenced: 'qdb_collectionactivitytype', lookupLogical: 'qdb_activitytypeid', lookupLabel: 'Activity Type', req: 'ApplicationRequired' }),

  oneToMany({ schemaName: 'qdb_strategyaction_strategy', referencing: 'qdb_strategyaction', referenced: 'qdb_collectionstrategy', lookupLogical: 'qdb_strategyid', lookupLabel: 'Strategy', req: 'ApplicationRequired' }),
  oneToMany({ schemaName: 'qdb_strategyaction_activitytype', referencing: 'qdb_strategyaction', referenced: 'qdb_collectionactivitytype', lookupLogical: 'qdb_activitytypeid', lookupLabel: 'Activity Type' }),
  oneToMany({ schemaName: 'qdb_strategyaction_assignmentconfig', referencing: 'qdb_strategyaction', referenced: 'qdb_assignmentconfiguration', lookupLogical: 'qdb_assignmentconfigurationid', lookupLabel: 'Assignment Configuration' }),
  oneToMany({ schemaName: 'qdb_strategyaction_template', referencing: 'qdb_strategyaction', referenced: 'qdb_communicationtemplate', lookupLogical: 'qdb_communicationtemplateid', lookupLabel: 'Communication Template' }),

  oneToMany({ schemaName: 'qdb_assignmentconfiguration_team', referencing: 'qdb_assignmentconfiguration', referenced: 'team', lookupLogical: 'qdb_targetteamid', lookupLabel: 'Target Team' }),
  oneToMany({ schemaName: 'qdb_assignmentconfiguration_defaultuser', referencing: 'qdb_assignmentconfiguration', referenced: 'systemuser', lookupLogical: 'qdb_defaultuserid', lookupLabel: 'Default User' }),

  oneToMany({ schemaName: 'qdb_communicationtemplate_activitytype', referencing: 'qdb_communicationtemplate', referenced: 'qdb_collectionactivitytype', lookupLogical: 'qdb_activitytypeid', lookupLabel: 'Activity Type' }),
  oneToMany({ schemaName: 'qdb_communicationtemplate_strategy', referencing: 'qdb_communicationtemplate', referenced: 'qdb_collectionstrategy', lookupLogical: 'qdb_strategyid', lookupLabel: 'Strategy' }),

  oneToMany({ schemaName: 'qdb_platformmapping_config', referencing: 'qdb_platformmapping', referenced: 'qdb_platformconfiguration', lookupLogical: 'qdb_platformconfigurationid', lookupLabel: 'Platform Configuration', req: 'ApplicationRequired' }),

  oneToMany({ schemaName: 'qdb_identityexception_reviewedby', referencing: 'qdb_identityexception', referenced: 'systemuser', lookupLogical: 'qdb_reviewedbyid', lookupLabel: 'Reviewed By' }),
  oneToMany({ schemaName: 'qdb_consent_recordedby', referencing: 'qdb_consent', referenced: 'systemuser', lookupLogical: 'qdb_recordedbyid', lookupLabel: 'Recorded By', req: 'ApplicationRequired' }),
];

/**
 * ⚠️  OPTIONAL PER-DEPLOYMENT EXTENSION — NOT part of the shared canonical schema.
 *
 * A Dynamics lookup's target entity is FIXED METADATA: it cannot vary at runtime through Platform
 * Mapping. An HL-targeted and a BFD-targeted `qdb_facilityid` are therefore TWO DIFFERENT PHYSICAL
 * RELATIONSHIPS that merely share a column name — they are not one shared schema.
 *
 * The canonical Collection contract is `qdb_facilitynumber` + `qdb_facilitysourcesystem`, which is
 * always present and always sufficient. An organisation MAY additionally deploy a physical lookup
 * for native navigation; if it does, that is a deployment extension and nothing in React, the Rule
 * Engine, Collection Services or MIS processing may depend on it or branch on its target.
 *
 * Core provisioning MUST NOT call this. Target entity per organisation:
 *   HL  Facility Entity = TBD — Requires QDB Confirmation
 *   BFD Collection Facility/Account Target = likely `qdb_account`, TBD — Requires QDB Confirmation
 *
 * @param {string} facilityEntityLogicalName confirmed facility entity for THIS deployment
 */
export function OPTIONAL_FACILITY_LOOKUP_EXTENSION(facilityEntityLogicalName) {
  if (!facilityEntityLogicalName) {
    throw new Error(
      'OPTIONAL_FACILITY_LOOKUP_EXTENSION requires the confirmed facility entity logical name for ' +
      'this deployment. It is TBD — Requires QDB Confirmation for both HL and BFD, and the canonical ' +
      'contract (qdb_facilitynumber + qdb_facilitysourcesystem) works without it.',
    );
  }
  return oneToMany({
    schemaName: `qdb_collectioncase_facility_${facilityEntityLogicalName}`,
    referencing: 'qdb_collectioncase',
    referenced: facilityEntityLogicalName,
    lookupLogical: 'qdb_facilityid',
    lookupLabel: 'Facility',
  });
}

/**
 * Alternate keys. `qdb_snapshotkey` gives replay idempotency, but its COMPOSITION is provisional —
 * the final physical rule is TBD — Requires QDB/MIS Confirmation (gate correction 2).
 */
export const QDB_ALT_KEYS = [
  { entity: 'qdb_delinquencysnapshot', schemaName: 'qdb_snapshotkey_uk', displayName: 'Snapshot Key', attributes: ['qdb_snapshotkey'] },
  { entity: 'qdb_collectionactivitytype', schemaName: 'qdb_activitytypecode_uk', displayName: 'Activity Type Code', attributes: ['qdb_code'] },
  { entity: 'qdb_collectioncase', schemaName: 'qdb_casenumber_uk', displayName: 'Case Number', attributes: ['qdb_casenumber'] },
];
