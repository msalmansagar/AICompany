/**
 * plugin-steps.mjs
 * DCP-001 plugin step table â€” mirrors REGISTRATION.md exactly.
 *
 * Each entry drives one SDK message processing step registration.
 * Two manual corrections are applied here relative to the source document:
 *   - StatusTransitionValidatorPlugin / msst_dcpptprecord: filter on
 *     `statuscode` (the system status field), not the draft `msst_status`.
 */

export const ASSEMBLY_NAME = 'Msst.DebtCollection.Plugins';
export const SOLUTION_NAME = 'msst_debtcollection';

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
  // â”€â”€ AuditLogWriterPlugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpcollectioncase',   message: 'Create', stage: 40, mode: 1, filterAttributes: '', image: null },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpcollectioncase',   message: 'Update', stage: 40, mode: 1, filterAttributes: '', image: { alias: 'PreImage', attributes: '' } },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcploanfacility',     message: 'Create', stage: 40, mode: 1, filterAttributes: '', image: null },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcploanfacility',     message: 'Update', stage: 40, mode: 1, filterAttributes: '', image: { alias: 'PreImage', attributes: '' } },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpptprecord',        message: 'Create', stage: 40, mode: 1, filterAttributes: '', image: null },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpptprecord',        message: 'Update', stage: 40, mode: 1, filterAttributes: '', image: { alias: 'PreImage', attributes: '' } },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpcollectionaction', message: 'Create', stage: 40, mode: 1, filterAttributes: '', image: null },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpcollectionaction', message: 'Update', stage: 40, mode: 1, filterAttributes: '', image: { alias: 'PreImage', attributes: '' } },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpcommunication',    message: 'Create', stage: 40, mode: 1, filterAttributes: '', image: null },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpcommunication',    message: 'Update', stage: 40, mode: 1, filterAttributes: '', image: { alias: 'PreImage', attributes: '' } },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpcustomer',         message: 'Create', stage: 40, mode: 1, filterAttributes: '', image: null },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpcustomer',         message: 'Update', stage: 40, mode: 1, filterAttributes: '', image: { alias: 'PreImage', attributes: '' } },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpstrategyconfig',   message: 'Create', stage: 40, mode: 1, filterAttributes: '', image: null },
  { pluginType: 'AuditLogWriterPlugin', entity: 'msst_dcpstrategyconfig',   message: 'Update', stage: 40, mode: 1, filterAttributes: '', image: { alias: 'PreImage', attributes: '' } },

  // â”€â”€ StatusTransitionValidatorPlugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // PTP row corrected: filter on statuscode (system status), not msst_status.
  { pluginType: 'StatusTransitionValidatorPlugin', entity: 'msst_dcpcollectioncase', message: 'Update', stage: 20, mode: 0, filterAttributes: 'statuscode',  image: { alias: 'PreImage', attributes: 'statuscode,msst_customerid' } },
  { pluginType: 'StatusTransitionValidatorPlugin', entity: 'msst_dcpptprecord',      message: 'Update', stage: 20, mode: 0, filterAttributes: 'statuscode',  image: { alias: 'PreImage', attributes: 'statuscode' } },

  // â”€â”€ ImmutabilityGuardPlugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'msst_dcpdelinquencysnapshot', message: 'Update', stage: 10, mode: 0, filterAttributes: '', image: null },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'msst_dcpdelinquencysnapshot', message: 'Delete', stage: 10, mode: 0, filterAttributes: '', image: null },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'msst_dcpauditlog',            message: 'Update', stage: 10, mode: 0, filterAttributes: '', image: null },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'msst_dcpauditlog',            message: 'Delete', stage: 10, mode: 0, filterAttributes: '', image: null },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'msst_dcpcollectionaction',    message: 'Update', stage: 10, mode: 0, filterAttributes: 'statecode', image: { alias: 'PreImage', attributes: 'statecode' } },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'msst_dcpcollectionaction',    message: 'Delete', stage: 10, mode: 0, filterAttributes: '', image: { alias: 'PreImage', attributes: 'statecode' } },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'msst_dcpcommunication',       message: 'Update', stage: 10, mode: 0, filterAttributes: 'statecode', image: { alias: 'PreImage', attributes: 'statecode' } },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'msst_dcpcommunication',       message: 'Delete', stage: 10, mode: 0, filterAttributes: '', image: { alias: 'PreImage', attributes: 'statecode' } },
  { pluginType: 'ImmutabilityGuardPlugin', entity: 'msst_dcpcollectioncase',      message: 'Delete', stage: 10, mode: 0, filterAttributes: '', image: null },

  // -- DefaultStatusAssignerPlugin -------------------------------------------------
  // Runs before the record is written so statuscode=1 (the platform sentinel that has
  // no entry in the transition matrix) is replaced with the semantic starting point.
  { pluginType: 'DefaultStatusAssignerPlugin', entity: 'msst_dcpcollectioncase', message: 'Create', stage: 20, mode: 0, filterAttributes: '', image: null },
  { pluginType: 'DefaultStatusAssignerPlugin', entity: 'msst_dcpptprecord',      message: 'Create', stage: 20, mode: 0, filterAttributes: '', image: null },

  // â”€â”€ ActivitySubjectComposerPlugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { pluginType: 'ActivitySubjectComposerPlugin', entity: 'msst_dcpcollectionaction', message: 'Create', stage: 20, mode: 0, filterAttributes: 'msst_actiontype', image: null },
  { pluginType: 'ActivitySubjectComposerPlugin', entity: 'msst_dcpcommunication',    message: 'Create', stage: 20, mode: 0, filterAttributes: 'msst_channel',    image: null },

  // â”€â”€ StopContactQueueMoverPlugin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  { pluginType: 'StopContactQueueMoverPlugin', entity: 'msst_dcpcustomer', message: 'Update', stage: 40, mode: 1, filterAttributes: 'msst_stopcontact', image: { alias: 'PreImage', attributes: 'msst_stopcontact' } },
];



