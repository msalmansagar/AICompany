import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';

function label(text: string) {
  return { LocalizedLabels: [{ Label: text, LanguageCode: 1033 }] };
}

function requiredLevel(value: 'None' | 'SystemRequired' | 'ApplicationRequired' | 'Recommended') {
  return { Value: value };
}

export const TOKEN_DEFINITIONS_ENTITY: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_token_definitions',
  DisplayName: label('Token Definition'),
  DisplayCollectionName: label('Token Definitions'),
  Description: label('Design token definition — slug, type, level, and category metadata'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_name',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_name',
      LogicalName: 'qdb_name',
      DisplayName: label('Name'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 200,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_slug',
      LogicalName: 'qdb_slug',
      DisplayName: label('Slug'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 200,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_css_variable',
      LogicalName: 'qdb_css_variable',
      DisplayName: label('CSS Variable'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 200,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: 'qdb_token_type',
      LogicalName: 'qdb_token_type',
      DisplayName: label('Token Type'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      GlobalOptionSet: { Name: 'qdb_token_type' },
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: 'qdb_token_level',
      LogicalName: 'qdb_token_level',
      DisplayName: label('Token Level'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      GlobalOptionSet: { Name: 'qdb_token_level' },
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
      SchemaName: 'qdb_token_category',
      LogicalName: 'qdb_token_category',
      DisplayName: label('Token Category'),
      RequiredLevel: requiredLevel('None'),
      GlobalOptionSet: { Name: 'qdb_token_category' },
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_default_value',
      LogicalName: 'qdb_default_value',
      DisplayName: label('Default Value'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 500,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_description',
      LogicalName: 'qdb_description',
      DisplayName: label('Description'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 1000,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
      SchemaName: 'qdb_is_active',
      LogicalName: 'qdb_is_active',
      DisplayName: label('Is Active'),
      RequiredLevel: requiredLevel('None'),
      DefaultValue: true,
      OptionSet: {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
        TrueOption: { Value: 1, Label: label('Yes') },
        FalseOption: { Value: 0, Label: label('No') },
      },
    },
  ],
};

export const TOKEN_VALUES_ENTITY: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_token_values',
  DisplayName: label('Token Value'),
  DisplayCollectionName: label('Token Values'),
  Description: label('Resolved CSS value for a token definition, scoped to locale and render target'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_name',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_name',
      LogicalName: 'qdb_name',
      DisplayName: label('Name'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 200,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_css_value',
      LogicalName: 'qdb_css_value',
      DisplayName: label('CSS Value'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 500,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_locale',
      LogicalName: 'qdb_locale',
      DisplayName: label('Locale'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 10,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_render_target',
      LogicalName: 'qdb_render_target',
      DisplayName: label('Render Target'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.BooleanAttributeMetadata',
      SchemaName: 'qdb_is_draft',
      LogicalName: 'qdb_is_draft',
      DisplayName: label('Is Draft'),
      RequiredLevel: requiredLevel('None'),
      DefaultValue: false,
      OptionSet: {
        '@odata.type': 'Microsoft.Dynamics.CRM.BooleanOptionSetMetadata',
        TrueOption: { Value: 1, Label: label('Draft') },
        FalseOption: { Value: 0, Label: label('Live') },
      },
    },
  ],
};
