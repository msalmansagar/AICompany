// BRD FR-SCHEMA-012: qdb_portal_notifications
// Primary name: qdb_title (BRD-authoritative from NotificationService.ts)
// CRITICAL: qdb_user_id is a plain string, NOT a lookup.
// BRD: "portal user GUID as plain string — used in OData filter"
// BRD field names: qdb_user_id, qdb_title, qdb_body, qdb_type, qdb_link_url, qdb_is_read
import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel, booleanField, globalPicklist } from './shared.js';

export const portalNotificationsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Portal_Notifications',
  DisplayName: label('Portal Notification'),
  DisplayCollectionName: label('Portal Notifications'),
  Description: label('In-portal notifications delivered to individual citizens.'),
  OwnershipType: 'UserOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_title',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Title',
      LogicalName: 'qdb_title',
      DisplayName: label('Title'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 255,
    },
    {
      // Plain string — not a lookup. BRD FR-SCHEMA-012 authoritative.
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_UserId',
      LogicalName: 'qdb_user_id',
      DisplayName: label('User ID'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_Body',
      LogicalName: 'qdb_body',
      DisplayName: label('Body'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 4000,
    },
    {
      ...globalPicklist('qdb_Type', 'qdb_type', 'Notification Type', 'qdb_notification_type'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      DefaultFormValue: 860000001,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_LinkUrl',
      LogicalName: 'qdb_link_url',
      DisplayName: label('Link URL'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 500,
    },
    {
      ...booleanField('qdb_IsRead', 'qdb_is_read', 'Is Read', false),
      RequiredLevel: requiredLevel('ApplicationRequired'),
    },
  ],
};
