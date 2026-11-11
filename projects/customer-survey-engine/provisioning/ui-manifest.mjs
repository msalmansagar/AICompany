/**
 * SurveyEngine UI manifest (B8, FR-CSE-057 and the admin screens): public views, charts, main
 * forms and the "Survey Engine" model-driven app. Declarative like manifest.mjs; the UI
 * provisioner turns it into Dataverse customizations. Field types come from manifest.mjs, so
 * a column named here must exist there.
 *
 * @module survey-provisioning/ui-manifest
 */

const PENDING = 100000000;

/** Public views. Columns are [logicalName, width]; `links` add columns from a related table. */
export const VIEWS = Object.freeze([
  {
    table: 'qdb_survey_response', name: 'Survey Responses - All', description: 'Every submitted response, newest first (FR-CSE-057).', isDefault: true,
    columns: [['qdb_name', 220], ['qdb_survey_setup_id', 180], ['qdb_customer_id', 200], ['qdb_submitted_on', 140], ['qdb_score_percent', 90], ['qdb_score_total', 80], ['qdb_score_max', 90],
      ['qdb_form_code', 170], ['qdb_language_code', 80], ['qdb_source_table', 170]],
    order: { attribute: 'qdb_submitted_on', descending: true },
  },
  {
    table: 'qdb_survey_answer', name: 'Survey Answers - All', description: 'One row per answered question, with its setup, customer and date (FR-CSE-057).', isDefault: true,
    columns: [['qdb_survey_response_id', 200], ['qdb_question_order', 70], ['qdb_question_label', 280], ['qdb_answer_text', 240], ['qdb_answer_numeric', 90], ['qdb_points', 70], ['qdb_weighted_points', 90]],
    links: [{ alias: 'response', table: 'qdb_survey_response', lookup: 'qdb_survey_response_id', columns: [['qdb_survey_setup_id', 170], ['qdb_customer_id', 180], ['qdb_submitted_on', 130]] }],
    order: { attribute: 'qdb_question_order', descending: false },
  },
  {
    table: 'qdb_survey_invitation', name: 'Open Survey Invitations', description: 'Pending invitations not yet answered.',
    columns: [['qdb_name', 240], ['qdb_customer_id', 200], ['qdb_survey_setup_id', 180], ['qdb_channel', 100], ['qdb_generated_on', 140], ['qdb_expires_on', 140]],
    filters: [['qdb_status', 'eq', PENDING]], order: { attribute: 'qdb_generated_on', descending: true },
  },
  {
    table: 'qdb_survey_invitation', name: 'Survey Invitations - All', description: 'Every invitation with its status.', isDefault: true,
    columns: [['qdb_name', 240], ['qdb_customer_id', 200], ['qdb_survey_setup_id', 180], ['qdb_status', 100], ['qdb_channel', 100], ['qdb_generated_on', 140], ['qdb_expires_on', 140]],
    order: { attribute: 'qdb_generated_on', descending: true },
  },
  {
    table: 'qdb_survey_suppression_log', name: 'Survey Suppressions - Last 30 Days', description: 'Why triggers did not send, last 30 days (NFR-CSE-001).', isDefault: true,
    columns: [['qdb_logged_on', 140], ['qdb_reason', 140], ['qdb_customer_id', 200], ['qdb_survey_setup_id', 180], ['qdb_detail', 400]],
    filters: [['qdb_logged_on', 'last-x-days', 30]], order: { attribute: 'qdb_logged_on', descending: true },
  },
  // "Active" keeps the CRM meaning (not deactivated): every setup, switched on or off, so the main
  // list is never empty just because every setup is switched off (seen live, 2026-11-11).
  {
    table: 'qdb_survey_setup', name: 'Active Survey Setups', description: 'Every setup, switched on or off.',
    columns: [['qdb_name', 240], ['qdb_is_active', 90], ['qdb_form_code', 180], ['qdb_delivery_digital', 120], ['qdb_delivery_legacy', 120], ['qdb_active_from', 110], ['qdb_active_to', 110], ['qdb_expiry_days', 90]],
    order: { attribute: 'qdb_name', descending: false }, isDefault: true,
  },
  {
    table: 'qdb_survey_setup', name: 'Survey Setups - Switched On', description: 'Setups whose Is Active switch is on, so they can send.',
    columns: [['qdb_name', 240], ['qdb_form_code', 180], ['qdb_delivery_digital', 120], ['qdb_delivery_legacy', 120], ['qdb_active_from', 110], ['qdb_active_to', 110], ['qdb_expiry_days', 90]],
    filters: [['qdb_is_active', 'eq', 1]], order: { attribute: 'qdb_name', descending: false },
  },
  {
    table: 'qdb_survey_trigger', name: 'Survey Triggers - All', description: 'Every trigger with its setup and kind; also the Triggers list on the setup form.',
    columns: [['qdb_name', 260], ['qdb_survey_setup_id', 180], ['qdb_trigger_kind', 110], ['qdb_source_id', 160], ['qdb_priority', 80], ['qdb_is_active', 80]],
    order: { attribute: 'qdb_name', descending: false },
  },
]);

