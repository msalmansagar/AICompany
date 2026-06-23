// BRD FR-SCHEMA-002: qdb_portal_reset_tokens
// Primary name: auto-name (qdb_portal_reset_tokenid)
// BRD-authoritative: qdb_user_id is a plain string (not a lookup) — the adapter
// filters by string value directly via OData.
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, booleanField } from './shared.js';

export const portalResetTokensDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Reset_Tokens',
  DisplayName: label('Portal Reset Token'),
  DisplayCollectionName: label('Portal Reset Tokens'),
  Description: label('Password reset tokens for the citizen portal.'),
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
      DisplayName: label('Token Reference'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_TokenHash',
      LogicalName: 'qdb_token_hash',
      DisplayName: label('Token Hash'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 1000,
    },
    {
      // Plain string — not a lookup. BRD FR-SCHEMA-002 explicitly states:
      // "stores the portal user GUID as a plain string — not a Dataverse lookup"
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_UserId',
      LogicalName: 'qdb_user_id',
      DisplayName: label('User ID'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: 'qdb_ExpiresOn',
      LogicalName: 'qdb_expires_on',
      DisplayName: label('Expires On'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      DateTimeBehavior: { Value: 'UserLocal' },
    },
    {
      ...booleanField('qdb_Used', 'qdb_used', 'Used', false),
      RequiredLevel: requiredLevel('ApplicationRequired'),
    },
  ],
};
