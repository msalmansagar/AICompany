// Plans Custom API request/response metadata so the live org matches the contract.
// It only ever ADDS what is missing. Dataverse makes a parameter's type and optionality
// immutable, so a mismatched existing definition is reported as incompatible and the plan
// refuses — fixing it needs a deliberate delete-and-recreate, which is never automatic.

import { CUSTOM_API_TYPE_CODES } from './registration-contract.mjs';
import { compareSurfaces } from './surface-parity.mjs';

function surfaceOf(apis) {
  return Object.fromEntries(apis.map((api) => [api.uniqueName, {
    plugin: null,
    request: Object.fromEntries(api.request.map((p) => [p.name, { type: p.type, optional: p.optional }])),
    response: Object.fromEntries(api.response.map((p) => [p.name, { type: p.type }])),
  }]));
}

function contractSurfaceWithoutPlugins(contract) {
  return Object.fromEntries(contract.operations.map((o) => [o.uniqueName, {
    plugin: null,
    request: Object.fromEntries(o.request.map((p) => [p.name, { type: p.type, optional: p.optional }])),
    response: Object.fromEntries(o.response.map((p) => [p.name, { type: p.type }])),
  }]));
}

const ADDABLE = new Set(['missing-request-parameter', 'missing-response-property']);

/**
 * Answer { creates, incompatibilities }. Plugin binding is not compared here — that is the
 * re-point tool's job — and a missing operation is an incompatibility, not a create.
 */
export function planMetadata(contract, inventory) {
  const findings = compareSurfaces(contractSurfaceWithoutPlugins(contract), surfaceOf(inventory.customApis));
  const creates = findings.filter((f) => ADDABLE.has(f.kind)).map((finding) => toCreate(finding, contract, inventory));
  const incompatibilities = findings.filter((f) => !ADDABLE.has(f.kind));
  return { creates: creates.sort((a, b) => `${a.operation}.${a.name}`.localeCompare(`${b.operation}.${b.name}`)), incompatibilities };
}

function toCreate(finding, contract, inventory) {
  const operation = contract.operations.find((o) => o.uniqueName === finding.operation);
  const api = inventory.customApis.find((a) => a.uniqueName === finding.operation);
  const isRequest = finding.kind === 'missing-request-parameter';
  const definition = (isRequest ? operation.request : operation.response).find((p) => p.name === finding.argument);
  return { operation: finding.operation, customApiId: api.id, direction: isRequest ? 'request' : 'response', name: definition.name, definition };
}

/** The Web API entity set and body that create one planned parameter or property. */
export function toCreateRequest(create) {
  const { definition } = create;
  const body = {
    uniquename: definition.name, name: definition.name, displayname: definition.displayName ?? definition.name,
    type: CUSTOM_API_TYPE_CODES[definition.type],
    'CustomAPIId@odata.bind': `/customapis(${create.customApiId})`,
  };
  if (definition.entity) body.logicalentityname = definition.entity;
  if (create.direction === 'request') return { entitySet: 'customapirequestparameters', body: { ...body, isoptional: definition.optional } };
  return { entitySet: 'customapiresponseproperties', body };
}
