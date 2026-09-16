/**
 * relationship-defs.mjs
 * All 1:N lookup relationship definitions for Phase 1 entities.
 * These are created after all entities exist.
 */
import { label1033, emptyLabel } from './labels.mjs';

const NO_CASCADE = { NoCascade: 'NoCascade' };

/**
 * Builds a OneToManyRelationshipMetadata definition.
 * @param {object} p
 */
function oneToMany({ schemaName, referencedEntity, referencingEntity,
                     lookupLogical, lookupLabel, required = false }) {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata',
    SchemaName: schemaName,
    ReferencedEntity: referencedEntity,
    ReferencingEntity: referencingEntity,
    Lookup: {
      '@odata.type': 'Microsoft.Dynamics.CRM.LookupAttributeMetadata',
      AttributeType: 'Lookup',
      AttributeTypeName: { Value: 'LookupType' },
      SchemaName: lookupLogical,
      LogicalName: lookupLogical,
      DisplayName: label1033(lookupLabel),
      Description: emptyLabel(),
      RequiredLevel: { Value: required ? 'ApplicationRequired' : 'None' },
    },
    AssociatedMenuConfiguration: {
      '@odata.type': 'Microsoft.Dynamics.CRM.AssociatedMenuConfiguration',
      Behavior: 'UseCollectionName',
      Group: 'Details',
      Order: 10000,
    },
    CascadeConfiguration: {
      '@odata.type': 'Microsoft.Dynamics.CRM.CascadeConfiguration',
      Assign:   'NoCascade',
      Delete:   'RemoveLink',
      Merge:    'NoCascade',
      Reparent: 'NoCascade',
      Share:    'NoCascade',
      Unshare:  'NoCascade',
    },
  };
}

// ── Loan facility → Customer ──────────────────────────────────────────────────
const facilityToCustomer = oneToMany({
  schemaName:       'msst_dcpcustomer_msst_dcploanfacility',
  referencedEntity: 'msst_dcpcustomer',
  referencingEntity:'msst_dcploanfacility',
  lookupLogical:    'msst_customerid',
  lookupLabel:      'Customer',
  required:         true,
});

// ── Delinquency snapshot → Facility ──────────────────────────────────────────
const snapshotToFacility = oneToMany({
  schemaName:       'msst_dcploanfacility_msst_dcpdelinquencysnapshot',
  referencedEntity: 'msst_dcploanfacility',
  referencingEntity:'msst_dcpdelinquencysnapshot',
  lookupLogical:    'msst_facilityid',
  lookupLabel:      'Loan Facility',
  required:         true,
});

// ── Collection case → Customer ────────────────────────────────────────────────
const caseToCustomer = oneToMany({
  schemaName:       'msst_dcpcustomer_msst_dcpcollectioncase',
  referencedEntity: 'msst_dcpcustomer',
  referencingEntity:'msst_dcpcollectioncase',
  lookupLogical:    'msst_customerid',
  lookupLabel:      'Customer',
  required:         false,
});

// ── Collection case → Facility ────────────────────────────────────────────────
const caseToFacility = oneToMany({
  schemaName:       'msst_dcploanfacility_msst_dcpcollectioncase',
  referencedEntity: 'msst_dcploanfacility',
  referencingEntity:'msst_dcpcollectioncase',
  lookupLogical:    'msst_facilityid',
  lookupLabel:      'Loan Facility',
  required:         false,
});

// ── PTP record → Customer ─────────────────────────────────────────────────────
const ptpToCustomer = oneToMany({
  schemaName:       'msst_dcpcustomer_msst_dcpptprecord',
  referencedEntity: 'msst_dcpcustomer',
  referencingEntity:'msst_dcpptprecord',
  lookupLogical:    'msst_customerid',
  lookupLabel:      'Customer',
  required:         false,
});

// ── PTP record → Case ─────────────────────────────────────────────────────────
const ptpToCase = oneToMany({
  schemaName:       'msst_dcpcollectioncase_msst_dcpptprecord',
  referencedEntity: 'msst_dcpcollectioncase',
  referencingEntity:'msst_dcpptprecord',
  lookupLogical:    'msst_caseid',
  lookupLabel:      'Collection Case',
  required:         false,
});

// ── Consent → Customer ────────────────────────────────────────────────────────
const consentToCustomer = oneToMany({
  schemaName:       'msst_dcpcustomer_msst_dcpconsent',
  referencedEntity: 'msst_dcpcustomer',
  referencingEntity:'msst_dcpconsent',
  lookupLogical:    'msst_customerid',
  lookupLabel:      'Customer',
  required:         true,
});

export const RELATIONSHIP_DEFS = [
  facilityToCustomer,
  snapshotToFacility,
  caseToCustomer,
  caseToFacility,
  ptpToCustomer,
  ptpToCase,
  consentToCustomer,
];
