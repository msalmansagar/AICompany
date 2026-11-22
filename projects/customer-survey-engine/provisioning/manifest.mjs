/**
 * SurveyEngine schema manifest (phase-3-arch.md section 4, B1). The single source of truth for
 * every qdb_survey_* table, column, relationship, alternate key and role. The provisioner and
 * the on-prem packager both read it; nothing else may declare survey schema.
 *
 * Choice values are 100000000-based like every DFE picklist; the codes in the architecture
 * tables (1, 2, 3...) were illustrative and this manifest is authoritative.
 *
 * @module survey-provisioning/manifest
 */

export const SOLUTION = Object.freeze({
  uniqueName: 'SurveyEngine',
  friendlyName: 'Survey Engine',
  version: '1.2.0.5',
  // The publisher of QdbDynamicFormEngine. Four publishers share the qdb prefix on the cloud org,
  // so it is pinned by unique name; on-prem orgs must carry the same publisher or the kit fails.
  publisherUniqueName: 'qdb',
  description: 'Customer Survey Engine (CSE-ENG-001). Depends on the Dynamic Form Engine; DFE does not depend on it.',
});

const string = (name, label, maxLength = 100, extra = {}) => ({ name, type: 'string', label, maxLength, ...extra });
const memo = (name, label, maxLength = 4000) => ({ name, type: 'memo', label, maxLength });
const integer = (name, label, extra = {}) => ({ name, type: 'integer', label, ...extra });
const decimal = (name, label) => ({ name, type: 'decimal', label, precision: 4 });
const boolean = (name, label, defaultValue) => ({ name, type: 'boolean', label, defaultValue });
const dateTime = (name, label) => ({ name, type: 'datetime', label, format: 'DateAndTime' });
const dateOnly = (name, label) => ({ name, type: 'datetime', label, format: 'DateOnly' });
const choice = (name, label, options, defaultValue = null) => ({ name, type: 'picklist', label, options, defaultValue });

const option = (index, label) => ({ value: 100000000 + index, label });

export const DELIVERY_OPTIONS = Object.freeze([option(0, 'Portal'), option(1, 'Secure link'), option(2, 'None')]);
export const TRIGGER_KIND_OPTIONS = Object.freeze([option(0, 'Event'), option(1, 'Created'), option(2, 'Scheduled'), option(3, 'Milestone'), option(4, 'One-time')]);
// Addendum D (FR-CSE-083..091): a One-time trigger's audience and its run record.
export const AUDIENCE_OPTIONS = Object.freeze([option(0, 'All active customers'), option(1, 'Filter')]);
// Stuck (ADR-011) is set only on scheduled runs, Failed only on One-time runs.
export const RUN_STATUS_OPTIONS = Object.freeze([option(0, 'Not sent'), option(1, 'Sending'), option(2, 'Sent'), option(3, 'Failed'), option(4, 'Stuck')]);
export const SCHEDULE_PERIOD_OPTIONS = Object.freeze([option(0, 'Monthly'), option(1, 'Quarterly'), option(2, 'Annually')]);
export const SCHEDULE_POPULATION_OPTIONS = Object.freeze([option(0, 'All active customers'), option(1, 'Active in period')]);
export const FATIGUE_ACTION_OPTIONS = Object.freeze([option(0, 'Drop'), option(1, 'Postpone')]);
export const INVITATION_STATUS_OPTIONS = Object.freeze([
  option(0, 'Pending'), option(1, 'Postponed'), option(2, 'Submitted'), option(3, 'Expired'), option(4, 'Discarded'),
]);
export const INVITATION_CHANNEL_OPTIONS = Object.freeze([option(0, 'Portal'), option(1, 'Secure link')]);
export const SUPPRESSION_REASON_OPTIONS = Object.freeze([
  option(0, 'Fatigue'), option(1, 'Priority lost'), option(2, 'Duplicate'), option(3, 'Channel none'),
  option(4, 'Postponed expired'), option(5, 'Outside window'), option(6, 'Inactive'),
  // B2: without these two a trigger with no customer, or a form not yet published, would
  // have to be mislabelled or dropped silently (NFR-CSE-001).
  option(7, 'No customer'), option(8, 'Form not published'),
  // B7: a secure-link invitation that could not be sent by SMS, email or either (NFR-CSE-001).
  option(9, 'Not delivered'),
]);
export const RETENTION_MODE_OPTIONS = Object.freeze([option(0, 'Delete'), option(1, 'Anonymise')]);
// B9 finding F1: HL CRM keeps its customers as contacts, the cloud org and BFD/QDB1 as accounts.
export const CUSTOMER_TABLE_OPTIONS = Object.freeze([option(0, 'Account'), option(1, 'Contact')]);

