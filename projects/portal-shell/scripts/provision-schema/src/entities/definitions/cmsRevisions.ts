// BRD FR-SCHEMA-014: qdb_cms_revisions
// Append-only (FIFO cap of 10 is enforced in application code, not schema).
// Primary name: auto-name (qdb_cms_revisionid) — BRD-authoritative.
// Lookup: qdb_content_id → qdb_cms_contents (Batch C, created after Batch B)
// BRD field: qdb_saved_by is a plain string (display name of editor), NOT a lookup.
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, requiredLookup } from './shared.js';

export const cmsRevisionsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Cms_Revisions',
  DisplayName: label('CMS Revision'),
  DisplayCollectionName: label('CMS Revisions'),
  Description: label('Point-in-time HTML body snapshots for CMS content version history.'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_name',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Name',
      LogicalName: 'qdb_name',
      DisplayName: label('Revision Name'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    requiredLookup('qdb_ContentId', 'qdb_content_id', 'Content', ['qdb_cms_contents']),
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_BodyHtml',
      LogicalName: 'qdb_body_html',
      DisplayName: label('Body HTML Snapshot (EN)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100000,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_BodyHtmlAr',
      LogicalName: 'qdb_body_html_ar',
      DisplayName: label('Body HTML Snapshot (AR)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100000,
    },
    {
      // Plain string — display name of the CMS editor. BRD FR-SCHEMA-014 authoritative.
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_SavedBy',
      LogicalName: 'qdb_saved_by',
      DisplayName: label('Saved By'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 255,
    },
  ],
};
