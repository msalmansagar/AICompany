// BRD FR-SCHEMA-003: qdb_portal_revoked_tokens
// Append-only — C-SCHEMA-003 enforced at security role level (no Update, no Delete).
// Primary name: qdb_jti (BRD-authoritative; the auth-guard queries by this field).
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel } from './shared.js';

export const portalRevokedTokensDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Revoked_Tokens',
  DisplayName: label('Portal Revoked Token'),
  DisplayCollectionName: label('Portal Revoked Tokens'),
  Description: label('JWT revocation blocklist. Append-only — no Update or Delete permitted.'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_jti',
  Attributes: [
    {
      // BRD FR-SCHEMA-003: primary name is qdb_jti, not qdb_name.
      // The auth-guard queries: qdb_portal_revoked_tokens?$filter=qdb_jti eq '<jti>'
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Jti',
      LogicalName: 'qdb_jti',
      DisplayName: label('JWT ID (JTI)'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: 'qdb_RevokedOn',
      LogicalName: 'qdb_revoked_on',
      DisplayName: label('Revoked On'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      DateTimeBehavior: { Value: 'UserLocal' },
    },
  ],
};
