// BRD FR-SCHEMA-006: qdb_portal_widget_configs
// Primary name: qdb_widget_type (BRD-authoritative from widgets.ts DataverseWidgetConfig)
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, booleanField } from './shared.js';

export const portalWidgetConfigsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Widget_Configs',
  DisplayName: label('Portal Widget Configuration'),
  DisplayCollectionName: label('Portal Widget Configurations'),
  Description: label('Dashboard widget layout and configuration records for the citizen portal.'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_widget_type',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_WidgetType',
      LogicalName: 'qdb_widget_type',
      DisplayName: label('Widget Type'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Title',
      LogicalName: 'qdb_title',
      DisplayName: label('Title'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 255,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: 'qdb_DisplayOrder',
      LogicalName: 'qdb_display_order',
      DisplayName: label('Display Order'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      DefaultValue: 0,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: 'qdb_ColumnSpan',
      LogicalName: 'qdb_column_span',
      DisplayName: label('Column Span'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      DefaultValue: 1,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_Config',
      LogicalName: 'qdb_config',
      DisplayName: label('Config (JSON)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 4000,
    },
  ],
};
