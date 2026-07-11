/**
 * Column logical names for the qdb_dfe_audit_log entity.
 * Defined separately from formAttributeNames.ts to keep the barrel file
 * below its 400-line cap and to make the ENT-005 scope explicit.
 *
 * The entity is provisioned by provision-dfe-audit-log.mjs (Workstream E1).
 * These names must match the logical names produced by that script exactly.
 */
export const DFE_AUDIT_LOG_ATTRS = {
  ID: 'qdb_dfe_audit_logid',
  FORM_ID: 'qdb_form_id',
  FORM_VERSION_ID: 'qdb_form_version_id',
  CHANGED_BY: 'qdb_changed_by',
  FIELD_SCHEMA_NAME: 'qdb_field_schema_name',
  CHANGE_PATH: 'qdb_change_path',
  BEFORE_VALUE: 'qdb_before_value',
  AFTER_VALUE: 'qdb_after_value',
  SESSION_ID: 'qdb_session_id',
  ACTION: 'qdb_action',
  EVENT_TYPE: 'qdb_event_type',
  CHANGED_ON: 'qdb_changed_on',
} as const;

/**
 * Picklist values for qdb_action on qdb_dfe_audit_log.
 * Match the option set values defined in §2.3 of phase-4-tech-E.md.
 */
export const DFE_AUDIT_ACTION_PICKLIST = {
  create: 100000001,
  update: 100000002,
  delete: 100000003,
} as const satisfies Record<string, number>;

/**
 * Picklist values for qdb_event_type on qdb_dfe_audit_log.
 * Match the option set values defined in §2.3 of phase-4-tech-E.md.
 */
export const DFE_AUDIT_EVENT_TYPE_PICKLIST = {
  FieldChange: 100000001,
  RuleChange: 100000002,
  MappingChange: 100000003,
  TranslationChange: 100000004,
  FormImport: 100000005,
  FormPublish: 100000006,
  FormRestore: 100000007,
  FormChange: 100000008,
} as const satisfies Record<string, number>;
