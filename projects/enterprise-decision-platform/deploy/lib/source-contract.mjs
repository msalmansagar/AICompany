// Reads the CRM plug-in source and reports which Custom API arguments each plug-in type
// actually reads and writes. Compared with the registration contract, this catches the
// drift found on 2026-09-27: EvaluateDecisionPlugin wrote ExecutionId and ChildResultsJson
// and read ChildCollectionName, none of which the org had registered.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const PLUGIN_NAMESPACE = 'EDP.RuleRuntime.Crm';

// Pipeline inputs Dataverse supplies to entity-message steps; they are not API arguments.
const PIPELINE_INPUTS = new Set(['Target']);

const READ_PATTERNS = [
  /\bParam[A-Za-z]*\(\s*context\s*,\s*"([A-Za-z]+)"/g,
  /InputParameters\s*\[\s*"([A-Za-z]+)"\s*\]/g,
  /InputParameters\.(?:Contains|TryGetValue)\(\s*"([A-Za-z]+)"/g,
];
const WRITE_PATTERN = /OutputParameters\s*\[\s*"([A-Za-z]+)"\s*\]/g;

// Readers shared between plug-ins: a plug-in that calls the marker reads every argument the
// shared file reads. The identity resolver (ADR-21) reads RuleVersionId, RuleId, RuleKey, RuleName.
const SHARED_READERS = [
  { marker: 'RuleIdentityRequest.FromContext(', file: path.join('Identity', 'RuleIdentityResolver.cs') },
];

function namesMatching(source, pattern) {
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

/**
 * Answer { typeName: { reads: Set, writes: Set } } for every *Plugin.cs file in the folder.
 * The type name is the class's full name, which is how the contract refers to it.
 */
export function scanPluginArguments(pluginSourceDirectory) {
  const result = {};
  for (const file of readdirSync(pluginSourceDirectory).filter((f) => f.endsWith('Plugin.cs'))) {
    const source = readFileSync(path.join(pluginSourceDirectory, file), 'utf8');
    const typeName = `${PLUGIN_NAMESPACE}.${path.basename(file, '.cs')}`;
    const readSources = [source, ...sharedReaderSources(pluginSourceDirectory, source)];
    const reads = new Set(readSources.flatMap(readNames).filter((n) => !PIPELINE_INPUTS.has(n)));
    const writes = new Set(namesMatching(source, WRITE_PATTERN));
    result[typeName] = { reads, writes };
  }
  return result;
}

function readNames(source) {
  return READ_PATTERNS.flatMap((pattern) => namesMatching(source, pattern));
}

function sharedReaderSources(pluginSourceDirectory, source) {
  return SHARED_READERS.filter((reader) => source.includes(reader.marker))
    .map((reader) => readFileSync(path.join(pluginSourceDirectory, reader.file), 'utf8'));
}

/**
 * The reverse check (IC-2): every argument an operation declares must be read (request) or
 * written (response) by the plug-in type that serves it. A declared-but-unused argument is a
 * promise the code does not keep: a caller passing it would be silently ignored.
 */
export function findUnusedContractArguments(scan, contract) {
  const findings = [];
  for (const operation of contract.operations) {
    const used = scan[operation.pluginType] ?? { reads: new Set(), writes: new Set() };
    for (const { name } of operation.request) if (!used.reads.has(name)) findings.push(`${operation.uniqueName} declares request "${name}" but ${operation.pluginType} never reads it`);
    for (const { name } of operation.response) if (!used.writes.has(name)) findings.push(`${operation.uniqueName} declares response "${name}" but ${operation.pluginType} never writes it`);
  }
  return findings;
}

/**
 * Compare what the source uses with what the contract declares for each plug-in type.
 * Answer a finding for every argument the code touches but the contract does not register.
 */
export function findUnregisteredArguments(scan, parameterNamesByType) {
  const findings = [];
  for (const [typeName, { reads, writes }] of Object.entries(scan)) {
    const declared = parameterNamesByType.get(typeName) ?? { request: new Set(), response: new Set() };
    for (const name of reads) if (!declared.request.has(name)) findings.push(`${typeName} reads "${name}" but no operation it serves declares that request parameter`);
    for (const name of writes) if (!declared.response.has(name)) findings.push(`${typeName} writes "${name}" but no operation it serves declares that response property`);
  }
  return findings;
}