const sourceRecordColumns = () => [
  string('qdb_source_record_id', 'Source Record Id', 100),
  string('qdb_source_table', 'Source Table', 128),
];

/**
 * @typedef {{ name: string, type: string, label: string, [setting: string]: unknown }} ColumnSpec
 * @typedef {{ name: string, label: string, pluralLabel: string, description: string, hasActivities?: boolean, isAuditEnabled?: boolean, columns: ColumnSpec[] }} TableSpec
 * isAuditEnabled (CEO 2026-11-14, audit AUD-01): change history on the rule tables, invitations and the
 * suppression log. Never on responses or answers: their history would keep anonymised answers (PDPPL).
 * @type {ReadonlyArray<TableSpec>}
 */
export const TABLES = Object.freeze([
  {
    name: 'qdb_survey_source', label: 'Survey Source', pluralLabel: 'Survey Sources', isAuditEnabled: true,
    description: 'A CRM request table that can trigger surveys (FR-CSE-001..006).',
    columns: [
      string('qdb_table_logical_name', 'Table Logical Name', 128, { required: true }),
      string('qdb_customer_lookup_field', 'Customer Lookup Field', 128, { required: true }),
      string('qdb_type_field', 'Type Field', 128),
      string('qdb_status_field', 'Status Field', 128),
      string('qdb_origin_field', 'Origin Field', 128),
      memo('qdb_origin_digital_values', 'Origin Digital Values', 2000),
      boolean('qdb_counts_toward_milestones', 'Counts Toward Milestones', false),
      boolean('qdb_is_active', 'Is Active', false),
      memo('qdb_step_registration_json', 'Step Registration JSON', 4000),
    ],
  },
  {
    name: 'qdb_survey_setup', label: 'Survey Setup', pluralLabel: 'Survey Setups', isAuditEnabled: true,
    description: 'A survey definition: form, wording, delivery and window (FR-CSE-007..018).',
    columns: [
      string('qdb_form_code', 'Form Code', 100, { required: true }),
      string('qdb_notif_title_en', 'Notification Title (English)', 200),
      string('qdb_notif_title_ar', 'Notification Title (Arabic)', 200),
      memo('qdb_notif_message_en', 'Notification Message (English)', 4000),
      memo('qdb_notif_message_ar', 'Notification Message (Arabic)', 4000),
      choice('qdb_delivery_digital', 'Delivery (Digital)', DELIVERY_OPTIONS, DELIVERY_OPTIONS[0].value),
      choice('qdb_delivery_legacy', 'Delivery (Legacy)', DELIVERY_OPTIONS, DELIVERY_OPTIONS[0].value),
      dateOnly('qdb_active_from', 'Active From'),
      dateOnly('qdb_active_to', 'Active To'),
      integer('qdb_expiry_days', 'Expiry Days', { min: 1, max: 3650 }),
      boolean('qdb_is_active', 'Is Active', false),
    ],
  },
  {
    name: 'qdb_survey_trigger', label: 'Survey Trigger', pluralLabel: 'Survey Triggers', isAuditEnabled: true,
    description: 'When a setup sends invitations (FR-CSE-026..044).',
    columns: [
      choice('qdb_trigger_kind', 'Trigger Kind', TRIGGER_KIND_OPTIONS),
      memo('qdb_status_values', 'Status Values', 2000),
      memo('qdb_type_values', 'Type Values', 2000),
      choice('qdb_schedule_period', 'Schedule Period', SCHEDULE_PERIOD_OPTIONS),
      choice('qdb_schedule_population', 'Schedule Population', SCHEDULE_POPULATION_OPTIONS),
      integer('qdb_milestone_every_n', 'Milestone Every N', { min: 1, max: 1000 }),
      memo('qdb_milestone_type_values', 'Milestone Type Values', 2000),
      memo('qdb_milestone_status_values', 'Milestone Status Values', 2000),
      dateTime('qdb_milestone_count_from', 'Milestone Count From'),
      boolean('qdb_milestone_skip_reached', 'Skip Milestones Already Reached', true),
      choice('qdb_fatigue_action', 'When Blocked by Fatigue', FATIGUE_ACTION_OPTIONS),
      integer('qdb_priority', 'Priority', { min: 0, max: 1000 }),
      boolean('qdb_is_active', 'Is Active', false),
      // Addendum D: One-time trigger (D.2). The run columns are written only by the send APIs.
      dateTime('qdb_send_on', 'Send On'),
      choice('qdb_audience', 'Audience', AUDIENCE_OPTIONS, AUDIENCE_OPTIONS[0].value),
      memo('qdb_audience_fetchxml', 'Audience Filter (FetchXML)', 100000),
      // Amendment 1 (FR-CSE-095, 096): the view the filter was copied from, and when.
      string('qdb_audience_view_name', 'Audience Copied From View', 200),
      string('qdb_audience_view_id', 'Audience View Id', 40),
      string('qdb_audience_view_type', 'Audience View Type', 20),
      dateTime('qdb_audience_copied_on', 'Audience Copied On'),
      choice('qdb_run_status', 'Run Status', RUN_STATUS_OPTIONS, RUN_STATUS_OPTIONS[0].value),
      dateTime('qdb_run_started_on', 'Run Started On'),
      dateTime('qdb_sent_on', 'Sent On'),
      integer('qdb_invited_count', 'Invited', { min: 0, max: 2147483647 }),
      integer('qdb_postponed_count', 'Postponed', { min: 0, max: 2147483647 }),
      integer('qdb_suppressed_count', 'Suppressed', { min: 0, max: 2147483647 }),
      memo('qdb_run_cursor', 'Run Cursor', 4000),
      memo('qdb_run_message', 'Run Message', 2000),
      // 001-scale-per-org (ADR-011): a scheduled trigger's run of one period, written page by page by the engine.
      string('qdb_run_period_key', 'Run Period', 50),
      integer('qdb_run_evaluated_count', 'Customers Evaluated', { min: 0, max: 2147483647 }),
      integer('qdb_run_failed_calls', 'Failed Calls In A Row', { min: 0, max: 2147483647 }),
      dateTime('qdb_run_progress_on', 'Run Last Updated'),
    ],
  },
  {
    name: 'qdb_survey_invitation', label: 'Survey Invitation', pluralLabel: 'Survey Invitations', isAuditEnabled: true,
    description: 'One survey sent to one customer (FR-CSE-045..050).',
    hasActivities: true,
    columns: [
      ...sourceRecordColumns(),
      string('qdb_form_code', 'Form Code', 100),
      integer('qdb_pinned_version', 'Pinned Version', { min: 0, max: 2147483647 }),
      string('qdb_language_code', 'Language Code', 10),
      choice('qdb_status', 'Invitation Status', INVITATION_STATUS_OPTIONS, INVITATION_STATUS_OPTIONS[0].value),
      choice('qdb_channel', 'Channel', INVITATION_CHANNEL_OPTIONS),
      dateTime('qdb_generated_on', 'Generated On'),
      dateTime('qdb_expires_on', 'Expires On'),
      integer('qdb_milestone_index', 'Milestone Index', { min: 0, max: 2147483647 }),
      // 50 since Addendum D: One-time invitations carry ONCE-{trigger id} (37 characters).
      string('qdb_schedule_period_key', 'Schedule Period Key', 50),
      string('qdb_token_hash', 'Token Hash', 64),
      dateTime('qdb_token_used_on', 'Token Used On'),
      string('qdb_dedupe_key', 'Dedupe Key', 200, { required: true }),
    ],
  },
  {
    name: 'qdb_survey_response', label: 'Survey Response', pluralLabel: 'Survey Responses',
    description: 'The submitted answers of one invitation (FR-CSE-056, ADR-007).',
    columns: [
      ...sourceRecordColumns(),
      string('qdb_form_code', 'Form Code', 100),
      integer('qdb_pinned_version', 'Pinned Version', { min: 0, max: 2147483647 }),
      string('qdb_language_code', 'Language Code', 10),
      memo('qdb_answers_json', 'Answers JSON', 1048576),
      dateTime('qdb_submitted_on', 'Submitted On'),
      // Addendum A (FR-CSE-066): set only for a response to a weighted survey.
      decimal('qdb_score_total', 'Score'),
      decimal('qdb_score_max', 'Maximum Score'),
      decimal('qdb_score_percent', 'Score %'),
    ],
  },
  {
    name: 'qdb_survey_answer', label: 'Survey Answer', pluralLabel: 'Survey Answers',
    description: 'One answered question, flattened for views and charts (FR-CSE-056, 057).',
    columns: [
      string('qdb_question_code', 'Question Code', 100),
      string('qdb_question_label', 'Question Label', 400),
      memo('qdb_answer_text', 'Answer Text', 4000),
      decimal('qdb_answer_numeric', 'Answer Numeric'),
      integer('qdb_question_order', 'Question Order', { min: 0, max: 2147483647 }),
      // Addendum A (FR-CSE-067): set only for a scored question of a weighted survey.
      decimal('qdb_points', 'Points'),
      decimal('qdb_weighted_points', 'Weighted Points'),
    ],
  },
  {
    name: 'qdb_survey_suppression_log', label: 'Survey Suppression Log', pluralLabel: 'Survey Suppression Logs', isAuditEnabled: true,
    description: 'Append-only record of every trigger that did not send (NFR-CSE-001).',
    columns: [
      ...sourceRecordColumns(),
      choice('qdb_reason', 'Reason', SUPPRESSION_REASON_OPTIONS),
      memo('qdb_detail', 'Detail', 4000),
      dateTime('qdb_logged_on', 'Logged On'),
    ],
  },
  {
    name: 'qdb_survey_settings', label: 'Survey Settings', pluralLabel: 'Survey Settings', isAuditEnabled: true,
    description: 'Org-wide survey settings; one row per org (FR-CSE-040, 058).',
    columns: [
      integer('qdb_fatigue_min_days', 'Fatigue Minimum Days', { min: 0, max: 3650 }),
      string('qdb_language_field', 'Customer Language Field', 128),
      string('qdb_default_language', 'Default Language', 10),
      integer('qdb_retention_days', 'Retention Days', { min: 0, max: 36500 }),
      choice('qdb_retention_mode', 'Retention Mode', RETENTION_MODE_OPTIONS),
      choice('qdb_customer_table', 'Customer Table', CUSTOMER_TABLE_OPTIONS, CUSTOMER_TABLE_OPTIONS[0].value),
      boolean('qdb_securelink_enabled', 'Secure Link Enabled', false),
      string('qdb_securelink_base_url', 'Secure Link Base URL', 500),
      // ADR-010: the last run date whose daily passes completed; the 15-minute scheduler runs them once a day.
      dateOnly('qdb_daily_passes_completed_on', 'Daily Passes Completed On'),
      // FR-011 (ADR-011): failed scheduler calls in a row that mark a scheduled run Stuck. Required, no code default
      // (Article V); the seed sets 3 on new orgs and the deploy step sets it on existing ones.
      integer('qdb_stuck_after_failed_calls', 'Stuck After Failed Calls', { min: 1, max: 10, required: true }),
    ],
  },
  {
    name: 'qdb_survey_sms_config', label: 'Survey SMS Config', pluralLabel: 'Survey SMS Configs', isAuditEnabled: true,
    description: 'Which table and columns hand an SMS to this org\'s SMS service (FR-CSE-048).',
    columns: [
      string('qdb_sms_table_logical_name', 'SMS Table Logical Name', 128, { required: true }),
      string('qdb_recipient_field', 'Recipient Field', 128, { required: true }),
      string('qdb_message_field', 'Message Field', 128, { required: true }),
      string('qdb_customer_link_field', 'Customer Link Field', 128),
      // B7: where the customer's mobile number lives differs per org; empty = no SMS. Addendum D
      // (FR-CSE-092): an ordered comma-separated list of columns, one SMS per distinct number.
      string('qdb_customer_phone_field', 'Customer Mobile Fields', 1000),
      memo('qdb_static_columns_json', 'Static Columns JSON', 4000),
      boolean('qdb_is_active', 'Is Active', false),
    ],
  },
  // Addendum C OQ-C1 = B: durable append-only DSAR erasure register (FR-CSE-082, NFR-CSE-013).
  // Change history on (CEO 2026-11-15, audit AUD-C-01): rows are only ever created, so the threat is a
  // privileged edit or delete, which is exactly what the platform audit records.
  {
    name: 'qdb_survey_erasure_log', label: 'Survey Erasure Log', pluralLabel: 'Survey Erasure Logs', isAuditEnabled: true,
    description: 'Append-only DSAR erasure register. One row per qdb_srv_EraseCustomerSurveyData execution (NFR-CSE-013).',
    columns: [
      // Stored as a plain string so the caller identity is preserved even if the system-user record is later deleted.
      string('qdb_caller_id', 'Caller', 100),
      // The customer GUID as plain text, with no lookup: it stays as evidence after the customer record is
      // deleted, and the log adds no navigable path back to the person it erased.
      string('qdb_customer_guid', 'Customer GUID', 100),
      // 100000000 = Delete, 100000001 = Anonymise; same values as ErasureMode enum in the plugin.
      integer('qdb_mode', 'Erasure Mode'),
      boolean('qdb_dry_run', 'Dry Run', false),
      integer('qdb_invitation_count', 'Invitation Count', { min: 0, max: 2147483647 }),
      integer('qdb_response_count', 'Response Count', { min: 0, max: 2147483647 }),
      integer('qdb_answer_count', 'Answer Count', { min: 0, max: 2147483647 }),
      integer('qdb_suppression_log_count', 'Suppression Log Count', { min: 0, max: 2147483647 }),
      // true in live mode (counts are of rows actually erased); false in dry-run (counts are found rows).
      boolean('qdb_are_actual', 'Are Actual', false),
      // false when the time budget ran out mid-run; re-invoke qdb_srv_EraseCustomerSurveyData until true.
      boolean('qdb_is_complete', 'Is Complete', false),
      dateTime('qdb_logged_on', 'Logged On'),
    ],
  },
]);