/** Charts. `measure` is an aggregate; `groupBy` may carry a dategrouping. */
export const CHARTS = Object.freeze([
  {
    table: 'qdb_survey_answer', name: 'Average Score by Question', description: 'Average rating or numeric answer per question (FR-CSE-057).', type: 'Bar',
    measure: { attribute: 'qdb_answer_numeric', aggregate: 'avg' }, groupBy: { attribute: 'qdb_question_label' }, filters: [['qdb_answer_numeric', 'not-null']],
  },
  {
    table: 'qdb_survey_response', name: 'Average Score % by Setup', description: 'Average weighted score percentage per survey setup (Addendum A, FR-CSE-069).', type: 'Column',
    measure: { attribute: 'qdb_score_percent', aggregate: 'avg' }, groupBy: { attribute: 'qdb_survey_setup_id' }, filters: [['qdb_score_percent', 'not-null']],
  },
  {
    table: 'qdb_survey_response', name: 'Responses by Setup', description: 'Number of responses per survey setup.', type: 'Column',
    measure: { attribute: 'qdb_survey_responseid', aggregate: 'count' }, groupBy: { attribute: 'qdb_survey_setup_id' },
  },
  {
    table: 'qdb_survey_response', name: 'Responses by Month', description: 'Number of responses per month.', type: 'Line',
    measure: { attribute: 'qdb_survey_responseid', aggregate: 'count' }, groupBy: { attribute: 'qdb_submitted_on', dategrouping: 'month' },
  },
  {
    table: 'qdb_survey_suppression_log', name: 'Suppressions by Reason', description: 'Why triggers did not send.', type: 'Pie',
    measure: { attribute: 'qdb_survey_suppression_logid', aggregate: 'count' }, groupBy: { attribute: 'qdb_reason' },
  },
]);

/**
 * Main forms: tabs of sections of fields. A field may be { name, readOnly: true }; a subgrid is
 * { subgrid: childTable, lookup, view } listing the child rows of this record.
 */
