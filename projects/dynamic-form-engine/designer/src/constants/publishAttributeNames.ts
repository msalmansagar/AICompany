// Publish job attribute registries.
// Split from attributeNames.ts (SC-09). STYLE_CHANGE trigger reason added for DFE-STYLE-001.

export const PUBLISH_JOB_ATTRS = {
  ID: 'qdb_publish_jobid',
  FORM_DEFINITION_ID: 'qdb_form_definition_id',
  FORM_DEFINITION_ID_VALUE: '_qdb_form_definition_id_value',
  FORM_CODE: 'qdb_form_code',
  TARGET_VERSION: 'qdb_target_version',
  STATUS: 'qdb_status',
  TRIGGER_REASON: 'qdb_trigger_reason',
  LANGUAGES_REQUESTED: 'qdb_languages_requested',
  LANGUAGES_SUCCEEDED: 'qdb_languages_succeeded',
  LANGUAGES_FAILED: 'qdb_languages_failed',
  ERROR_DETAILS: 'qdb_error_details',
} as const;

export const PUBLISH_JOB_STATUS = {
  QUEUED: 1,
  RUNNING: 2,
  COMPLETED: 3,
  PARTIALLY_COMPLETED: 4,
  FAILED: 5,
} as const;

export type PublishJobStatusValue = (typeof PUBLISH_JOB_STATUS)[keyof typeof PUBLISH_JOB_STATUS];

export const PUBLISH_JOB_TRIGGER_REASON = {
  PUBLISH: 1,
  STYLE_CHANGE: 2,
} as const;