/**
 * Lookups. `cascade: 'Cascade'` only for true parent/child pairs; every other link is
 * RemoveLink so retention can delete an invitation without deleting its setup, and Restrict
 * is never used because it would block the daily retention pass.
 */
export const RELATIONSHIPS = Object.freeze([
  { lookup: 'qdb_survey_setup_id', label: 'Survey Setup', from: 'qdb_survey_trigger', to: 'qdb_survey_setup', cascade: 'Cascade', required: true },
  // Audit AUD-D-01 (CEO 2026-11-18): who started a One-time send; the run writes themselves are made by SYSTEM.
  { lookup: 'qdb_run_started_by', label: 'Run Started By', from: 'qdb_survey_trigger', to: 'systemuser', cascade: 'RemoveLink', schemaName: 'qdb_systemuser_qdb_survey_trigger_run_started_by' },
  { lookup: 'qdb_source_id', label: 'Source', from: 'qdb_survey_trigger', to: 'qdb_survey_source', cascade: 'RemoveLink' },
  { lookup: 'qdb_schedule_population_source_id', label: 'Population Source', from: 'qdb_survey_trigger', to: 'qdb_survey_source', cascade: 'RemoveLink' },
  { lookup: 'qdb_customer_id', label: 'Customer', from: 'qdb_survey_invitation', to: 'account', cascade: 'RemoveLink' },
  { lookup: 'qdb_customer_contact_id', label: 'Customer (Contact)', from: 'qdb_survey_invitation', to: 'contact', cascade: 'RemoveLink' },
  { lookup: 'qdb_survey_setup_id', label: 'Survey Setup', from: 'qdb_survey_invitation', to: 'qdb_survey_setup', cascade: 'RemoveLink' },
  { lookup: 'qdb_survey_trigger_id', label: 'Survey Trigger', from: 'qdb_survey_invitation', to: 'qdb_survey_trigger', cascade: 'RemoveLink' },
  { lookup: 'qdb_survey_invitation_id', label: 'Survey Invitation', from: 'qdb_survey_response', to: 'qdb_survey_invitation', cascade: 'Cascade' },
  { lookup: 'qdb_survey_setup_id', label: 'Survey Setup', from: 'qdb_survey_response', to: 'qdb_survey_setup', cascade: 'RemoveLink' },
  { lookup: 'qdb_customer_id', label: 'Customer', from: 'qdb_survey_response', to: 'account', cascade: 'RemoveLink' },
  { lookup: 'qdb_customer_contact_id', label: 'Customer (Contact)', from: 'qdb_survey_response', to: 'contact', cascade: 'RemoveLink' },
  { lookup: 'qdb_survey_response_id', label: 'Survey Response', from: 'qdb_survey_answer', to: 'qdb_survey_response', cascade: 'Cascade', required: true },
  { lookup: 'qdb_customer_id', label: 'Customer', from: 'qdb_survey_suppression_log', to: 'account', cascade: 'RemoveLink' },
  { lookup: 'qdb_customer_contact_id', label: 'Customer (Contact)', from: 'qdb_survey_suppression_log', to: 'contact', cascade: 'RemoveLink' },
  { lookup: 'qdb_survey_trigger_id', label: 'Survey Trigger', from: 'qdb_survey_suppression_log', to: 'qdb_survey_trigger', cascade: 'RemoveLink' },
  { lookup: 'qdb_survey_setup_id', label: 'Survey Setup', from: 'qdb_survey_suppression_log', to: 'qdb_survey_setup', cascade: 'RemoveLink' },
  // B7: the queue survey emails are sent from; empty = no email (FR-CSE-049).
  { lookup: 'qdb_email_sender_queue_id', label: 'Email Sender Queue', from: 'qdb_survey_settings', to: 'queue', cascade: 'RemoveLink' },
  // The erasure log (Addendum C, OQ-C1 = B) has no lookups on purpose: the caller and customer are kept as
  // text, so the evidence outlives those records and the log adds no navigable path back to the person.
]);

