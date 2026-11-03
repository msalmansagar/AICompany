import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, globalPicklist, booleanField } from './shared.js';

export const componentDefinitionsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Component_Definitions',
  DisplayName: label('Component Definition'),
  DisplayCollectionName: label('Component Definitions'),
  Description: label('Platform-wide registry of DXP component types.'),
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
      DisplayName: label('Component Name (Slug)'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_DisplayName',
      LogicalName: 'qdb_display_name',
      DisplayName: label('Display Name (EN)'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 255,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_DisplayNameAr',
      LogicalName: 'qdb_display_name_ar',
      DisplayName: label('Display Name (AR)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 255,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_Description',
      LogicalName: 'qdb_description',
      DisplayName: label('Description (EN)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 2000,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_DescriptionAr',
      LogicalName: 'qdb_description_ar',
      DisplayName: label('Description (AR)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 2000,
    },
    {
      ...globalPicklist('qdb_Category', 'qdb_category', 'Category', 'qdb_component_category'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_RenderTargets',
      LogicalName: 'qdb_render_targets',
      DisplayName: label('Render Targets (JSON)'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 4000,
    },
    {
      ...booleanField('qdb_IsActive', 'qdb_is_active', 'Is Active', true),
      RequiredLevel: requiredLevel('ApplicationRequired'),
    },
  ],
};
