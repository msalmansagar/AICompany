// compare-reports.mjs is what MSS runs at Gates 1b and 2: its exit code and message are the verdict.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), '../compare-reports.mjs');
const cacheRow = (formCode, version) => ({ formCode, language: 1033, version, modifiedOn: `v${version}`, state: 0 });
const report = (renderCache) => ({ kind: 'survey-stage2', org: 'this org', url: 'https://test.example.invalid', ranAt: '2026-11-20T08:00:00Z', checks: [], renderCache });

function compare(before, after, ...flags) {
  const workDir = mkdtempSync(join(tmpdir(), 'compare-reports-'));
  try {
    writeFileSync(join(workDir, 'before.json'), JSON.stringify(before));
    writeFileSync(join(workDir, 'after.json'), JSON.stringify(after));
    return spawnSync(process.execPath, [SCRIPT, join(workDir, 'before.json'), join(workDir, 'after.json'), ...flags], { encoding: 'utf8' });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

test('compareReports_onlyTheExpectedFormRepublished_exitsZero', () => {
  const result = compare(report([cacheRow('loan', 1), cacheRow('other', 2)]), report([cacheRow('loan', 2), cacheRow('other', 2)]), '--expect-changed=loan');

  assert.equal(result.status, 0);
});

test('compareReports_anUnexpectedFormChanged_exitsOneAndNamesIt', () => {
  const result = compare(report([cacheRow('loan', 1), cacheRow('other', 2)]), report([cacheRow('loan', 2), cacheRow('other', 3)]), '--expect-changed=loan');

  assert.deepEqual({ status: result.status, said: /render cache CHANGED for: other\|1033/.test(result.stdout) }, { status: 1, said: true });
});

test('compareReports_anExpectedFormWasNotRepublished_exitsOneAndNamesIt', () => {
  const result = compare(report([cacheRow('loan', 1)]), report([cacheRow('loan', 1)]), '--expect-changed=loan');

  assert.deepEqual({ status: result.status, said: /render cache NOT republished: loan/.test(result.stdout) }, { status: 1, said: true });
});

test('compareReports_renderCacheUnreadable_exitsOneAndSaysSo', () => {
  const result = compare(report([cacheRow('loan', 1)]), report({ error: '403 Forbidden' }));

  assert.deepEqual({ status: result.status, said: /render cache could not be read in the after report: 403 Forbidden/.test(result.stdout) }, { status: 1, said: true });
});