/** Alternate keys enforce uniqueness the plugins rely on (NFR-CSE-002, section 4.4/4.5). */
export const ALTERNATE_KEYS = Object.freeze([
  { name: 'qdb_survey_source_key', label: 'Source Table', table: 'qdb_survey_source', columns: ['qdb_table_logical_name'] },
  { name: 'qdb_invitation_dedupe', label: 'Dedupe Key', table: 'qdb_survey_invitation', columns: ['qdb_dedupe_key'] },
  { name: 'qdb_invitation_token', label: 'Token Hash', table: 'qdb_survey_invitation', columns: ['qdb_token_hash'] },
  { name: 'qdb_response_invitation', label: 'Invitation', table: 'qdb_survey_response', columns: ['qdb_survey_invitation_id'] },
]);

const CONFIG_TABLES = ['qdb_survey_setup', 'qdb_survey_trigger', 'qdb_survey_settings', 'qdb_survey_sms_config'];
const RUNTIME_TABLES = ['qdb_survey_invitation', 'qdb_survey_response', 'qdb_survey_answer'];
const FULL = ['Create', 'Read', 'Write', 'Delete', 'Append', 'AppendTo'];
const READ = ['Read', 'AppendTo'];
const EXPORT_TO_EXCEL = Object.freeze({ name: 'prvExportToExcel' });

