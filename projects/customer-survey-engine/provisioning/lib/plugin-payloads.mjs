/**
 * Payloads for registering SurveyTriggerPlugin (phase-3-arch.md section 6.1). Pure.
 *
 * @module survey-provisioning/plugin-payloads
 */

export const PLUGIN = Object.freeze({
  assemblyName: 'Qdb.SurveyEngine',
  // Same company key as Qdb.FormEngine (Qdb.FormEngine.snk); verified from the built DLL.
  publicKeyToken: 'cf86d1ff95e88037',
  typeName: 'Qdb.SurveyEngine.Plugins.SurveyTriggerPlugin',
  preImageName: 'PreImage',
});

const ASYNC_MODE = 1;
const POST_OPERATION_STAGE = 40;
const PRE_IMAGE_TYPE = 0;
const SERVER_DEPLOYMENT = 0;

/** The step name, which is also how the registration finds an existing step. */
export function stepName(message, table) {
  return `${PLUGIN.typeName}: Async ${message} of ${table}`;
}

/**
 * An async post-operation step. Update is filtered to the status field so other saves never
 * queue a job. Successful async jobs delete themselves to keep System Jobs readable.
 *
 * @param {{ message: 'Create' | 'Update', table: string, statusField: string }} step
 * @param {{ messageId: string, filterId: string, pluginTypeId: string }} ids
 */
export function buildStepPayload(step, ids) {
  return {
    name: stepName(step.message, step.table),
    description: `Survey triggers for ${step.table} (FR-CSE-026..030). Enabled when the source is activated.`,
    mode: ASYNC_MODE,
    stage: POST_OPERATION_STAGE,
    rank: 1,
    supporteddeployment: SERVER_DEPLOYMENT,
    asyncautodelete: true,
    ...(step.message === 'Update' ? { filteringattributes: step.statusField } : {}),
    'sdkmessageid@odata.bind': `/sdkmessages(${ids.messageId})`,
    'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${ids.filterId})`,
    'plugintypeid@odata.bind': `/plugintypes(${ids.pluginTypeId})`,
  };
}

/** The Update step's pre-image: only the status field, since the plugin reads the rest fresh. */
export function buildPreImagePayload(statusField, stepId) {
  return {
    name: PLUGIN.preImageName,
    entityalias: PLUGIN.preImageName,
    imagetype: PRE_IMAGE_TYPE,
    messagepropertyname: 'Target',
    attributes: statusField,
    'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${stepId})`,
  };
}

/** The Create and Update steps for each seed source. */
export function stepsForSources(sources) {
  return sources.flatMap((source) => ['Create', 'Update'].map((message) => ({
    message, table: source.qdb_table_logical_name, statusField: source.qdb_status_field ?? 'statuscode',
  })));
}
