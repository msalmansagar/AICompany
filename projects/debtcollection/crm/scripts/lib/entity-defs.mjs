/**
 * entity-defs.mjs
 * All 11 Phase 1 entity definitions (non-lookup attributes only).
 * Lookup relationships are provisioned separately in relationship-defs.mjs.
 * Entities are listed in creation order (no forward-lookup dependencies).
 *
 * Dataverse Web API requirement (different from the Organization Service SDK):
 * Primary name attribute is identified by IsPrimaryName: true inside the
 * Attributes array. There is no top-level PrimaryAttribute property on the
 * EntityMetadata OData resource type.
 *
 * For IsActivity=true entities the primary attribute is the activity subject
 * (added by activitySubjectAttr); other activity columns are passed as-is.
 */
import { strAttr, memoAttr, intAttr, moneyAttr, boolAttr, dtAttr, picklistAttr, piiStrAttr } from './attr-builders.mjs';
import { label1033 } from './labels.mjs';

/**
 * Builds the EntityMetadata body for a POST to /EntityDefinitions.
 * For regular entities, marks the primary name attribute IsPrimaryName: true.
 * For activity entities, subject is auto-created — other attrs are passed as-is.
 * @param {object} params
 */
/**
 * The platform requires a primary attribute on CreateEntity even for activities; it must be
 * the activity subject (SchemaName Subject), which the SDK sample also passes explicitly.
 */
function activitySubjectAttr() {
  return { ...strAttr('subject', 'Subject', 200, 'ApplicationRequired'), SchemaName: 'Subject', IsPrimaryName: true };
}

function entityDef({ logicalName, displayLabel, pluralLabel, description, primaryAttr,
                      ownershipType, isActivity, hasNotes, hasActivities, attributes }) {
  const finalAttrs = isActivity
    ? [activitySubjectAttr(), ...attributes]
    : attributes.map(a => a.LogicalName === primaryAttr ? { ...a, IsPrimaryName: true } : a);
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
    Attributes: finalAttrs,
  };
}

// -- 1. Customer master --------------------------------------------------------
const customerAttrs = [
  strAttr('msst_fullname',          'Full Name',            300, 'ApplicationRequired'),
  strAttr('msst_qid',               'Qatar ID (QID)',        50),
  strAttr('msst_crnumber',          'CR Number',             50),
  strAttr('msst_nationality',       'Nationality',          100),
  strAttr('msst_employer',          'Employer',             200),
  piiStrAttr('msst_mobile',         'Mobile',               50),
  piiStrAttr('msst_email',          'Email',               200),
  piiStrAttr('msst_address',        'Address',             500),
  boolAttr('msst_salarytransfer',   'Salary Transfer'),
  boolAttr('msst_vulnerabilityflag','Vulnerability Flag'),
  boolAttr('msst_stopcontact',      'Stop Contact'),
  boolAttr('msst_deceasedflag',     'Deceased Flag'),
  dtAttr('msst_dateofdeath',        'Date of Death'),
  strAttr('msst_deathsource',       'Death Source',         200),
  picklistAttr('msst_preferredlanguage', 'Preferred Language', 'msst_dcppreferredlanguage'),
];

// -- 2. Strategy config (config table -- OrganizationOwned) --------------------
const strategyAttrs = [
  strAttr('msst_name',          'Strategy Rule Name', 200, 'ApplicationRequired'),
  picklistAttr('msst_dpdbucket','DPD Bucket',         'msst_dcpdpdbucket',          'ApplicationRequired'),
  picklistAttr('msst_segment',  'Segment',            'msst_dcpsegment'),
  picklistAttr('msst_actiontype','Action Type',       'msst_dcpstrategyactiontype', 'ApplicationRequired'),
  strAttr('msst_queueref',      'Queue Reference',    100),
  intAttr('msst_slahours',      'SLA Hours'),
  boolAttr('msst_active',       'Active'),
];

// -- 3. Identity exception queue -----------------------------------------------
const identityExcAttrs = [
  strAttr('msst_name',         'Exception Name',      200, 'ApplicationRequired'),
  strAttr('msst_qid',          'QID',                 50),
  picklistAttr('msst_reason',  'Reason',              'msst_dcpexceptionreason'),
  picklistAttr('msst_exceptionstatus', 'Status',      'msst_dcpexceptionstatus'),
  strAttr('msst_reviewedby',   'Reviewed By',         200),
];

