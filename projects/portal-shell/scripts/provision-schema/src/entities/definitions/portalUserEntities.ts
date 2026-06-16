// BRD FR-SCHEMA-015: qdb_portal_user_entities
// Primary name: auto-name (qdb_portal_user_entityid) — BRD-authoritative.
// qdb_user_id: plain string (BRD: "stored as plain string — used in filter: qdb_user_id eq '<id>'")
// qdb_account_id: Lookup to OOB account entity (EntityService expands to get name, etc.)
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, requiredLookup } from './shared.js';

export const portalUserEntitiesDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_User_Entities',
  DisplayName: label('Portal User Entity'),
  DisplayCollectionName: label('Portal User Entities'),
  Description: label('Junction table linking portal users to Dataverse account records for the entity switcher.'),
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
      DisplayName: label('Association Label'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 200,
    },
    {
      // Plain string — BRD FR-SCHEMA-015: "portal user GUID stored as plain string"
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_UserId',
      LogicalName: 'qdb_user_id',
      DisplayName: label('User ID'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    requiredLookup('qdb_AccountId', 'qdb_account_id', 'Account', ['account']),
  ],
};
