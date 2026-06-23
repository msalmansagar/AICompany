// BRD FR-SCHEMA-010: qdb_portal_request_timelines
// Append-only — C-SCHEMA-003 enforced at security role level.
// Primary name: qdb_status (BRD-authoritative; status label at the time of the event)
// CRITICAL: qdb_status here is a plain String (denormalised label), NOT a picklist.
// BRD FR-SCHEMA-010: "Single line of text (100), required — denormalised status label"
// Lookup: qdb_request_id → qdb_portal_requests (Batch C, created after Batch B)
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, requiredLookup } from './shared.js';

export const portalRequestTimelinesDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Request_Timelines',
  DisplayName: label('Portal Request Timeline'),
  DisplayCollectionName: label('Portal Request Timelines'),
  Description: label('Append-only audit trail of status changes for portal requests.'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_status',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Status',
      LogicalName: 'qdb_status',
      DisplayName: label('Status Label'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    requiredLookup('qdb_RequestId', 'qdb_request_id', 'Request', ['qdb_portal_requests']),
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_Note',
      LogicalName: 'qdb_note',
      DisplayName: label('Note'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 4000,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_ChangedBy',
      LogicalName: 'qdb_changed_by',
      DisplayName: label('Changed By'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 255,
    },
  ],
};
