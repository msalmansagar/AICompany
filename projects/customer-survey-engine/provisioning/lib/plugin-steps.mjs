/**
 * Registers the SurveyTriggerPlugin assembly, type and per-source steps. Steps are created
 * DISABLED: nothing runs on the request tables until a source is activated (B4), so this
 * registration has no effect on live saves. Plan mode writes nothing.
 *
 * @module survey-provisioning/plugin-steps
 */
import { PLUGIN, buildStepPayload, buildPreImagePayload, stepName } from './plugin-payloads.mjs';

const ASSEMBLY_COMPONENT_TYPE = 91;
const STEP_COMPONENT_TYPE = 92;
const SANDBOX_ISOLATION = 2;
const DATABASE_SOURCE = 0;

/**
 * Creates the assembly, or uploads new content when it exists.
 *
 * @param {{ client: object, dll: { base64: string, version: string }, solutionUniqueName: string, isApply: boolean, report: Function }} context
 * @returns {Promise<string|null>} The assembly id (null in plan mode when it does not exist yet).
 */
export async function ensureAssembly({ client, dll, solutionUniqueName, isApply, report }) {
  const existing = (await client.send('GET', `pluginassemblies?$select=pluginassemblyid,version&$filter=name eq '${PLUGIN.assemblyName}'`)).json.value[0];
  report(existing ? 'update' : 'create', `assembly ${PLUGIN.assemblyName} ${dll.version} (${Math.round(dll.base64.length / 1024)} KB base64)${existing ? `, replacing ${existing.version}` : ''}`);
  if (!isApply) return existing?.pluginassemblyid ?? null;
  if (existing) {
    await client.send('PATCH', `pluginassemblies(${existing.pluginassemblyid})`, { content: dll.base64, version: dll.version });
    return existing.pluginassemblyid;
  }
  const { entityId } = await client.send('POST', 'pluginassemblies', {
    name: PLUGIN.assemblyName, version: dll.version, culture: 'neutral', publickeytoken: PLUGIN.publicKeyToken,
    isolationmode: SANDBOX_ISOLATION, sourcetype: DATABASE_SOURCE, content: dll.base64,
  });
  await addToSolution(client, { id: entityId, type: ASSEMBLY_COMPONENT_TYPE, solutionUniqueName });
  return entityId;
}

/**
 * @param {{ client: object, assemblyId: string|null, isApply: boolean, report: Function }} context
 */
export async function ensurePluginType({ client, assemblyId, isApply, report }) {
  const existing = (await client.send('GET', `plugintypes?$select=plugintypeid&$filter=typename eq '${PLUGIN.typeName}'`)).json.value[0];
  if (existing) { report('exists', `plugin type ${PLUGIN.typeName}`); return existing.plugintypeid; }
  report('create', `plugin type ${PLUGIN.typeName}`);
  if (!isApply) return null;
  const { entityId } = await client.send('POST', 'plugintypes', {
    typename: PLUGIN.typeName, name: PLUGIN.typeName, friendlyname: 'SurveyTriggerPlugin',
    description: 'Generic survey trigger (CSE-ENG-001 section 6).', 'pluginassemblyid@odata.bind': `/pluginassemblies(${assemblyId})`,
  });
  return entityId;
}

/**
 * Ensures each step (and the Update pre-image) exists, disabled.
 *
 * @param {{ client: object, steps: object[], pluginTypeId: string|null, solutionUniqueName: string, isApply: boolean, report: Function }} context
 */
export async function ensureSteps(context) {
  for (const step of context.steps) await ensureStep(context, step);
}

async function ensureStep(context, step) {
  const { client, isApply, report } = context;
  const name = stepName(step.message, step.table);
  const existing = (await client.send('GET', `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,statecode&$filter=name eq '${name}'`)).json.value[0];
  if (existing) return report('exists', `step ${name} (${existing.statecode === 1 ? 'disabled' : 'ENABLED'})`);
  report('create', `step ${name}, disabled${step.message === 'Update' ? `, filtered to ${step.statusField}, pre-image ${step.statusField}` : ''}`);
  if (!isApply) return;
  const messageId = await findMessageId(client, step.message);
  const filterId = await findMessageFilterId(client, messageId, step.table);
  const { entityId } = await client.send('POST', 'sdkmessageprocessingsteps', buildStepPayload(step, { messageId, filterId, pluginTypeId: context.pluginTypeId }));
  if (step.message === 'Update') await client.send('POST', 'sdkmessageprocessingstepimages', buildPreImagePayload(step.statusField, entityId));
  await client.send('PATCH', `sdkmessageprocessingsteps(${entityId})`, { statecode: 1, statuscode: 2 });
  await addToSolution(client, { id: entityId, type: STEP_COMPONENT_TYPE, solutionUniqueName: context.solutionUniqueName });
}

async function findMessageId(client, messageName) {
  const row = (await client.send('GET', `sdkmessages?$select=sdkmessageid&$filter=name eq '${messageName}'`)).json.value[0];
  if (!row) throw new Error(`SDK message ${messageName} not found`);
  return row.sdkmessageid;
}

async function findMessageFilterId(client, messageId, table) {
  const filter = `_sdkmessageid_value eq ${messageId} and primaryobjecttypecode eq '${table}'`;
  const row = (await client.send('GET', `sdkmessagefilters?$select=sdkmessagefilterid&$filter=${encodeURIComponent(filter)}`)).json.value[0];
  if (!row) throw new Error(`No message filter for ${table}; is the table on this org?`);
  return row.sdkmessagefilterid;
}

async function addToSolution(client, { id, type, solutionUniqueName }) {
  await client.send('POST', 'AddSolutionComponent', {
    ComponentId: id, ComponentType: type, SolutionUniqueName: solutionUniqueName, AddRequiredComponents: false, DoNotIncludeSubcomponents: false,
  });
}
