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

const CUSTOM_API_GLOBAL_BINDING = 0;
const CUSTOM_API_NO_CUSTOM_STEPS = 0;
const PARAMETER_TYPE = Object.freeze({ boolean: 0, integer: 7, string: 10, guid: 12 });

const stringInput = (name, description, isOptional = true) => ({ name, displayName: name, description, type: PARAMETER_TYPE.string, isOptional });
const stringOutput = (name, description) => ({ name, displayName: name, description, type: PARAMETER_TYPE.string });
const INVITATION_INPUTS = Object.freeze([
  stringInput('InvitationId', 'The invitation id (GUID); needs CallerCustomerId.'),
  stringInput('CallerCustomerId', 'The authenticated customer\'s account id (GUID); the invitation must belong to it.'),
  stringInput('Token', 'A secure-link token instead of InvitationId + CallerCustomerId.'),
]);

const SOURCE_ID_INPUT = Object.freeze({ name: 'SourceId', displayName: 'Source Id', description: 'The qdb_survey_source to act on.', type: PARAMETER_TYPE.guid, isOptional: false });
const MESSAGE_OUTPUT = Object.freeze({ name: 'Message', displayName: 'Message', description: 'What was done.', type: PARAMETER_TYPE.string });

/** The survey Custom APIs (A1, A3), the plugin type behind each, and their inputs and outputs. */
export const CUSTOM_APIS = Object.freeze([
  { uniqueName: 'qdb_srv_ActivateSource', displayName: 'Activate Survey Source', typeName: 'Qdb.SurveyEngine.Plugins.ActivateSourcePlugin',
    description: 'Enables (or creates) the survey trigger steps for a source and marks it active. System Administrator only (FR-CSE-003).',
    inputs: [SOURCE_ID_INPUT], outputs: [MESSAGE_OUTPUT] },
  { uniqueName: 'qdb_srv_DeactivateSource', displayName: 'Deactivate Survey Source', typeName: 'Qdb.SurveyEngine.Plugins.DeactivateSourcePlugin',
    description: 'Deletes the steps activation created, disables the rest, and marks the source inactive. System Administrator only (FR-CSE-003).',
    inputs: [SOURCE_ID_INPUT], outputs: [MESSAGE_OUTPUT] },
  { uniqueName: 'qdb_srv_RunDueSurveys', displayName: 'Run Due Surveys', typeName: 'Qdb.SurveyEngine.Plugins.RunDueSurveysPlugin',
    description: 'Daily job: releases postponed invitations, runs scheduled triggers due today, applies response retention. Call again while IsComplete is false. System Administrator only (FR-CSE-033, 042, 058).',
    inputs: [{ name: 'RunDate', displayName: 'Run Date', description: 'The scheduler\'s local date, yyyy-MM-dd; empty = today in UTC.', type: PARAMETER_TYPE.string, isOptional: true }],
    outputs: [
      { name: 'Summary', displayName: 'Summary', description: 'What each pass did.', type: PARAMETER_TYPE.string },
      { name: 'IsComplete', displayName: 'Is Complete', description: 'False when the time budget ran out; call again.', type: PARAMETER_TYPE.boolean },
    ] },
  integrationApi('qdb_srv_ListPendingSurveys', 'List Pending Surveys', 'ListPendingSurveysPlugin',
    'A customer\'s open survey invitations with title and message in the requested language (FR-CSE-051, 047).',
    [stringInput('CustomerId', 'The account id (GUID).', false), stringInput('Language', 'ar or en; empty = the org default.')],
    [stringOutput('SurveysJson', 'JSON array of { invitationId, setupId, formCode, title, message, pinnedVersion, language, expiresOn, channel }.')]),
  integrationApi('qdb_srv_GetSurvey', 'Get Survey', 'GetSurveyPlugin',
    'The published survey JSON of an invitation\'s pinned version (FR-CSE-052). Give InvitationId + CallerCustomerId, or Token.',
    [...INVITATION_INPUTS, stringInput('Language', 'ar or en; empty = the invitation\'s language.')],
    [stringOutput('FormCode', 'The survey form code.'), { name: 'Version', displayName: 'Version', description: 'The pinned form version.', type: PARAMETER_TYPE.integer },
      stringOutput('RenderedLanguage', 'The language returned.'), stringOutput('RuntimeJson', 'The DFE runtime JSON to render.')]),
  integrationApi('qdb_srv_SubmitResponse', 'Submit Survey Response', 'SubmitResponsePlugin',
    'Validates the invitation and writes one Response, its Answers and the answers JSON, then closes the invitation (FR-CSE-053, 056).',
    [...INVITATION_INPUTS, stringInput('AnswersJson', 'JSON array of { questionCode, value } with value as text.', false)],
    [stringOutput('ResponseId', 'The new response id.'), stringOutput('Status', 'submitted')]),
  integrationApi('qdb_srv_ValidateLinkToken', 'Validate Survey Link Token', 'ValidateLinkTokenPlugin',
    'The invitation a secure-link token unlocks, or why not: used, expired or unknown (FR-CSE-054).',
    [stringInput('Token', 'The token from the link.', false)],
    [{ name: 'Valid', displayName: 'Valid', description: 'True when the token opens an invitation.', type: PARAMETER_TYPE.boolean },
      stringOutput('Reason', 'used, expired or unknown when not valid.'), stringOutput('InvitationId', 'The unlocked invitation.'),
      stringOutput('SetupId', 'Its setup.'), stringOutput('FormCode', 'Its form code.'), stringOutput('Language', 'Its language.')]),
]);

/** The integration APIs run as the calling user, so the Survey Integration role decides who may call them. */
function integrationApi(uniqueName, displayName, pluginClass, description, inputs, outputs) {
  return { uniqueName, displayName, typeName: `Qdb.SurveyEngine.Plugins.${pluginClass}`, description: `${description} Requires the Survey Integration role.`, inputs, outputs };
}

/** An unbound Custom API action, created with its parameters and properties in one deep insert. */
export function buildCustomApiPayload(api, pluginTypeId) {
  return {
    uniquename: api.uniqueName, name: api.uniqueName, displayname: api.displayName, description: api.description,
    bindingtype: CUSTOM_API_GLOBAL_BINDING, isfunction: false, isprivate: false, allowedcustomprocessingsteptype: CUSTOM_API_NO_CUSTOM_STEPS,
    'PluginTypeId@odata.bind': `/plugintypes(${pluginTypeId})`,
    CustomAPIRequestParameters: api.inputs.map((input) => ({
      uniquename: input.name, name: input.name, displayname: input.displayName, description: input.description, type: input.type, isoptional: input.isOptional,
    })),
    CustomAPIResponseProperties: api.outputs.map((output) => ({
      uniquename: output.name, name: output.name, displayname: output.displayName, description: output.description, type: output.type,
    })),
  };
}

/** "SourceId → Message" style signature for plan output. */
export function describeSignature(api) {
  return `${api.inputs.map((i) => i.name).join(', ') || '(none)'} → ${api.outputs.map((o) => o.name).join(', ')}`;
}

/** The Create and Update steps for each seed source. */
export function stepsForSources(sources) {
  return sources.flatMap((source) => ['Create', 'Update'].map((message) => ({
    message, table: source.qdb_table_logical_name, statusField: source.qdb_status_field ?? 'statuscode',
  })));
}
