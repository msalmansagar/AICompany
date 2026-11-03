// Loads and validates the authoritative Rule Engine registration contract
// (registration/rule-engine-registration.json). Every other deploy tool reads the contract
// through this module, so a malformed contract fails once, here, with a precise message.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const CONTRACT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'registration', 'rule-engine-registration.json');

/** Dataverse Custom API parameter type codes (customapirequestparameter.type). */
export const CUSTOM_API_TYPE_CODES = Object.freeze({
  Boolean: 0, DateTime: 1, Decimal: 2, Entity: 3, EntityCollection: 4, EntityReference: 5,
  Float: 6, Integer: 7, Money: 8, Picklist: 9, String: 10, StringArray: 11, Guid: 12,
});

export const CUSTOM_API_TYPE_NAMES = Object.freeze(
  Object.fromEntries(Object.entries(CUSTOM_API_TYPE_CODES).map(([name, code]) => [code, name])));

/** Read the contract from disk and validate it; throws with every problem listed. */
export function loadContract(contractPath = CONTRACT_PATH) {
  const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
  const problems = validateContract(contract);
  if (problems.length > 0) throw new Error(`Invalid registration contract:\n - ${problems.join('\n - ')}`);
  return contract;
}

/** Answer the list of structural problems in a contract (empty when valid). */
export function validateContract(contract) {
  const problems = [];
  if (!contract?.runtime?.active?.assemblyName) problems.push('runtime.active.assemblyName is required');
  if (!contract?.runtime?.legacy?.assemblyName) problems.push('runtime.legacy.assemblyName is required');
  const pluginTypes = new Set(contract?.pluginTypes ?? []);
  if (pluginTypes.size === 0) problems.push('pluginTypes must list at least one type');
  const seen = new Set();
  for (const operation of contract?.operations ?? []) problems.push(...validateOperation(operation, pluginTypes, seen));
  for (const step of contract?.entitySteps ?? []) {
    if (!pluginTypes.has(step.pluginType)) problems.push(`entity step ${step.message}/${step.entity}: unknown plugin type ${step.pluginType}`);
  }
  return problems;
}

function validateOperation(operation, pluginTypes, seen) {
  const problems = [];
  const name = operation.uniqueName;
  if (!name) return ['an operation has no uniqueName'];
  if (seen.has(name)) problems.push(`duplicate operation ${name}`);
  seen.add(name);
  if (!pluginTypes.has(operation.pluginType)) problems.push(`${name}: unknown plugin type ${operation.pluginType}`);
  for (const parameter of [...operation.request, ...operation.response]) {
    if (!(parameter.type in CUSTOM_API_TYPE_CODES)) problems.push(`${name}.${parameter.name}: unknown type ${parameter.type}`);
  }
  const requestNames = new Set(operation.request.map((p) => p.name));
  for (const property of operation.response) {
    if (requestNames.has(property.name)) problems.push(`${name}.${property.name}: declared as both request and response`);
  }
  return problems;
}

/** Map each plugin type to the request and response names its operations declare. */
export function parameterNamesByPluginType(contract) {
  const byType = new Map();
  for (const operation of contract.operations) {
    const entry = byType.get(operation.pluginType) ?? { request: new Set(), response: new Set() };
    operation.request.forEach((p) => entry.request.add(p.name));
    operation.response.forEach((p) => entry.response.add(p.name));
    byType.set(operation.pluginType, entry);
  }
  return byType;
}
