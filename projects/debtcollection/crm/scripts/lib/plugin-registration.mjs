/**
 * plugin-registration.mjs
 * Idempotent ensure-* helpers for Dataverse plugin registration.
 *
 * All mutating helpers accept a dryRun flag; when true they log intent
 * without making any HTTP calls and return a placeholder id.
 */

import { createHash } from 'crypto';
import { apiGet, apiPost, buildHeaders } from './crm-client.mjs';

/** @type {Record<number, string>} */
const STAGE_NAMES = { 10: 'PreValidation', 20: 'PreOperation', 40: 'PostOperation' };

const DRY_RUN_ID = '00000000-0000-0000-0000-000000000000';

// ── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Computes the SHA-256 hex digest of a buffer.
 * @param {Buffer} buf
 * @returns {string}
 */
export function hashDll(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Builds the deterministic step name.
 * Format: `<PluginType>: <Message> of <entity> (<stageName>)`
 * @param {string} pluginType @param {string} entity @param {string} message @param {number} stage
 * @returns {string}
 */
export function buildStepName(pluginType, entity, message, stage) {
  return `${pluginType}: ${message} of ${entity} (${STAGE_NAMES[stage]})`;
}

// ── Private HTTP helper ───────────────────────────────────────────────────────

/**
 * Sends a PATCH to a Dataverse entity record.
 * @param {{ apiBase: string }} cfg @param {string} token @param {string} solutionName @param {string} path @param {object} body
 * @returns {Promise<void>}
 */
/** DELETE helper for registration components; 404 counts as already gone. */
async function apiDelete(cfg, token, solutionName, path) {
  const res = await fetch(`${cfg.apiBase}${path}`, { method: 'DELETE', headers: buildHeaders(token, solutionName) });
  if (res.status === 404) return;
  if (!res.ok) throw new Error(`DELETE ${path} \u2192 ${res.status}: ${await res.text()}`);
}
async function apiPatch(cfg, token, solutionName, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method:  'PATCH',
    headers: buildHeaders(token, solutionName),
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`);
}

// ── Lookup helpers ────────────────────────────────────────────────────────────

/**
 * Finds an SDK message record by name. Throws if absent.
 * @param {{ cfg: object, token: string, solutionName: string, messageName: string }} params
 * @returns {Promise<string>} sdkmessageid
 */
export async function resolveMessage({ cfg, token, solutionName, messageName }) {
  const result = await apiGet(
    cfg, token, solutionName,
    `/sdkmessages?$select=sdkmessageid,name&$filter=name eq '${messageName}'&$top=1`,
  );
  const msg = result?.value?.[0];
  if (!msg) throw new Error(`SDK message '${messageName}' not found in this org.`);
  return msg.sdkmessageid;
}

/**
 * Finds an existing SDK message filter; creates one if absent.
 * @param {{ cfg: object, token: string, solutionName: string, messageId: string, entity: string, dryRun: boolean }} params
 * @returns {Promise<string>} sdkmessagefilterid, or DRY_RUN_ID in dry-run.
 */
export async function resolveFilter({ cfg, token, solutionName, messageId, entity, dryRun }) {
  const result = await apiGet(
    cfg, token, solutionName,
    `/sdkmessagefilters?$select=sdkmessagefilterid` +
    `&$filter=primaryobjecttypecode eq '${entity}' and _sdkmessageid_value eq ${messageId}&$top=1`,
  );
  if (result?.value?.length) return result.value[0].sdkmessagefilterid;
  if (dryRun) {
    console.log(`  [DRY RUN] would create sdkmessagefilter for ${entity}`);
    return DRY_RUN_ID;
  }
  const { entityId } = await apiPost(cfg, token, solutionName, '/sdkmessagefilters', {
    'sdkmessageid@odata.bind':  `/sdkmessages(${messageId})`,
    primaryobjecttypecode:      entity,
    secondaryobjecttypecode:    'none',
    availability:               0,
  });
  if (!entityId) throw new Error(`Created filter for ${entity} but no entityId was returned.`);
  return entityId;
}

// ── Ensure helpers ────────────────────────────────────────────────────────────

/**
 * Creates or patches the plugin assembly.
 * Uses a sha256 digest in the description field to detect content drift.
 * @param {{ cfg: object, token: string, solutionName: string, assemblyName: string, dllBuffer: Buffer, dllHash: string, dryRun: boolean }} params
 * @returns {Promise<{ id: string, action: 'created'|'updated'|'skipped' }>}
 */
export async function ensureAssembly({ cfg, token, solutionName, assemblyName, dllBuffer, dllHash, dryRun }) {
  const existing = await apiGet(
    cfg, token, solutionName,
    `/pluginassemblies?$select=pluginassemblyid,name,description&$filter=name eq '${assemblyName}'&$top=1`,
  );
  const record = existing?.value?.[0];
  if (record) {
    return patchAssemblyIfChanged({ cfg, token, solutionName, record, dllBuffer, dllHash, dryRun });
  }
  return createAssembly({ cfg, token, solutionName, assemblyName, dllBuffer, dllHash, dryRun });
}

async function patchAssemblyIfChanged({ cfg, token, solutionName, record, dllBuffer, dllHash, dryRun }) {
  const storedHash = (record.description ?? '').replace(/^sha256:/, '');
  if (storedHash === dllHash) {
    console.log(`  Assembly up to date (${record.pluginassemblyid})`);
    return { id: record.pluginassemblyid, action: 'skipped' };
  }
  console.log(`  Assembly content changed — ${dryRun ? '[DRY RUN] would PATCH' : 'patching'}...`);
  if (!dryRun) {
    await apiPatch(cfg, token, solutionName, `/pluginassemblies(${record.pluginassemblyid})`, {
      content:     dllBuffer.toString('base64'),
      description: `sha256:${dllHash}`,
      version:     '1.0.0.0',
    });
  }
  return { id: record.pluginassemblyid, action: 'updated' };
}

async function createAssembly({ cfg, token, solutionName, assemblyName, dllBuffer, dllHash, dryRun }) {
  console.log(`  Assembly not found — ${dryRun ? '[DRY RUN] would create' : 'creating'}...`);
  if (dryRun) return { id: DRY_RUN_ID, action: 'created' };
  const { entityId } = await apiPost(cfg, token, solutionName, '/pluginassemblies', {
    name:          assemblyName,
    version:       '1.0.0.0',
    culture:       'neutral',
    isolationmode: 2,
    sourcetype:    0,
    content:       dllBuffer.toString('base64'),
    description:   `sha256:${dllHash}`,
  });
  if (!entityId) throw new Error('Created assembly but no entityId was returned.');
  return { id: entityId, action: 'created' };
}

/**
 * Ensures a plugin type exists for the given short class name.
 * @param {{ cfg: object, token: string, solutionName: string, assemblyId: string, namespace: string, shortName: string, dryRun: boolean }} params
 * @returns {Promise<{ id: string, action: 'created'|'skipped' }>}
 */
export async function ensurePluginType({ cfg, token, solutionName, assemblyId, namespace, shortName, dryRun }) {
  const typeName = `${namespace}.${shortName}`;
  const existing = await apiGet(
    cfg, token, solutionName,
    `/plugintypes?$select=plugintypeid,typename&$filter=typename eq '${typeName}'&$top=1`,
  );
  if (existing?.value?.length) {
    const id = existing.value[0].plugintypeid;
    console.log(`  Plugin type exists: ${typeName} (${id})`);
    return { id, action: 'skipped' };
  }
  console.log(`  Plugin type missing — ${dryRun ? '[DRY RUN] would create' : 'creating'}: ${typeName}`);
  if (dryRun) return { id: DRY_RUN_ID, action: 'created' };
  const { entityId } = await apiPost(cfg, token, solutionName, '/plugintypes', {
    name:         typeName,
    typename:     typeName,
    friendlyname: shortName,
    description:  '',
    'pluginassemblyid@odata.bind': `/pluginassemblies(${assemblyId})`,
  });
  if (!entityId) throw new Error(`Created plugin type ${typeName} but no entityId was returned.`);
  return { id: entityId, action: 'created' };
}

/**
 * Ensures a processing step exists by its deterministic name.
 * @param {{ cfg: object, token: string, solutionName: string, typeId: string, messageId: string, filterId: string, step: import('./plugin-steps.mjs').PluginStep, stepName: string, dryRun: boolean }} params
 * @returns {Promise<{ id: string, action: 'created'|'skipped' }>}
 */
export async function ensureStep({ cfg, token, solutionName, typeId, messageId, filterId, step, stepName, dryRun }) {
  const existing = await apiGet(
    cfg, token, solutionName,
    `/sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,name&$filter=name eq '${stepName}'&$top=1`,
  );
  if (existing?.value?.length) {
    const id = existing.value[0].sdkmessageprocessingstepid;
    console.log(`  Step exists: ${stepName} (${id})`);
    return { id, action: 'skipped' };
  }
  console.log(`  Step missing — ${dryRun ? '[DRY RUN] would create' : 'creating'}: ${stepName}`);
  if (dryRun) return { id: DRY_RUN_ID, action: 'created' };
  const body = buildStepBody({ typeId, messageId, filterId, step, stepName });
  const { entityId } = await apiPost(cfg, token, solutionName, '/sdkmessageprocessingsteps', body);
  if (!entityId) throw new Error(`Created step '${stepName}' but no entityId was returned.`);
  return { id: entityId, action: 'created' };
}

/** @param {{ typeId: string, messageId: string, filterId: string, step: object, stepName: string }} params */
function buildStepBody({ typeId, messageId, filterId, step, stepName }) {
  const body = {
    name:                stepName,
    mode:                step.mode,
    rank:                1,
    stage:               step.stage,
    invocationsource:    0,
    supporteddeployment: 0,
    asyncautodelete:     step.mode === 1,
    filteringattributes: step.filterAttributes || null,
    'plugintypeid@odata.bind':    `/plugintypes(${typeId})`,
    'sdkmessageid@odata.bind':    `/sdkmessages(${messageId})`,
    'sdkmessagefilterid@odata.bind': `/sdkmessagefilters(${filterId})`,
  };
  return body;
}

/**
 * Ensures a PreImage step image exists under the given step.
 * @param {{ cfg: object, token: string, solutionName: string, stepId: string, image: import('./plugin-steps.mjs').StepImage, dryRun: boolean }} params
 * @returns {Promise<{ id: string, action: 'created'|'skipped' }>}
 */
/**
 * An image found by name is kept when its attributes match; otherwise it is deleted so the caller
 * recreates it (the platform refuses to PATCH image attributes). Returns null when recreation is needed.
 * because a column added to a pre-image later (e.g. msst_customerid for the stop-contact guard)
 * would otherwise never reach an org registered before the change.
 */
async function reconcileImageAttributes({ cfg, token, solutionName, existing, image, dryRun }) {
  const id = existing.sdkmessageprocessingstepimageid;
  const wanted = image.attributes || null;
  if ((existing.attributes || null) === wanted) {
    console.log(`    Image exists: ${image.alias} (${id})`);
    return { id, action: 'skipped' };
  }
  console.log(`    Image attributes differ — ${dryRun ? '[DRY RUN] would recreate' : 'recreating'}: ${image.alias} -> ${wanted}`);
  if (dryRun) return { id, action: 'updated' };
  await apiDelete(cfg, token, solutionName, `/sdkmessageprocessingstepimages(${id})`);
  return null;
}

export async function ensureImage({ cfg, token, solutionName, stepId, image, dryRun }) {
  const existing = await apiGet(
    cfg, token, solutionName,
    `/sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,name,attributes` +
    `&$filter=name eq '${image.alias}' and _sdkmessageprocessingstepid_value eq ${stepId}&$top=1`,
  );
  if (existing?.value?.length) {
    const kept = await reconcileImageAttributes({ cfg, token, solutionName, existing: existing.value[0], image, dryRun });
    if (kept) return kept;
  }
  console.log(`    Image missing — ${dryRun ? '[DRY RUN] would create' : 'creating'}: ${image.alias}`);
  if (dryRun) return { id: DRY_RUN_ID, action: 'created' };
  const { entityId } = await apiPost(cfg, token, solutionName, '/sdkmessageprocessingstepimages', {
    name:       image.alias,
    entityalias: image.alias,
    messagepropertyname: 'Target', // the input parameter is named Target for Create, Update and Delete alike
    imagetype:  0,
    attributes: image.attributes || null,
    'sdkmessageprocessingstepid@odata.bind': `/sdkmessageprocessingsteps(${stepId})`,
  });
  if (!entityId) throw new Error(`Created image '${image.alias}' but no entityId was returned.`);
  return { id: entityId, action: 'created' };
}

/**
 * Disables and re-enables a step so the platform reloads its image definitions. Required after an
 * image is recreated: the step otherwise keeps serving the cached image (verified on the org).
 * @param {{ cfg: object, token: string, solutionName: string, stepId: string }} target
 */
export async function refreshStep({ cfg, token, solutionName, stepId }) {
  const path = `/sdkmessageprocessingsteps(${stepId})`;
  await apiPatch(cfg, token, solutionName, path, { statecode: 1, statuscode: 2 });
  await apiPatch(cfg, token, solutionName, path, { statecode: 0, statuscode: 1 });
  console.log(`    Step refreshed after image change (${stepId})`);
}
