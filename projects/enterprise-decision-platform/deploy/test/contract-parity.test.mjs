import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadContract, validateContract, parameterNamesByPluginType } from '../lib/registration-contract.mjs';
import { surfaceFromContract, surfaceFromOnPremManifest, compareSurfaces, describeFinding } from '../lib/surface-parity.mjs';
import { buildOnPremManifest, serialiseOnPremManifest } from '../lib/onprem-manifest.mjs';
import { scanPluginArguments, findUnregisteredArguments } from '../lib/source-contract.mjs';
import { planMetadata, toCreateRequest } from '../lib/metadata-plan.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const contract = loadContract();
const clone = (value) => JSON.parse(JSON.stringify(value));

test('loadContract_CommittedContract_IsValid', () => {
  assert.deepEqual(validateContract(contract), []);
});

test('onPremManifest_Committed_EqualsTheOneGeneratedFromTheContract', () => {
  const committed = readFileSync(path.join(here, '..', 'onprem', 'actions-manifest.json'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(committed, serialiseOnPremManifest(buildOnPremManifest(contract)),
    'run: node deploy/tools/generate-onprem-manifest.mjs');
});

test('onPremManifest_Committed_HasSemanticParityWithTheCloudContract', () => {
  const onPrem = JSON.parse(readFileSync(path.join(here, '..', 'onprem', 'actions-manifest.json'), 'utf8'));
  const findings = compareSurfaces(surfaceFromContract(contract), surfaceFromOnPremManifest(onPrem));
  assert.deepEqual(findings.map(describeFinding), []);
});

test('onPremManifest_Committed_StatesRuntimeValidationIsPending', () => {
  const onPrem = JSON.parse(readFileSync(path.join(here, '..', 'onprem', 'actions-manifest.json'), 'utf8'));
  assert.equal(onPrem.status, 'On-Prem Compatible by Design — Runtime Validation Pending');
});

test('pluginSource_EveryArgumentReadOrWritten_IsDeclaredInTheContract', () => {
  const scan = scanPluginArguments(path.join(here, '..', '..', 'runtime', 'src', 'EDP.RuleRuntime.Crm'));
  assert.ok(Object.keys(scan).length >= contract.pluginTypes.length, 'every plug-in type source file was scanned');
  assert.deepEqual(findUnregisteredArguments(scan, parameterNamesByPluginType(contract)), []);
});

test('findUnregisteredArguments_OutputTheContractLacks_IsReported', () => {
  const scan = { 'EDP.RuleRuntime.Crm.EvaluateDecisionPlugin': { reads: new Set(), writes: new Set(['ExecutionId', 'Undeclared']) } };
  const findings = findUnregisteredArguments(scan, parameterNamesByPluginType(contract));
  assert.deepEqual(findings, ['EDP.RuleRuntime.Crm.EvaluateDecisionPlugin writes "Undeclared" but no operation it serves declares that response property']);
});

// ---- the parity check must detect each kind of drift ----

function driftedOnPrem(mutate) {
  const manifest = clone(buildOnPremManifest(contract));
  mutate(manifest.messages.find((m) => m.name === 'qdb_edp_EvaluateDecision'), manifest);
  return compareSurfaces(surfaceFromContract(contract), surfaceFromOnPremManifest(manifest)).map((f) => f.kind);
}

test('compareSurfaces_MissingOperation_IsDetected', () => {
  assert.deepEqual(driftedOnPrem((_, m) => { m.messages = m.messages.filter((x) => x.name !== 'qdb_edp_GetPublishedVersion'); }), ['missing-operation']);
});
test('compareSurfaces_MissingRequestParameter_IsDetected', () => {
  assert.deepEqual(driftedOnPrem((op) => { op.inputs = op.inputs.filter((p) => p.name !== 'ChildCollectionName'); }), ['missing-request-parameter']);
});
test('compareSurfaces_MissingResponseProperty_IsDetected', () => {
  assert.deepEqual(driftedOnPrem((op) => { op.outputs = op.outputs.filter((p) => p.name !== 'ExecutionId'); }), ['missing-response-property']);
});
test('compareSurfaces_IncompatibleType_IsDetected', () => {
  assert.deepEqual(driftedOnPrem((op) => { op.outputs.find((p) => p.name === 'ElapsedMs').type = 'String'; }), ['type-mismatch']);
});
test('compareSurfaces_IncompatibleOptionality_IsDetected', () => {
  assert.deepEqual(driftedOnPrem((op) => { op.inputs.find((p) => p.name === 'InputsJson').required = true; }), ['optionality-mismatch']);
});
test('compareSurfaces_ArgumentInTheWrongDirection_IsDetected', () => {
  assert.deepEqual(driftedOnPrem((op) => {
    op.outputs = op.outputs.filter((p) => p.name !== 'ExecutionId');
    op.inputs.push({ name: 'ExecutionId', type: 'String', required: false });
  }), ['direction-mismatch']);
});
test('compareSurfaces_UnexpectedArgument_IsDetected', () => {
  assert.deepEqual(driftedOnPrem((op) => { op.inputs.push({ name: 'Extra', type: 'String', required: false }); }), ['unexpected-request-parameter']);
});

test('buildOnPremManifest_TypeWithNoOnPremEquivalent_IsRejected', () => {
  const withGuid = clone(contract);
  withGuid.operations[0].request.push({ name: 'Id', type: 'Guid', optional: true });
  assert.throws(() => buildOnPremManifest(withGuid), /no on-prem Process Action equivalent/);
});

test('validateContract_ArgumentDeclaredInBothDirections_IsReported', () => {
  const broken = clone(contract);
  broken.operations[0].response.push({ name: broken.operations[0].request[0].name, type: 'String' });
  assert.ok(validateContract(broken).some((p) => p.includes('both request and response')));
});

// ---- metadata planning ----

const inventoryFromContract = (mutate = () => {}) => {
  const customApis = contract.operations.map((o) => ({ id: `c-${o.uniqueName}`, uniqueName: o.uniqueName, request: clone(o.request), response: clone(o.response) }));
  mutate(customApis.find((a) => a.uniqueName === 'qdb_edp_EvaluateDecision'));
  return { customApis };
};

test('planMetadata_OrgMatchesContract_PlansNothing', () => {
  assert.deepEqual(planMetadata(contract, inventoryFromContract()), { creates: [], incompatibilities: [] });
});

test('planMetadata_ExistingOptionalityDiffers_IsIncompatible', () => {
  const plan = planMetadata(contract, inventoryFromContract((api) => { api.request.find((p) => p.name === 'InputsJson').optional = false; }));
  assert.deepEqual(plan.incompatibilities.map((f) => f.kind), ['optionality-mismatch']);
});

test('toCreateRequest_RequestParameter_SendsOptionalityAndTheApiBinding', () => {
  const plan = planMetadata(contract, inventoryFromContract((api) => { api.request = api.request.filter((p) => p.name !== 'ChildCollectionName'); }));
  const { entitySet, body } = toCreateRequest(plan.creates[0]);
  assert.equal(entitySet, 'customapirequestparameters');
  assert.deepEqual(body, { uniquename: 'ChildCollectionName', name: 'ChildCollectionName', displayname: 'Child Collection Name', type: 10, isoptional: true, 'CustomAPIId@odata.bind': '/customapis(c-qdb_edp_EvaluateDecision)' });
});

test('toCreateRequest_ResponseProperty_SendsNoOptionality', () => {
  const plan = planMetadata(contract, inventoryFromContract((api) => { api.response = api.response.filter((p) => p.name !== 'ExecutionId'); }));
  const { entitySet, body } = toCreateRequest(plan.creates[0]);
  assert.equal(entitySet, 'customapiresponseproperties');
  assert.equal('isoptional' in body, false);
});
