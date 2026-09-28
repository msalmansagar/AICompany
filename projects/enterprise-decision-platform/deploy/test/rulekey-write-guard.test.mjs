// HD-5 (Release 1): once a RuleKey is set, no supported path may change it. Server-side
// enforcement is Release 2, so this guard proves it statically: across the Rule Engine source,
// the ONLY code that writes qdb_edp_rulekey is the designer's create / set-once function and the
// approved backfill tool. The runtime, both SDKs and the gateway never mention the column in a write.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'bin', 'obj', 'dist', '.vite', 'coverage']);
const SOURCE_EXTENSIONS = new Set(['.cs', '.ts', '.tsx', '.js', '.mjs', '.cjs']);
const COLUMN = 'qdb_edp_rulekey';

// A write names the column as the target of an assignment or as a key of a payload object.
const WRITE_PATTERNS = [
  /\[\s*"qdb_edp_rulekey"\s*\]\s*=(?!=)/,          // C#: entity["qdb_edp_rulekey"] = ...
  /["'`]?qdb_edp_rulekey["'`]?\s*:\s*(?![a-z]*\s*[;,|}]\s*$)[^\s]/m, // JS/TS: { qdb_edp_rulekey: value }
  /\[\s*KEY_ATTRIBUTE\s*\]\s*:/,                  // the backfill tool's computed key
];

// The designer's single writer (create or set-once) and the approved migration tool.
export const ALLOWED_WRITERS = [
  'deploy/lib/rulekey-migration.mjs',
];

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const full = path.join(directory, name);
    if (statSync(full).isDirectory()) return SKIPPED_DIRECTORIES.has(name) ? [] : sourceFiles(full);
    return SOURCE_EXTENSIONS.has(path.extname(name)) ? [full] : [];
  });
}

const isTestFile = (relative) => /(^|\/)(test|tests)\/|\.test\.[cm]?[jt]sx?$|Tests?\.cs$/.test(relative);

function writersOfTheKey() {
  return ['runtime/src', 'sdk', 'gateway/src', 'designer/src', 'deploy']
    .flatMap((dir) => sourceFiles(path.join(projectRoot, dir)))
    .map((file) => ({ relative: path.relative(projectRoot, file).split(path.sep).join('/'), source: readFileSync(file, 'utf8') }))
    .filter(({ relative, source }) => !isTestFile(relative) && (source.includes(COLUMN) || source.includes('KEY_ATTRIBUTE')))
    .filter(({ source }) => WRITE_PATTERNS.some((pattern) => pattern.test(source)))
    .map(({ relative }) => relative);
}

test('ruleKeyWrites_OnlyTheAllowedWritersWriteTheColumn', () => {
  assert.deepEqual(writersOfTheKey().filter((f) => !ALLOWED_WRITERS.includes(f)), []);
});

test('ruleKeyWrites_TheBackfillTool_IsFoundAsAWriter', () => {
  assert.ok(writersOfTheKey().includes('deploy/lib/rulekey-migration.mjs'), 'the guard must see the one known writer, or it proves nothing');
});

test('ruleKeyWrites_RuntimeSdksAndGateway_NeverWriteTheColumn', () => {
  assert.deepEqual(writersOfTheKey().filter((f) => /^(runtime|sdk|gateway)\//.test(f)), []);
});

test('ruleKeyWrites_GuardDetectsACSharpAssignment', () => {
  assert.ok(WRITE_PATTERNS.some((p) => p.test('rule["qdb_edp_rulekey"] = "x";')));
});

test('ruleKeyWrites_GuardDetectsAPayloadProperty', () => {
  assert.ok(WRITE_PATTERNS.some((p) => p.test("await client.patch(url, { qdb_edp_rulekey: newKey });")));
});

test('ruleKeyWrites_GuardIgnoresAColumnSelection', () => {
  assert.equal(WRITE_PATTERNS.some((p) => p.test('new ColumnSet("qdb_edp_rulekey")') || p.test('$select=qdb_edp_rulekey')), false);
});
