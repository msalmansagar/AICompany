// Reads the Rule Engine's live registrations and classifies them against the contract.
//
// Identity rules (never display-name substrings):
//   assemblies   — exact pluginassembly.name from contract.runtime (active, legacy)
//   plugin types — exact CLR full type name, scoped to one of those assembly ids
//   Custom APIs  — exact uniquename from contract.operations
//   entity steps — sdkmessageprocessingstep bound (eventhandler) to one of those plugin types

import { getAll } from './dataverse-client.mjs';
import { CUSTOM_API_TYPE_NAMES } from './registration-contract.mjs';

const odataList = (values) => values.map((v) => `'${v}'`).join(',');
const inFilter = (attribute, values) => `Microsoft.Dynamics.CRM.In(PropertyName='${attribute}',PropertyValues=[${odataList(values)}])`;

/** Read everything the contract names, plus anything bound to its assemblies. Read-only. */
export async function takeInventory(client, contract) {
  const assemblyNames = [contract.runtime.active.assemblyName, contract.runtime.legacy.assemblyName];
  const assemblies = await getAll(client, `pluginassemblies?$select=pluginassemblyid,name,version,publickeytoken,isolationmode,sourcetype,_packageid_value&$filter=${inFilter('name', assemblyNames)}`);
  const pluginTypes = await readPluginTypes(client, contract);
  const customApis = await readCustomApis(client, contract);
  const knownTypeIds = pluginTypes.filter((t) => assemblies.some((a) => a.pluginassemblyid === t.assemblyId)).map((t) => t.id);
  const steps = await readSteps(client, knownTypeIds);
  return { takenAtUtc: new Date().toISOString(), orgUrl: client.orgUrl ?? null, assemblies: assemblies.map(toAssembly), pluginTypes, customApis, steps };
}

async function readPluginTypes(client, contract) {
  const rows = await getAll(client, `plugintypes?$select=plugintypeid,typename,_pluginassemblyid_value&$filter=${inFilter('typename', contract.pluginTypes)}`);
  return rows.map((t) => ({ id: t.plugintypeid, typeName: t.typename, assemblyId: t._pluginassemblyid_value }));
}

async function readCustomApis(client, contract) {
  const names = contract.operations.map((o) => o.uniqueName);
  const rows = await getAll(client, `customapis?$select=customapiid,uniquename,isfunction,bindingtype,_plugintypeid_value&$filter=${inFilter('uniquename', names)}` +
    '&$expand=CustomAPIRequestParameters($select=customapirequestparameterid,uniquename,type,isoptional,logicalentityname),CustomAPIResponseProperties($select=customapiresponsepropertyid,uniquename,type,logicalentityname)');
  return rows.map((api) => ({
    id: api.customapiid, uniqueName: api.uniquename, isFunction: api.isfunction, bindingType: api.bindingtype, pluginTypeId: api._plugintypeid_value,
    request: api.CustomAPIRequestParameters.map((p) => ({ id: p.customapirequestparameterid, name: p.uniquename, type: CUSTOM_API_TYPE_NAMES[p.type], optional: p.isoptional })),
    response: api.CustomAPIResponseProperties.map((p) => ({ id: p.customapiresponsepropertyid, name: p.uniquename, type: CUSTOM_API_TYPE_NAMES[p.type] })),
  }));
}

async function readSteps(client, typeIds) {
  if (typeIds.length === 0) return [];
  const filter = typeIds.map((id) => `_eventhandler_value eq ${id}`).join(' or ');
  const rows = await getAll(client, `sdkmessageprocessingsteps?$select=sdkmessageprocessingstepid,stage,mode,statecode,_eventhandler_value&$filter=${filter}` +
    '&$expand=sdkmessageid($select=name),sdkmessagefilterid($select=primaryobjecttypecode)');
  const steps = rows.map((s) => ({ id: s.sdkmessageprocessingstepid, message: s.sdkmessageid?.name ?? null, entity: s.sdkmessagefilterid?.primaryobjecttypecode ?? null,
    stage: s.stage, mode: s.mode, disabled: s.statecode !== 0, eventHandlerId: s._eventhandler_value, imageCount: 0 }));
  return attachImageCounts(client, steps);
}

async function attachImageCounts(client, steps) {
  if (steps.length === 0) return steps;
  const filter = steps.map((s) => `_sdkmessageprocessingstepid_value eq ${s.id}`).join(' or ');
  const images = await getAll(client, `sdkmessageprocessingstepimages?$select=sdkmessageprocessingstepimageid,_sdkmessageprocessingstepid_value&$filter=${filter}`);
  return steps.map((s) => ({ ...s, imageCount: images.filter((i) => i._sdkmessageprocessingstepid_value === s.id).length }));
}

function toAssembly(a) {
  return { id: a.pluginassemblyid, name: a.name, version: a.version, publicKeyToken: a.publickeytoken ?? null, sourceType: a.sourcetype, packageId: a._packageid_value ?? null };
}
