// Static checks that stop routine tooling from quietly moving the cloud runtime back to the
// retired signed assembly, and stop the A7 tools from ever deleting anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const deployDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const runtimeTarget = require('../lib/runtime-target.cjs');

const LEGACY_LITERAL = 'EDP.RuleRuntime.Crm.Signed';
const EXECUTABLE = /\.(c|m)?js$/;
// A script is a binding writer if it uploads into an assembly or binds anything to a plugin
// type or assembly — the operations that decide which runtime serves the Engine.
const BINDING_WRITE = /['"`](PATCH|POST)['"`],\s*`\$\{API\}\/pluginassemblies|@odata\.bind['"]?\s*:\s*`\/(plugintypes|pluginassemblies)\(/;

function deployFiles(directory = deployDirectory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (['test', 'node_modules', '.a7-runs', 'guides'].includes(entry.name)) return [];
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? deployFiles(path.join(directory, entry.name), relative) : [relative];
  });
}

const read = (relative) => readFileSync(path.join(deployDirectory, relative), 'utf8');

test('deployScripts_NoExecutableScriptHardCodesTheLegacyAssemblyName', () => {
  const offenders = deployFiles().filter((f) => EXECUTABLE.test(f) && f !== 'lib/runtime-target.cjs' && read(f).includes(LEGACY_LITERAL));
  assert.deepEqual(offenders, [], 'read the name from lib/runtime-target.cjs instead of hard-coding it');
});

test('deployScripts_EveryBindingWriter_TakesItsTargetFromTheRuntimeContract', () => {
  const writers = deployFiles().filter((f) => f.endsWith('.js') && BINDING_WRITE.test(read(f)));
  assert.ok(writers.length >= 7, `the check found the binding writers it polices (found ${writers.length})`);
  assert.deepEqual(writers.filter((f) => !read(f).includes("require('./lib/runtime-target.cjs')")), []);
});

test('deployScripts_EveryWriterTargetingTheLegacyAssembly_CallsTheGuard', () => {
  const legacyWriters = deployFiles().filter((f) => f.endsWith('.js') && BINDING_WRITE.test(read(f)) && read(f).includes('LEGACY_ASSEMBLY_NAME'));
  assert.deepEqual(legacyWriters.filter((f) => !read(f).includes('assertLegacySignedRegistrationAllowed(')), []);
});

test('a7Tools_NeverIssueADelete', () => {
  const tools = deployFiles().filter((f) => /^(a7-[\w-]+\.mjs|lib\/[\w-]+\.mjs)$/.test(f));
  const deleting = tools.filter((f) => /['"`]DELETE['"`]|\.delete\(/.test(read(f)));
  assert.deepEqual(deleting, []);
});

test('assertLegacySignedRegistrationAllowed_WithoutOptIn_Throws', () => {
  delete process.env[runtimeTarget.ALLOW_LEGACY_ENV];
  assert.throws(() => runtimeTarget.assertLegacySignedRegistrationAllowed('bre-register.js'), /refused/);
});

test('assertLegacySignedRegistrationAllowed_WithExplicitOptIn_Allows', () => {
  process.env[runtimeTarget.ALLOW_LEGACY_ENV] = '1';
  try {
    assert.doesNotThrow(() => runtimeTarget.assertLegacySignedRegistrationAllowed('bre-register.js'));
  } finally {
    delete process.env[runtimeTarget.ALLOW_LEGACY_ENV];
  }
});

test('runtimeTarget_ActiveAssembly_IsThePackageAssembly', () => {
  assert.equal(runtimeTarget.ACTIVE_ASSEMBLY_NAME, 'EDP.RuleRuntime.Crm');
  assert.notEqual(runtimeTarget.ACTIVE_ASSEMBLY_NAME, runtimeTarget.LEGACY_ASSEMBLY_NAME);
});
