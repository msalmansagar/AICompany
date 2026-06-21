import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, booleanField } from './shared.js';

export const componentVersionsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Component_Versions',
  DisplayName: label('Component Version'),
  DisplayCollectionName: label('Component Versions'),
  Description: label('Versioned schema records for DXP components.'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_version_number',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_VersionNumber',
      LogicalName: 'qdb_version_number',
      DisplayName: label('Version Number'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 50,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_PropsSchema',
      LogicalName: 'qdb_props_schema',
      DisplayName: label('Props Schema (JSON Schema)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 1048576,
    },
    {
      ...booleanField('qdb_IsLatest', 'qdb_is_latest', 'Is Latest Version', false),
      RequiredLevel: requiredLevel('None'),
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_ChangeLog',
      LogicalName: 'qdb_change_log',
      DisplayName: label('Change Log'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 4000,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_DefaultProps',
      LogicalName: 'qdb_default_props',
      DisplayName: label('Default Props (JSON)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 1048576,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_BundleUrl',
      LogicalName: 'qdb_bundle_url',
      DisplayName: label('Bundle URL'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 2048,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: 'qdb_DeprecatedOn',
      LogicalName: 'qdb_deprecated_on',
      DisplayName: label('Deprecated On'),
      RequiredLevel: requiredLevel('None'),
      DateTimeBehavior: { Value: 'UserLocal' },
    },
  ],
};