/** The role qdb_srv_RunDueSurveys admits besides System Administrator; must equal SchedulerAccessCheck.SurveySchedulerRoleName. */
export const SCHEDULER_ROLE_NAME = 'Survey Scheduler';

/** The role qdb_srv_EraseCustomerSurveyData admits besides System Administrator; must equal ErasureAccessCheck.SurveyDataOfficerRoleName. */
export const DATA_OFFICER_ROLE_NAME = 'Survey Data Officer';

/**
 * Roles (section 11.1). Response and Answer content is readable ONLY by Survey Analyst and the
 * integration user (FR-CSE-060). The suppression log is Create + Read only for everyone, so it
 * stays append-only (NFR-CSE-001).
 */
export const ROLES = Object.freeze([
  {
    name: 'Survey Admin',
    privileges: [
      ...CONFIG_TABLES.map((table) => ({ table, rights: FULL })),
      // Read only (section 11.1): writing a source could flip it active, which is System Administrator only.
      { table: 'qdb_survey_source', rights: READ },
      { table: 'qdb_survey_invitation', rights: READ },
      { table: 'qdb_survey_suppression_log', rights: ['Read'] },
      // B7: choosing the email sender queue on Survey Settings links to a queue.
      { table: 'queue', rights: READ },
      // B8: export the suppression log and invitations to Excel.
      EXPORT_TO_EXCEL,
    ],
  },
  {
    name: 'Survey Analyst',
    privileges: [
      { table: 'qdb_survey_response', rights: READ },
      { table: 'qdb_survey_answer', rights: READ },
      { table: 'qdb_survey_invitation', rights: READ },
      { table: 'qdb_survey_setup', rights: READ },
      { table: 'qdb_survey_trigger', rights: READ },
      { table: 'qdb_survey_source', rights: READ },
      { table: 'account', rights: ['Read'] },
      { table: 'contact', rights: ['Read'] },
      // B8: FR-CSE-057 — analysts export filtered responses and answers to Excel.
      EXPORT_TO_EXCEL,
    ],
  },
  {
    // Review item 3 (2026-11-19): the four integration APIs admit this role by name (IntegrationAccessCheck.cs)
    // and do their work as SYSTEM, so the portal backend's account reads no survey or customer table directly
    // and cannot see other customers' data around the APIs. Read of the organization row is the platform
    // minimum, as for Survey Scheduler. revokeOn: tables this role granted before, removed from an existing role.
    name: 'Survey Integration',
    privileges: [{ table: 'organization', rights: ['Read'] }],
    revokeOn: [
      ...RUNTIME_TABLES, 'qdb_survey_suppression_log',
      'qdb_survey_source', 'qdb_survey_setup', 'qdb_survey_trigger', 'qdb_survey_settings', 'qdb_survey_sms_config',
      'account', 'contact', 'qdb_form_render_cache', 'qdb_form_definition',
    ],
  },
  {
    // CEO 2026-11-14 (Phase 6 audit SEC-01): the daily scheduler account holds only this role instead of
    // System Administrator. qdb_srv_RunDueSurveys admits it by name (SchedulerAccessCheck.cs) and does
    // its work as SYSTEM, so the role grants no survey or customer table rights. Read of the organization
    // row (as Basic User has) is kept because CRM 9.1 may refuse any call from a user with no privilege at
    // all, before the plugin runs; it cannot be tested from here (security review SUSPECTED-001).
    name: SCHEDULER_ROLE_NAME,
    privileges: [{ table: 'organization', rights: ['Read'] }],
  },
  {
    // Addendum C FR-CSE-082, ADR-008: least-privilege DSAR operations role (OQ-C1 = B, 2026-11-15).
    // qdb_srv_EraseCustomerSurveyData admits it by name (ErasureAccessCheck.cs) and runs as SYSTEM,
    // so the role grants no survey or customer table rights beyond the platform minimum (organization Read)
    // and read of the erasure log so Compliance staff can query the DSAR register directly.
    // Never assign to the portal integration account (FR-CSE-082 AC5).
    name: DATA_OFFICER_ROLE_NAME,
    privileges: [
      { table: 'organization', rights: ['Read'] },
      { table: 'qdb_survey_erasure_log', rights: ['Read'] },
    ],
  },
]);