// -- 4. Loan facility ----------------------------------------------------------
const facilityAttrs = [
  strAttr('msst_name',             'Facility Name',     200, 'ApplicationRequired'),
  picklistAttr('msst_producttype', 'Product Type',      'msst_dcpproducttype'),
  moneyAttr('msst_outstandingbalance', 'Outstanding Balance'),
  moneyAttr('msst_arrears',        'Arrears'),
  moneyAttr('msst_instalment',     'Instalment'),
  intAttr('msst_dpd',              'Days Past Due'),
  picklistAttr('msst_dpdbucket',   'DPD Bucket',        'msst_dcpdpdbucket'),
  picklistAttr('msst_accountstatus','Account Status',   'msst_dcpaccountstatus'),
  dtAttr('msst_maturitydate',      'Maturity Date'),
  strAttr('msst_collateral',       'Collateral',       500),
  strAttr('msst_guarantor',        'Guarantor',        200),
  boolAttr('msst_restructureflag', 'Restructure Flag'),
  picklistAttr('msst_org',         'Org Instance',      'msst_dcporg'),
];

// -- 5. Delinquency snapshot (append-only) ------------------------------------
const snapshotAttrs = [
  strAttr('msst_name',           'Snapshot Name',     200, 'ApplicationRequired'),
  strAttr('msst_batchreference', 'Batch Reference',   100, 'ApplicationRequired'),
  dtAttr('msst_asof',            'As Of',                  'ApplicationRequired'),
  intAttr('msst_dpd',            'Days Past Due'),
  moneyAttr('msst_arrears',      'Arrears'),
  moneyAttr('msst_outstandingbalance', 'Outstanding Balance'),
  picklistAttr('msst_dpdbucket', 'DPD Bucket',        'msst_dcpdpdbucket'),
];

// -- 6. Collection case --------------------------------------------------------
const caseAttrs = [
  strAttr('msst_name',           'Case Name',         200, 'ApplicationRequired'),
  picklistAttr('msst_producttype','Product Type',     'msst_dcpproducttype'),
  strAttr('msst_casereason',     'Case Reason',       500, 'ApplicationRequired'),
  picklistAttr('msst_org',       'Org Instance',      'msst_dcporg'),
];

// -- 7. PTP record -------------------------------------------------------------
const ptpAttrs = [
  strAttr('msst_name',              'PTP Name',        200, 'ApplicationRequired'),
  dtAttr('msst_ptpdate',            'PTP Date',              'ApplicationRequired'),
  moneyAttr('msst_promisedamount',  'Promised Amount'),
  boolAttr('msst_partialflag',      'Partial Payment'),
  dtAttr('msst_reminderdate',       'Reminder Date'),
  intAttr('msst_reschedulecount',   'Reschedule Count'),
];

// -- 8. Consent record ---------------------------------------------------------
const consentAttrs = [
  strAttr('msst_name',              'Consent Record',  200, 'ApplicationRequired'),
  picklistAttr('msst_channel',      'Channel',         'msst_dcpchannel',          'ApplicationRequired'),
  picklistAttr('msst_consentstatus','Consent Status',  'msst_dcpconsentstatus',     'ApplicationRequired'),
  picklistAttr('msst_lawfulbasis',  'Lawful Basis',    'msst_dcplawfulbasis'),
  strAttr('msst_source',            'Source',          200),
  strAttr('msst_recordedby',        'Recorded By',     200),
  dtAttr('msst_recordedon',         'Recorded On'),
];

// -- 9. Audit log (append-only) ------------------------------------------------
const auditAttrs = [
  strAttr('msst_name',          'Audit Entry',         200, 'ApplicationRequired'),
  strAttr('msst_auditaction',   'Action Type',          50, 'ApplicationRequired'),
  strAttr('msst_entityname',    'Entity Name',          100),
  strAttr('msst_recordid',      'Record ID',             50),
  memoAttr('msst_oldvalue',     'Old Value'),
  memoAttr('msst_newvalue',     'New Value'),
  strAttr('msst_actor',         'Actor',               200),
  strAttr('msst_actorrole',     'Actor Role',          200),
  dtAttr('msst_timestamp',      'Timestamp'),
  strAttr('msst_sourcepath',    'Source Path',         500),
  strAttr('msst_correlationid', 'Correlation ID',      100),
];

// -- 10. Collection action (custom activity) -----------------------------------
// subject, scheduledend, statecode, createdon etc are auto-created for IsActivity=true
const collectionActionAttrs = [
  picklistAttr('msst_actiontype',   'Action Type',     'msst_dcpactiontype'),
  picklistAttr('msst_outcomecode',  'Outcome Code',    'msst_dcpactiontype'),
  memoAttr('msst_notes',            'Notes'),
];

