// BRD FR-SCHEMA-008: qdb_portal_service_tabs
// Primary name: qdb_title (BRD-authoritative from services.ts DataverseServiceTab)
// Lookup: qdb_service_id → qdb_portal_services (Batch B, created after Batch A)
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, booleanField, requiredLookup } from './shared.js';

export const portalServiceTabsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Service_Tabs',
  DisplayName: label('Portal Service Tab'),
  DisplayCollectionName: label('Portal Service Tabs'),
  Description: label('Content tabs displayed on the service detail page.'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_title',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Title',
      LogicalName: 'qdb_title',
      DisplayName: label('Tab Title (EN)'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 255,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_TitleAr',
      LogicalName: 'qdb_title_ar',
      DisplayName: label('Tab Title (AR)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 255,
    },
    requiredLookup('qdb_ServiceId', 'qdb_service_id', 'Service', ['qdb_portal_services']),
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_Content',
      LogicalName: 'qdb_content',
      DisplayName: label('Content (EN)'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100000,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_ContentAr',
      LogicalName: 'qdb_content_ar',
      DisplayName: label('Content (AR)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100000,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: 'qdb_DisplayOrder',
      LogicalName: 'qdb_display_order',
      DisplayName: label('Display Order'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
    },
  ],
};