export const FORMS = Object.freeze([
  {
    table: 'qdb_survey_setup',
    tabs: [
      { label: 'Survey', sections: [
        { label: 'Survey', fields: ['qdb_name', 'qdb_form_code', 'qdb_is_active'] },
        { label: 'Delivery', fields: ['qdb_delivery_digital', 'qdb_delivery_legacy', 'qdb_expiry_days'] },
        { label: 'Active window', fields: ['qdb_active_from', 'qdb_active_to'] },
      ] },
      { label: 'Notification', sections: [
        { label: 'English', fields: ['qdb_notif_title_en', 'qdb_notif_message_en'] },
        { label: 'Arabic', fields: ['qdb_notif_title_ar', 'qdb_notif_message_ar'] },
      ] },
      { label: 'Triggers', sections: [{ label: 'Triggers', subgrid: { table: 'qdb_survey_trigger', lookup: 'qdb_survey_setup_id', view: 'Survey Triggers - All' } }] },
      { label: 'Responses', sections: [{ label: 'Responses', subgrid: { table: 'qdb_survey_response', lookup: 'qdb_survey_setup_id', view: 'Survey Responses - All' } }] },
    ],
  },
  {
    table: 'qdb_survey_trigger',
    tabs: [{ label: 'Trigger', sections: [
      { label: 'Trigger', fields: ['qdb_name', 'qdb_survey_setup_id', 'qdb_trigger_kind', 'qdb_is_active', 'qdb_priority', 'qdb_fatigue_action'] },
      { label: 'Event and Created', fields: ['qdb_source_id', 'qdb_status_values', 'qdb_type_values'] },
      { label: 'Scheduled', fields: ['qdb_schedule_period', 'qdb_schedule_population', 'qdb_schedule_population_source_id'] },
      { label: 'Milestone', fields: ['qdb_milestone_every_n', 'qdb_milestone_status_values', 'qdb_milestone_type_values', 'qdb_milestone_count_from', 'qdb_milestone_skip_reached'] },
    ] }],
  },
  {
    table: 'qdb_survey_source',
    tabs: [{ label: 'Source', sections: [
      { label: 'Request table', fields: ['qdb_name', 'qdb_table_logical_name', 'qdb_customer_lookup_field', 'qdb_status_field', 'qdb_type_field'] },
      { label: 'Channel and milestones', fields: ['qdb_origin_field', 'qdb_origin_digital_values', 'qdb_counts_toward_milestones'] },
      // Activation goes through qdb_srv_ActivateSource (System Administrator only), never this form.
      { label: 'Activation', fields: [{ name: 'qdb_is_active', readOnly: true }, { name: 'qdb_step_registration_json', readOnly: true }] },
    ] }],
  },
  {
    table: 'qdb_survey_settings',
    tabs: [{ label: 'Settings', sections: [
      { label: 'Invitations', fields: ['qdb_name', 'qdb_fatigue_min_days', 'qdb_default_language', 'qdb_language_field'] },
      { label: 'Retention (set by QDB Compliance)', fields: ['qdb_retention_days', 'qdb_retention_mode'] },
      { label: 'Secure link', fields: ['qdb_securelink_enabled', 'qdb_securelink_base_url', 'qdb_email_sender_queue_id'] },
    ] }],
  },
  {
    table: 'qdb_survey_sms_config',
    tabs: [{ label: 'SMS hand-off', sections: [
      { label: 'SMS table', fields: ['qdb_name', 'qdb_sms_table_logical_name', 'qdb_recipient_field', 'qdb_message_field', 'qdb_customer_link_field', 'qdb_is_active'] },
      { label: 'Customer and constants', fields: ['qdb_customer_phone_field', 'qdb_static_columns_json'] },
    ] }],
  },
  {
    table: 'qdb_survey_response',
    tabs: [
      { label: 'Response', sections: [
        { label: 'Response', fields: [{ name: 'qdb_name', readOnly: true }, { name: 'qdb_survey_setup_id', readOnly: true }, { name: 'qdb_customer_id', readOnly: true }, { name: 'qdb_survey_invitation_id', readOnly: true }, { name: 'qdb_submitted_on', readOnly: true }] },
        { label: 'Score (weighted surveys)', fields: [{ name: 'qdb_score_percent', readOnly: true }, { name: 'qdb_score_total', readOnly: true }, { name: 'qdb_score_max', readOnly: true }] },
        { label: 'Survey', fields: [{ name: 'qdb_form_code', readOnly: true }, { name: 'qdb_pinned_version', readOnly: true }, { name: 'qdb_language_code', readOnly: true }, { name: 'qdb_source_table', readOnly: true }, { name: 'qdb_source_record_id', readOnly: true }] },
      ] },
      { label: 'Answers', sections: [{ label: 'Answers', subgrid: { table: 'qdb_survey_answer', lookup: 'qdb_survey_response_id', view: 'Survey Answers - All' } }] },
    ],
  },
]);

/** The model-driven app: one area, a Configuration group and a Results group. */
export const APP = Object.freeze({
  uniqueName: 'qdb_SurveyEngine',
  name: 'Survey Engine',
  description: 'Configure customer surveys and read their results (CSE-ENG-001).',
  roles: ['Survey Admin', 'Survey Analyst'],
  groups: [
    { id: 'qdb_survey_config', title: 'Configuration', tables: ['qdb_survey_setup', 'qdb_survey_trigger', 'qdb_survey_source', 'qdb_survey_settings', 'qdb_survey_sms_config'] },
    { id: 'qdb_survey_results', title: 'Results', tables: ['qdb_survey_response', 'qdb_survey_answer', 'qdb_survey_invitation', 'qdb_survey_suppression_log'] },
  ],
});
