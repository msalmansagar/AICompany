// Privilege matrix for the Portal Shell API Role.
// Action keys match the Dataverse privilege name prefix: prv<Action><logicalName>.
// Dataverse derives privilege names from the entity LogicalName (lowercase).
// C-SCHEMA-003: Write and Delete are absent for the three append-only entities.

export interface EntityPrivilegeSpec {
  readonly logicalName: string;
  readonly actions: readonly string[];
}

export const PRIVILEGE_MATRIX: readonly EntityPrivilegeSpec[] = [
  { logicalName: 'qdb_portal_users',              actions: ['Create', 'Read', 'Write', 'Append', 'AppendTo'] },
  { logicalName: 'qdb_portal_reset_tokens',       actions: ['Create', 'Read', 'Write', 'Delete', 'Append', 'AppendTo'] },
  // C-SCHEMA-003: No Write (Update), No Delete on qdb_portal_revoked_tokens
  { logicalName: 'qdb_portal_revoked_tokens',     actions: ['Create', 'Read', 'Append', 'AppendTo'] },
  { logicalName: 'qdb_portal_configs',            actions: ['Read'] },
  { logicalName: 'qdb_portal_nav_items',          actions: ['Read'] },
  { logicalName: 'qdb_portal_widget_configs',     actions: ['Read'] },
  { logicalName: 'qdb_portal_services',           actions: ['Read'] },
  { logicalName: 'qdb_portal_service_tabs',       actions: ['Read'] },
  { logicalName: 'qdb_portal_requests',           actions: ['Create', 'Read', 'Write', 'Append', 'AppendTo'] },
  // C-SCHEMA-003: No Write (Update), No Delete on qdb_portal_request_timelines
  { logicalName: 'qdb_portal_request_timelines',  actions: ['Create', 'Read', 'Append', 'AppendTo'] },
  { logicalName: 'qdb_portal_request_documents',  actions: ['Create', 'Read', 'Append', 'AppendTo'] },
  { logicalName: 'qdb_portal_notifications',      actions: ['Create', 'Read', 'Write', 'Append', 'AppendTo'] },
  { logicalName: 'qdb_cms_contents',              actions: ['Read'] },
  // C-SCHEMA-003: No Write (Update), No Delete on qdb_cms_revisions
  { logicalName: 'qdb_cms_revisions',             actions: ['Create', 'Read'] },
  { logicalName: 'qdb_portal_user_entities',      actions: ['Read'] },
];

export const APPEND_ONLY_LOGICAL_NAMES: readonly string[] = [
  'qdb_portal_revoked_tokens',
  'qdb_portal_request_timelines',
  'qdb_cms_revisions',
];

export const OOB_PRIVILEGE_NAMES: readonly string[] = [
  'prvReadAccount',
  'prvReadContact',
];
