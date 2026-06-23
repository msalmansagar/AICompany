// BRD FR-SCHEMA-011: qdb_portal_request_documents
// Primary name: qdb_name (BRD-authoritative; display name of the uploaded document)
// Lookup: qdb_request_id → qdb_portal_requests (Batch C, created after Batch B)
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, requiredLookup } from './shared.js';

export const portalRequestDocumentsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Request_Documents',
  DisplayName: label('Portal Request Document'),
  DisplayCollectionName: label('Portal Request Documents'),
  Description: label('Documents uploaded by citizens in support of a portal request.'),
  OwnershipType: 'UserOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_name',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Name',
      LogicalName: 'qdb_name',
      DisplayName: label('Document Name'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 255,
    },
    requiredLookup('qdb_RequestId', 'qdb_request_id', 'Request', ['qdb_portal_requests']),
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Url',
      LogicalName: 'qdb_url',
      DisplayName: label('Document URL'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 500,
    },
  ],
};
