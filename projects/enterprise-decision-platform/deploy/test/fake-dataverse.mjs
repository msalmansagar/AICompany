// In-memory stand-in for the parts of the Dataverse Web API the A7 tools use. It answers the
// same row shapes the real service returns and records every write, so tests can assert
// exactly what would have been sent — and that nothing was sent on a dry run.

const LEGACY_ASM = 'a0000000-0000-0000-0000-00000000000l';
const ACTIVE_ASM = 'a0000000-0000-0000-0000-00000000000a';
const PACKAGE_ID = 'b0000000-0000-0000-0000-000000000001';

const typeId = (side, shortName) => `t-${side}-${shortName}`;

/** Seed an org shaped like org5869857f before A7: everything on legacy except the canary. */
export function seedPreA7Org(contract, { onActive = ['qdb_edp_ValidateRule'] } = {}) {
  const shortNames = contract.pluginTypes.map((t) => t.split('.').pop());
  const state = {
    assemblies: [
      { pluginassemblyid: LEGACY_ASM, name: contract.runtime.legacy.assemblyName, version: '1.0.23.0', publickeytoken: '06949b1887fabe5d', sourcetype: 0, _packageid_value: null },
      { pluginassemblyid: ACTIVE_ASM, name: contract.runtime.active.assemblyName, version: '1.1.0.0', publickeytoken: null, sourcetype: 4, _packageid_value: PACKAGE_ID },
    ],
    pluginTypes: [
      ...shortNames.filter((n) => n !== 'ProductionPinJustificationPlugin').map((n) => ({ plugintypeid: typeId('legacy', n), typename: `EDP.RuleRuntime.Crm.${n}`, _pluginassemblyid_value: LEGACY_ASM })),
      ...shortNames.map((n) => ({ plugintypeid: typeId('active', n), typename: `EDP.RuleRuntime.Crm.${n}`, _pluginassemblyid_value: ACTIVE_ASM })),
    ],
    customApis: [], steps: [], images: [],
  };
  for (const operation of contract.operations) seedOperation(state, operation, onActive.includes(operation.uniqueName) ? 'active' : 'legacy');
  contract.entitySteps.forEach((step, index) => state.steps.push({
    sdkmessageprocessingstepid: `s-entity-${index}`, stage: step.stage, mode: step.mode, statecode: 0,
    _eventhandler_value: typeId('legacy', step.pluginType.split('.').pop()), message: step.message, entity: step.entity,
  }));
  return state;
}

function seedOperation(state, operation, side) {
  const pluginTypeId = typeId(side, operation.pluginType.split('.').pop());
  state.customApis.push({
    customapiid: `c-${operation.uniqueName}`, uniquename: operation.uniqueName, isfunction: operation.isFunction, bindingtype: operation.bindingType, _plugintypeid_value: pluginTypeId,
    request: operation.request.map((p) => ({ customapirequestparameterid: `rq-${operation.uniqueName}-${p.name}`, uniquename: p.name, type: TYPE_CODES[p.type], isoptional: p.optional })),
    response: operation.response.map((p) => ({ customapiresponsepropertyid: `rs-${operation.uniqueName}-${p.name}`, uniquename: p.name, type: TYPE_CODES[p.type] })),
  });
  state.steps.push({ sdkmessageprocessingstepid: `s-impl-${operation.uniqueName}`, stage: 30, mode: 0, statecode: 0, _eventhandler_value: pluginTypeId, message: operation.uniqueName, entity: 'none' });
}

const TYPE_CODES = { Boolean: 0, DateTime: 1, Decimal: 2, EntityReference: 5, Integer: 7, String: 10, StringArray: 11, Guid: 12 };

/**
 * A client over `state`. Options:
 *   failPatchOn(path) → true to make that PATCH throw (simulates a mid-run failure)
 *   propagationLag     → PATCHes land only after sleep() is called (simulates the P1 lag)
 */
export function createFakeClient(state, { failPatchOn = () => false, propagationLag = false } = {}) {
  const writes = [];
  const pending = [];
  const client = {
    orgUrl: 'https://fake.crm.dynamics.com',
    writes,
    get: async (path) => ({ value: answerGet(state, path) }),
    patch: async (path, body) => {
      writes.push({ method: 'PATCH', path, body });
      if (failPatchOn(path)) throw new Error(`simulated failure on ${path}`);
      const apply = () => applyPatch(state, path, body);
      if (propagationLag) pending.push(apply); else apply();
      return null;
    },
    post: async (path, body) => { writes.push({ method: 'POST', path, body }); applyPost(state, path, body); return null; },
    delete: async () => { throw new Error('the A7 tools must never delete'); },
  };
  const sleep = async () => { while (pending.length) pending.shift()(); };
  return { client, sleep };
}

function answerGet(state, path) {
  const set = path.split('?')[0];
  if (set === 'pluginassemblies') return state.assemblies;
  if (set === 'plugintypes') return state.pluginTypes;
  if (set === 'customapis') return state.customApis.map(toApiRow);
  if (set === 'sdkmessageprocessingsteps') return state.steps.filter((s) => path.includes(s._eventhandler_value)).map(toStepRow);
  if (set === 'sdkmessageprocessingstepimages') return state.images;
  throw new Error(`fake does not answer GET ${set}`);
}

const toApiRow = (api) => ({ ...api, CustomAPIRequestParameters: api.request, CustomAPIResponseProperties: api.response });
const toStepRow = (s) => ({ ...s, sdkmessageid: { name: s.message }, sdkmessagefilterid: s.entity === 'none' ? null : { primaryobjecttypecode: s.entity } });
const idIn = (path) => path.match(/\(([^)]+)\)/)[1];
const boundId = (value) => value.match(/\(([^)]+)\)/)[1];

function applyPatch(state, path, body) {
  if (path.startsWith('customapis(')) {
    const api = state.customApis.find((a) => a.customapiid === idIn(path));
    api._plugintypeid_value = boundId(body['PluginTypeId@odata.bind']);
    // Dataverse keeps the implementation step in step with the API.
    state.steps.find((s) => s.stage === 30 && s.message === api.uniquename)._eventhandler_value = api._plugintypeid_value;
    return;
  }
  if (path.startsWith('sdkmessageprocessingsteps(')) {
    state.steps.find((s) => s.sdkmessageprocessingstepid === idIn(path))._eventhandler_value = boundId(body['eventhandler_plugintype@odata.bind']);
    return;
  }
  throw new Error(`fake does not answer PATCH ${path}`);
}

function applyPost(state, path, body) {
  const api = state.customApis.find((a) => a.customapiid === boundId(body['CustomAPIId@odata.bind']));
  if (path === 'customapirequestparameters') api.request.push({ customapirequestparameterid: `new-${body.uniquename}`, uniquename: body.uniquename, type: body.type, isoptional: body.isoptional });
  else if (path === 'customapiresponseproperties') api.response.push({ customapiresponsepropertyid: `new-${body.uniquename}`, uniquename: body.uniquename, type: body.type });
  else throw new Error(`fake does not answer POST ${path}`);
}

export const FAKE_IDS = Object.freeze({ LEGACY_ASM, ACTIVE_ASM, PACKAGE_ID, typeId });