// -- 11. Communication (custom activity) --------------------------------------
const communicationAttrs = [
  picklistAttr('msst_channel',       'Channel',          'msst_dcpchannel'),
  picklistAttr('msst_commdirection', 'Direction',        'msst_dcpcommdirection'),
  strAttr('msst_templateref',        'Template Reference', 200),
  picklistAttr('msst_deliverystatus','Delivery Status',  'msst_dcpdeliverystatus'),
  strAttr('msst_blockreason',        'Block Reason',     500),
];

// -- All entity definitions in dependency order --------------------------------
export const ENTITY_DEFS = [
  entityDef({ logicalName: 'msst_dcpcustomer',         displayLabel: 'DCP Customer',
    pluralLabel: 'DCP Customers',       description: 'Customer master for debt collection (FR-007)',
    primaryAttr: 'msst_fullname',       ownershipType: 'UserOwned',
    hasActivities: true,                attributes: customerAttrs }),

  entityDef({ logicalName: 'msst_dcpstrategyconfig',   displayLabel: 'DCP Strategy Config',
    pluralLabel: 'DCP Strategy Configs', description: 'DPD-bucket strategy rules (FR-031)',
    primaryAttr: 'msst_name',           ownershipType: 'OrganizationOwned',
    attributes: strategyAttrs }),

  entityDef({ logicalName: 'msst_dcpidentityexception', displayLabel: 'DCP Identity Exception',
    pluralLabel: 'DCP Identity Exceptions', description: 'Unresolved-identity queue (FR-007)',
    primaryAttr: 'msst_name',            ownershipType: 'UserOwned',
    attributes: identityExcAttrs }),

  entityDef({ logicalName: 'msst_dcploanfacility',     displayLabel: 'DCP Loan Facility',
    pluralLabel: 'DCP Loan Facilities', description: 'Loan facility master (FR-002)',
    primaryAttr: 'msst_name',           hasActivities: true, ownershipType: 'UserOwned',
    attributes: facilityAttrs }),

  entityDef({ logicalName: 'msst_dcpdelinquencysnapshot', displayLabel: 'DCP Delinquency Snapshot',
    pluralLabel: 'DCP Delinquency Snapshots', description: 'Append-only MIS snapshot (FR-016)',
    primaryAttr: 'msst_name',               ownershipType: 'OrganizationOwned',
    attributes: snapshotAttrs }),

  entityDef({ logicalName: 'msst_dcpcollectioncase',   displayLabel: 'DCP Collection Case',
    pluralLabel: 'DCP Collection Cases', description: 'Manual collection case (FR-019)',
    primaryAttr: 'msst_name',            ownershipType: 'UserOwned',
    hasActivities: true,                 attributes: caseAttrs }),

  entityDef({ logicalName: 'msst_dcpptprecord',        displayLabel: 'DCP PTP Record',
    pluralLabel: 'DCP PTP Records',     description: 'Promise-to-pay record (FR-055)',
    primaryAttr: 'msst_name',           ownershipType: 'UserOwned',
    attributes: ptpAttrs }),

  entityDef({ logicalName: 'msst_dcpconsent',          displayLabel: 'DCP Consent',
    pluralLabel: 'DCP Consents',        description: 'PDPPL consent per customer per channel (FR-133)',
    primaryAttr: 'msst_name',           ownershipType: 'OrganizationOwned',
    attributes: consentAttrs }),

  entityDef({ logicalName: 'msst_dcpauditlog',         displayLabel: 'DCP Audit Log',
    pluralLabel: 'DCP Audit Logs',      description: 'Append-only plugin-written audit (FR-108)',
    primaryAttr: 'msst_name',           ownershipType: 'OrganizationOwned',
    attributes: auditAttrs }),

  entityDef({ logicalName: 'msst_dcpcollectionaction', displayLabel: 'DCP Collection Action',
    pluralLabel: 'DCP Collection Actions', description: 'Custom activity: call/meeting/visit/note (FR-045). IsActivity=true',
    primaryAttr: 'subject',             ownershipType: 'UserOwned',
    isActivity: true,                   hasNotes: true,
    attributes: collectionActionAttrs }),

  entityDef({ logicalName: 'msst_dcpcommunication',    displayLabel: 'DCP Communication',
    pluralLabel: 'DCP Communications',  description: 'Custom activity: SMS/email/letter/call log (FR-065). IsActivity=true',
    primaryAttr: 'subject',             ownershipType: 'UserOwned',
    isActivity: true,                   attributes: communicationAttrs }),
];
