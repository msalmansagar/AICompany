import type { EntityMetadataPayload } from '../../types/DataverseMetadata.js';
import { label, requiredLevel } from './shared.js';

// ---------------------------------------------------------------------------
// Inline picklist helper (local options, not global option sets)
// ---------------------------------------------------------------------------

function localPicklist(
  schemaName: string,
  logicalName: string,
  displayLabel: string,
  options: Array<{ value: number; label: string }>,
): {
  '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata';
  SchemaName: string;
  LogicalName: string;
  DisplayName: ReturnType<typeof label>;
  RequiredLevel: ReturnType<typeof requiredLevel>;
  OptionSet: {
    '@odata.type': string;
    IsGlobal: false;
    Options: Array<{ Value: number; Label: ReturnType<typeof label> }>;
  };
} {
  return {
    '@odata.type': 'Microsoft.Dynamics.CRM.PicklistAttributeMetadata',
    SchemaName: schemaName,
    LogicalName: logicalName,
    DisplayName: label(displayLabel),
    RequiredLevel: requiredLevel('None'),
    OptionSet: {
      '@odata.type': 'Microsoft.Dynamics.CRM.OptionSetMetadata',
      IsGlobal: false,
      Options: options.map((o) => ({ Value: o.value, Label: label(o.label) })),
    },
  };
}

// ---------------------------------------------------------------------------
// qdb_Rbac_User_Roles
// ---------------------------------------------------------------------------

export const rbacUserRolesDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Rbac_User_Roles',
  DisplayName: label('RBAC User Role'),
  DisplayCollectionName: label('RBAC User Roles'),
  Description: label('Role assignments for portal users. Append-only — deactivate to revoke.'),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_user_id',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_UserId',
      LogicalName: 'qdb_user_id',
      DisplayName: label('User ID'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_RoleSlug',
      LogicalName: 'qdb_role_slug',
      DisplayName: label('Role Slug'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 64,
    },
    {
      ...localPicklist('qdb_Population', 'qdb_population', 'Population', [
        { value: 1, label: 'Staff' },
        { value: 2, label: 'Citizen' },
      ]),
      RequiredLevel: requiredLevel('None'),
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_AssignedBy',
      LogicalName: 'qdb_assigned_by',
      DisplayName: label('Assigned By'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: 'qdb_AssignedOn',
      LogicalName: 'qdb_assigned_on',
      DisplayName: label('Assigned On'),
      RequiredLevel: requiredLevel('None'),
      DateTimeBehavior: { Value: 'UserLocal' },
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: 'qdb_ExpiresAt',
      LogicalName: 'qdb_expires_at',
      DisplayName: label('Expires At'),
      RequiredLevel: requiredLevel('None'),
      DateTimeBehavior: { Value: 'UserLocal' },
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.IntegerAttributeMetadata',
      SchemaName: 'qdb_RbacVersion',
      LogicalName: 'qdb_rbac_version',
      DisplayName: label('RBAC Version'),
      RequiredLevel: requiredLevel('None'),
      DefaultValue: 0,
    },
  ],
};

// ---------------------------------------------------------------------------
// qdb_Rbac_Audit_Log
// ---------------------------------------------------------------------------

export const rbacAuditLogDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Rbac_Audit_Log',
  DisplayName: label('RBAC Audit Log'),
  DisplayCollectionName: label('RBAC Audit Logs'),
  Description: label(
    'Immutable audit trail for RBAC events. AC-RBAC-004: no Write or Delete in security role.',
  ),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_correlation_id',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_CorrelationId',
      LogicalName: 'qdb_correlation_id',
      DisplayName: label('Correlation ID'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      ...localPicklist('qdb_EventType', 'qdb_event_type', 'Event Type', [
        { value: 1, label: 'Role Assigned' },
        { value: 2, label: 'Role Revoked' },
        { value: 3, label: 'Promotion Initiated' },
        { value: 4, label: 'Promotion Approved' },
        { value: 5, label: 'Promotion Rejected' },
        { value: 6, label: 'PII Accessed' },
        { value: 7, label: 'Permission Denied' },
      ]),
      RequiredLevel: requiredLevel('ApplicationRequired'),
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_ActorUserId',
      LogicalName: 'qdb_actor_user_id',
      DisplayName: label('Actor User ID'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_TargetUserId',
      LogicalName: 'qdb_target_user_id',
      DisplayName: label('Target User ID'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_RoleSlug',
      LogicalName: 'qdb_role_slug',
      DisplayName: label('Role Slug'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 64,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Subject',
      LogicalName: 'qdb_subject',
      DisplayName: label('CASL Subject'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 255,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_Action',
      LogicalName: 'qdb_action',
      DisplayName: label('CASL Action'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 64,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_ResourceId',
      LogicalName: 'qdb_resource_id',
      DisplayName: label('Resource ID'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_IpAddress',
      LogicalName: 'qdb_ip_address',
      DisplayName: label('IP Address'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 45,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.MemoAttributeMetadata',
      SchemaName: 'qdb_Detail',
      LogicalName: 'qdb_detail',
      DisplayName: label('Detail (JSON)'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 4000,
    },
  ],
};

// ---------------------------------------------------------------------------
// qdb_Rbac_Promotion_Requests
// ---------------------------------------------------------------------------

export const rbacPromotionRequestsDefinition: EntityMetadataPayload = {
  '@odata.type': 'Microsoft.Dynamics.CRM.EntityMetadata',
  SchemaName: 'qdb_Rbac_Promotion_Requests',
  DisplayName: label('RBAC Promotion Request'),
  DisplayCollectionName: label('RBAC Promotion Requests'),
  Description: label(
    'Four-eyes promotion workflow for portal-admin assignment (ADR-RBAC-003).',
  ),
  OwnershipType: 'OrganizationOwned',
  HasActivities: false,
  HasNotes: false,
  IsActivity: false,
  PrimaryNameAttribute: 'qdb_target_user_id',
  Attributes: [
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_TargetUserId',
      LogicalName: 'qdb_target_user_id',
      DisplayName: label('Target User ID'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_TargetRole',
      LogicalName: 'qdb_target_role',
      DisplayName: label('Target Role'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 64,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_InitiatedBy',
      LogicalName: 'qdb_initiated_by',
      DisplayName: label('Initiated By'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      MaxLength: 100,
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_ApprovedBy',
      LogicalName: 'qdb_approved_by',
      DisplayName: label('Approved / Rejected By'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 100,
    },
    {
      ...localPicklist('qdb_Status', 'qdb_status', 'Status', [
        { value: 1, label: 'Pending' },
        { value: 2, label: 'Approved' },
        { value: 3, label: 'Rejected' },
        { value: 4, label: 'Expired' },
      ]),
      RequiredLevel: requiredLevel('ApplicationRequired'),
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.DateTimeAttributeMetadata',
      SchemaName: 'qdb_ExpiresAt',
      LogicalName: 'qdb_expires_at',
      DisplayName: label('Expires At'),
      RequiredLevel: requiredLevel('ApplicationRequired'),
      DateTimeBehavior: { Value: 'UserLocal' },
    },
    {
      '@odata.type': 'Microsoft.Dynamics.CRM.StringAttributeMetadata',
      SchemaName: 'qdb_RejectionReason',
      LogicalName: 'qdb_rejection_reason',
      DisplayName: label('Rejection Reason'),
      RequiredLevel: requiredLevel('None'),
      MaxLength: 500,
    },
  ],
};
