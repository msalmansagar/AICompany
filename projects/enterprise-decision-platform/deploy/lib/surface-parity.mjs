// Semantic comparison of two API surfaces. Cloud (Custom API) and on-prem (Process Action)
// are deployed by different mechanics; what must match is the contract a caller sees:
// the same operations, the same arguments in the same direction, with compatible types and
// the same optionality.

/**
 * A surface is { [operationName]: { plugin, request: {name: {type, optional}}, response: {name: {type}} } }.
 * Build one from the registration contract.
 */
export function surfaceFromContract(contract) {
  return Object.fromEntries(contract.operations.map((operation) => [operation.uniqueName, {
    plugin: operation.pluginType,
    request: Object.fromEntries(operation.request.map((p) => [p.name, { type: p.type, optional: p.optional }])),
    response: Object.fromEntries(operation.response.map((p) => [p.name, { type: p.type }])),
  }]));
}

/** Build a surface from an on-prem actions manifest (`required` is the inverse of `optional`). */
export function surfaceFromOnPremManifest(manifest) {
  return Object.fromEntries(manifest.messages.map((message) => [message.name, {
    plugin: message.plugin,
    request: Object.fromEntries(message.inputs.map((p) => [p.name, { type: p.type, optional: !p.required }])),
    response: Object.fromEntries(message.outputs.map((p) => [p.name, { type: p.type }])),
  }]));
}

/** Answer every difference between an expected and an actual surface, as typed findings. */
export function compareSurfaces(expected, actual) {
  const findings = [];
  for (const [name, want] of Object.entries(expected)) {
    const got = actual[name];
    if (!got) { findings.push({ kind: 'missing-operation', operation: name }); continue; }
    if (want.plugin !== got.plugin) findings.push({ kind: 'plugin-mismatch', operation: name, expected: want.plugin, actual: got.plugin });
    findings.push(...compareArguments(name, want, got));
  }
  for (const name of Object.keys(actual)) {
    if (!expected[name]) findings.push({ kind: 'unexpected-operation', operation: name });
  }
  return findings;
}

function compareArguments(operation, want, got) {
  const findings = [];
  for (const [name, spec] of Object.entries(want.request)) {
    if (got.response[name]) findings.push({ kind: 'direction-mismatch', operation, argument: name, expected: 'request' });
    else if (!got.request[name]) findings.push({ kind: 'missing-request-parameter', operation, argument: name });
    else findings.push(...compareSpec(operation, name, spec, got.request[name], true));
  }
  for (const [name, spec] of Object.entries(want.response)) {
    if (got.request[name]) findings.push({ kind: 'direction-mismatch', operation, argument: name, expected: 'response' });
    else if (!got.response[name]) findings.push({ kind: 'missing-response-property', operation, argument: name });
    else findings.push(...compareSpec(operation, name, spec, got.response[name], false));
  }
  for (const name of Object.keys(got.request)) {
    if (!want.request[name] && !want.response[name]) findings.push({ kind: 'unexpected-request-parameter', operation, argument: name });
  }
  for (const name of Object.keys(got.response)) {
    if (!want.response[name] && !want.request[name]) findings.push({ kind: 'unexpected-response-property', operation, argument: name });
  }
  return findings;
}

function compareSpec(operation, argument, want, got, isRequest) {
  const findings = [];
  if (want.type !== got.type) findings.push({ kind: 'type-mismatch', operation, argument, expected: want.type, actual: got.type });
  if (isRequest && want.optional !== got.optional) findings.push({ kind: 'optionality-mismatch', operation, argument, expected: want.optional, actual: got.optional });
  return findings;
}

/** One line per finding, for CLI output and assertion messages. */
export function describeFinding(finding) {
  const where = finding.argument ? `${finding.operation}.${finding.argument}` : finding.operation;
  const detail = 'expected' in finding ? ` (expected ${finding.expected}${'actual' in finding ? `, found ${finding.actual}` : ''})` : '';
  return `${finding.kind}: ${where}${detail}`;
}
