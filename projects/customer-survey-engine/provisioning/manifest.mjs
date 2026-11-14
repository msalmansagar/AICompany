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
  version: '1.0.0.0',
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
export const TRIGGER_KIND_OPTIONS = Object.freeze([option(0, 'Event'), option(1, 'Created'), option(2, 'Scheduled'), option(3, 'Milestone')]);
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
      string('qdb_schedule_period_key', 'Schedule Period Key', 20),
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
      // B7: where the customer's mobile number lives on account differs per org; empty = no SMS.
      string('qdb_customer_phone_field', 'Customer Mobile Field', 128),
      memo('qdb_static_columns_json', 'Static Columns JSON', 4000),
      boolean('qdb_is_active', 'Is Active', false),
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
    name: 'Survey Integration',
    privileges: [
      ...RUNTIME_TABLES.map((table) => ({ table, rights: ['Create', 'Read', 'Write', 'Append', 'AppendTo'] })),
      { table: 'qdb_survey_suppression_log', rights: ['Create', 'Read', 'Append'] },
      ...['qdb_survey_source', 'qdb_survey_setup', 'qdb_survey_trigger', 'qdb_survey_settings', 'qdb_survey_sms_config']
        .map((table) => ({ table, rights: READ })),
      // Linking an invitation to its customer needs AppendTo on the customer table (account or
      // contact, per qdb_customer_table); the published survey JSON and the form's type are read
      // from the DFE tables.
      { table: 'account', rights: ['Read', 'AppendTo'] },
      { table: 'contact', rights: ['Read', 'AppendTo'] },
      { table: 'qdb_form_render_cache', rights: ['Read'] },
      { table: 'qdb_form_definition', rights: ['Read'] },
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
]);
