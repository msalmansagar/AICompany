// Generates the on-prem Process Action manifest from the registration contract.
// On-prem predates Custom API: each operation becomes an unbound Process Action with a
// synchronous step. Only the mechanics differ; the argument contract is the same.

/** Process Action argument types supported by Dynamics 365 CE on-premises 9.x. */
export const ONPREM_SUPPORTED_TYPES = Object.freeze(new Set([
  'Boolean', 'DateTime', 'Decimal', 'Entity', 'EntityCollection', 'EntityReference',
  'Float', 'Integer', 'Money', 'Picklist', 'String',
]));

const MANIFEST_COMMENT =
  'GENERATED from registration/rule-engine-registration.json by deploy/tools/generate-onprem-manifest.mjs — do not edit by hand. ' +
  'EDP message surface for Dynamics 365 CE ON-PREMISES (9.x). On-prem predates Custom API, so each message below is created as an ' +
  'unbound Custom (Process) Action and the listed plugin type is registered as a synchronous step on that action\'s message. ' +
  'Input/output arguments map 1:1 from the cloud Custom API params/response properties. All read operations that are OData ' +
  'Functions on cloud (cloudFunction=true) become plain Actions here — same ResultJson output, invoked by POST/Execute instead ' +
  'of a GET. entitySteps are ordinary plug-in steps registered on the listed table messages. ' +
  'Status: On-Prem Compatible by Design — Runtime Validation Pending.';

/** Build the on-prem manifest object; throws if an argument type cannot exist on-prem. */
export function buildOnPremManifest(contract) {
  const unsupported = contract.operations.flatMap((operation) =>
    [...operation.request, ...operation.response]
      .filter((p) => !ONPREM_SUPPORTED_TYPES.has(p.type))
      .map((p) => `${operation.uniqueName}.${p.name}: ${p.type}`));
  if (unsupported.length > 0) throw new Error(`Types with no on-prem Process Action equivalent:\n - ${unsupported.join('\n - ')}`);

  return {
    $comment: MANIFEST_COMMENT,
    assembly: contract.runtime.onPrem.assemblyName,
    status: contract.runtime.onPrem.status,
    solutionPublisherPrefix: 'qdb_edp',
    messages: contract.operations.map(toOnPremMessage),
    entitySteps: contract.entitySteps.map((step) => ({
      plugin: step.pluginType, message: step.message, entity: step.entity, stage: step.stage, mode: step.mode,
    })),
  };
}

function toOnPremMessage(operation) {
  return {
    name: operation.uniqueName,
    plugin: operation.pluginType,
    cloudFunction: operation.isFunction,
    inputs: operation.request.map((p) => ({ name: p.name, type: p.type, required: !p.optional })),
    outputs: operation.response.map((p) => ({ name: p.name, type: p.type })),
  };
}

/** Serialise exactly as committed, so a byte comparison detects hand edits. */
export function serialiseOnPremManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
