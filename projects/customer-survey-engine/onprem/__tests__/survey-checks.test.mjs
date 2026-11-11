import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';

const SurveyChecks = createRequire(import.meta.url)('../checks/survey-checks.js');
const nodeSha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('sha256Hex_emptyInput_matchesTheStandardDigest', () => {
  assert.equal(SurveyChecks.sha256Hex(new Uint8Array(0)), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

test('sha256Hex_blockBoundaryLengths_matchNodeCrypto', () => {
  const mismatches = [55, 56, 63, 64, 65, 1000].filter((length) => {
    const bytes = randomBytes(length);
    return SurveyChecks.sha256Hex(new Uint8Array(bytes)) !== nodeSha256(bytes);
  });

  assert.deepEqual(mismatches, []);
});

const row = (formCode, language, version, modifiedOn) => ({ formCode, language, version, modifiedOn });

test('compareRenderCache_unchangedRows_answersNothing', () => {
  const before = [row('a', 'en', 3, 't1'), row('a', 'ar', 3, 't1')];

  assert.deepEqual(SurveyChecks.compareRenderCache(before, [...before].reverse()), []);
});

test('compareRenderCache_rewrittenOrMissingRow_isListed', () => {
  const before = [row('a', 'en', 3, 't1'), row('b', 'en', 1, 't1')];
  const after = [row('a', 'en', 3, 't2')];

  assert.deepEqual(SurveyChecks.compareRenderCache(before, after), ['a|en', 'b|en']);
});

test('preflight_customApiTableMissing_failsP3', async () => {
  const get = async (path) => {
    if (path.startsWith('customapis')) { const error = new Error('404 Resource not found'); error.status = 404; throw error; }
    if (path === 'RetrieveVersion()') return { Version: '9.1.42.8' };
    return { value: [] };
  };
  const kit = { largestWebResourceBytes: 1, formEngineTables: [], formEngineIcons: [], formEngineColumns: [], surveyTables: [], roleNames: [], customApis: [], surveyIcons: [], formEnginePluginAssembly: 'x', surveyPluginAssembly: 'y', appModule: 'z', solution: 's', publisher: { uniqueName: 'qdb', prefix: 'qdb', optionValuePrefix: 10000 } };

  const report = await SurveyChecks.preflight({ get, kit, config: { settings: {}, sources: [], smsConfigs: [] } });

  assert.equal(report.checks.find((check) => check.id === 'P3').status, SurveyChecks.FAIL);
});
