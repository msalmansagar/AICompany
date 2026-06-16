// BRD FR-SCHEMA-009: qdb_portal_requests
// Primary name: qdb_reference_number (BRD-authoritative)
// CRITICAL: qdb_user_id is a plain string, NOT a lookup.
// BRD: "portal user GUID stored as plain string — used in OData filter: qdb_user_id eq '<userId>'"
// qdb_service_code, qdb_service_title, qdb_form_data are BRD-authoritative field names.
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, globalPicklist } from './shared.js';

export const portalRequestsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Requests',
  DisplayName: label('Portal Request'),
  DisplayCollectionName: label('Portal Requests'),
  Description: label('Citizen service requests submitted through the portal.'),
  OwnershipType: 'UserOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_reference_number',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_ReferenceNumber',
      LogicalName: 'qdb_reference_number',
      DisplayName: label('Reference Number'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100,
    },
    {
      // Plain string — not a lookup. BRD FR-SCHEMA-009 authoritative.
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_UserId',
      LogicalName: 'qdb_user_id',
      DisplayName: label('User ID'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_ServiceCode',
      LogicalName: 'qdb_service_code',
      DisplayName: label('Service Code'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_ServiceTitle',
      LogicalName: 'qdb_service_title',
      DisplayName: label('Service Title'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 255,
    },
    {
      ...globalPicklist('qdb_Status', 'qdb_status', 'Request Status', 'qdb_request_status'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      DefaultFormValue: 860000001,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_FormData',
      LogicalName: 'qdb_form_data',
      DisplayName: label('Form Data (JSON)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100000,
    },
  ],
};
