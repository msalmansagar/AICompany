// BRD FR-SCHEMA-001: qdb_portal_users
// Primary name attribute: qdb_display_name (BRD-authoritative; arch used qdb_name)
// BRD fields: qdb_email, qdb_password_hash, qdb_first_name, qdb_last_name, qdb_display_name
// These are the exact field names the CustomCredentialAdapter queries.
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, globalPicklist } from './shared.js';

export const portalUsersDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Users',
  DisplayName: label('Portal User'),
  DisplayCollectionName: label('Portal Users'),
  Description: label('Custom credential user accounts for the citizen-facing portal.'),
  OwnershipType: 'UserOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_display_name',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_DisplayName',
      LogicalName: 'qdb_display_name',
      DisplayName: label('Display Name'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 255,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Email',
      LogicalName: 'qdb_email',
      DisplayName: label('Email Address'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 255,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_PasswordHash',
      LogicalName: 'qdb_password_hash',
      DisplayName: label('Password Hash'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 1000,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_FirstName',
      LogicalName: 'qdb_first_name',
      DisplayName: label('First Name'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_LastName',
      LogicalName: 'qdb_last_name',
      DisplayName: label('Last Name'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_AvatarUrl',
      LogicalName: 'qdb_avatar_url',
      DisplayName: label('Avatar URL'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 500,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_Roles',
      LogicalName: 'qdb_roles',
      DisplayName: label('Roles (JSON)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 4000,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_LinkedEntityIds',
      LogicalName: 'qdb_linked_entity_ids',
      DisplayName: label('Linked Entity IDs (JSON)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 4000,
    },
    {
      ...globalPicklist('qdb_PreferredLanguage', 'qdb_preferred_language', 'Preferred Language', 'qdb_preferred_language'),
      DefaultFormValue: 860001001,
    },
  ],
};
