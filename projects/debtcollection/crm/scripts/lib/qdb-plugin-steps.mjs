/**
 * qdb-plugin-steps.mjs
 * Plugin step table for the canonical `qdb_` schema.
 *
 * A separate module from `plugin-steps.mjs` on purpose: that table drives the `msst_`
 * registration that is live on the organisation, and Phase 1 must not disturb what is running.
 * The old assembly and its steps stay registered throughout; these steps are additions.
 *
 * Two plugins from the `msst_` table have no step here, and that is deliberate:
 *   • AuditLogWriterPlugin — the canonical schema records business history through the platform's
 *     native audit, so there is no audit table to write to.
 *   • StopContactQueueMoverPlugin — its trigger is a contact-hold column on a QDB customer master.
 *     The platform does not own that master and QDB has not yet confirmed which column carries the
 *     flag, so registering a step now would mean guessing the entity. The plugin ships ready:
 *     register it against the confirmed entity with
 *     `holdAttribute=<logical name>` in the step's unsecure configuration.
 */

export const ASSEMBLY_NAME = 'Qdb.DebtCollection.Plugins';
export const SOLUTION_NAME = 'qdb_debtcollection';

/**
 * @typedef {{ alias: string, attributes: string }} StepImage
 * attributes: comma-separated column names, or '' to capture all attributes.
 */

/**
 * @typedef {Object} PluginStep
 * @property {string}      pluginType         Short class name (no namespace).
 * @property {string}      entity             Primary entity logical name.
 * @property {string}      message            SDK message (Create / Update / Delete).
 * @property {10|20|40}    stage              10 PreValidation, 20 PreOperation, 40 PostOperation.
 * @property {0|1}         mode               0 Synchronous, 1 Asynchronous.
 * @property {string}      filterAttributes   Comma-separated attrs to filter on, '' = all.
 * @property {StepImage|null} image           PreImage configuration, or null.
 */

/** @type {PluginStep[]} */
export const PLUGIN_STEPS = [
  // ── DefaultStatusAssignerPlugin ─────────────────────────────────────────────
  // Runs before the record is written so statuscode=1 (the platform sentinel that has no entry
  // in the transition matrix) is replaced with the semantic starting point.
  { pluginType: 'DefaultStatusAssignerPlugin', entity: 'qdb_collectioncase',     message: 'Create', stage: 20, mode: 0, filterAttributes: '', image: null },
  { pluginType: 'DefaultStatusAssignerPlugin', entity: 'qdb_collectionactivity', message: 'Create', stage: 20, mode: 0, filterAttributes: '', image: null },

  // ── StatusTransitionValidatorPlugin ─────────────────────────────────────────
  // The case filters on statuscode; the activity filters on qdb_ptpstatus, because promise-to-pay
  // is an activity type in the canonical schema and its lifecycle lives on its own column.
  { pluginType: 'StatusTransitionValidatorPlugin', entity: 'qdb_collectioncase',     message: 'Update', stage: 20, mode: 0, filterAttributes: 'statuscode',    image: { alias: 'PreImage', attributes: 'statuscode,qdb_customerid' } },
  { pluginType: 'StatusTransitionValidatorPlugin', entity: 'qdb_collectionactivity', message: 'Update', stage: 20, mode: 0, filterAttributes: 'qdb_ptpstatus', image: { alias: 'PreImage', attributes: 'qdb_ptpstatus' } },

  // ── ImmutabilityGuardPlugin ─────────────────────────────────────────────────
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'qdb_delinquencysnapshot', message: 'Update', stage: 10, mode: 0, filterAttributes: '',          image: null },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'qdb_delinquencysnapshot', message: 'Delete', stage: 10, mode: 0, filterAttributes: '',          image: null },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'qdb_collectionactivity',  message: 'Update', stage: 10, mode: 0, filterAttributes: '',          image: { alias: 'PreImage', attributes: 'statecode' } },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'qdb_collectionactivity',  message: 'Delete', stage: 10, mode: 0, filterAttributes: '',          image: { alias: 'PreImage', attributes: 'statecode' } },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'qdb_collectioncase',      message: 'Delete', stage: 10, mode: 0, filterAttributes: '',          image: null },

  // ── ActiveCaseGuardPlugin (Phase 2) ─────────────────────────────────────────
  // One active case per facility per episode, where the facility is its MIS identity. Create is
  // always checked; Update only when statecode is set back to Active, hence the filter and the
  // pre-image carrying the two facility columns.
  { pluginType: 'ActiveCaseGuardPlugin', entity: 'qdb_collectioncase', message: 'Create', stage: 20, mode: 0, filterAttributes: '',          image: null },
  { pluginType: 'ActiveCaseGuardPlugin', entity: 'qdb_collectioncase', message: 'Update', stage: 20, mode: 0, filterAttributes: 'statecode', image: { alias: 'PreImage', attributes: 'qdb_facilitynumber,qdb_facilitysourcesystem' } },

  // ── ActivitySubjectComposerPlugin ───────────────────────────────────────────
  { pluginType: 'ActivitySubjectComposerPlugin', entity: 'qdb_collectionactivity', message: 'Create', stage: 20, mode: 0, filterAttributes: 'qdb_activitytypeid', image: null },
];
