// BRD FR-SCHEMA-005: qdb_portal_nav_items
// Primary name: qdb_label (BRD-authoritative from NavService.ts DataverseNavItem interface)
// Self-referential qdb_parent_id is created as a separate relationship in Phase 6.
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, booleanField, globalPicklist } from './shared.js';

export const portalNavItemsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Nav_Items',
  DisplayName: label('Portal Nav Item'),
  DisplayCollectionName: label('Portal Nav Items'),
  Description: label('Navigation menu items for the citizen portal, supporting parent-child hierarchy.'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_label',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Label',
      LogicalName: 'qdb_label',
      DisplayName: label('Label (EN)'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 255,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_LabelAr',
      LogicalName: 'qdb_label_ar',
      DisplayName: label('Label (AR)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 255,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Icon',
      LogicalName: 'qdb_icon',
      DisplayName: label('Icon Name'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_PageCode',
      LogicalName: 'qdb_page_code',
      DisplayName: label('Page Code'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: 'qdb_DisplayOrder',
      LogicalName: 'qdb_display_order',
      DisplayName: label('Display Order'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
    },
    {
      ...booleanField('qdb_IsVisible', 'qdb_is_visible', 'Is Visible', true),
      RequiredLevel: requiredLevel('ApplicationRequired'),
    },
    {
      ...globalPicklist('qdb_BadgeSource', 'qdb_badge_source', 'Badge Source', 'qdb_badge_source'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      DefaultFormValue: 860000001,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_BadgeValue',
      LogicalName: 'qdb_badge_value',
      DisplayName: label('Badge Value'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 500,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_RequiredRole',
      LogicalName: 'qdb_required_role',
      DisplayName: label('Required Role'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100,
    },
    // qdb_parent_id self-referential lookup is created in Phase 6 (RelationshipProvisioner)
    // after this entity exists.
  ],
};
