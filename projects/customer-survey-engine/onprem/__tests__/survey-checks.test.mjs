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

test('compareRenderCache_rowThatAppeared_isListed', () => {
  const before = [row('a', 'en', 3, 't1')];

  assert.deepEqual(SurveyChecks.compareRenderCache(before, [...before, row('c', 'en', 1, 't2')]), ['c|en']);
});

const HEALTH_VIEW = { table: 'asyncoperation', name: 'Survey Jobs - Failed or Suspended' };
const kit = { largestWebResourceBytes: 1, formEngineTables: [], formEngineIcons: [], formEngineColumns: [], surveyTables: [], auditedTables: [], roleNames: [], schedulerRoleName: 'Survey Scheduler', customApis: [], surveyIcons: [], surveyViews: [HEALTH_VIEW], formEnginePluginAssembly: 'x', surveyPluginAssembly: 'y', appModule: 'z', solution: 's', publisher: { uniqueName: 'qdb', prefix: 'qdb', optionValuePrefix: 10000 }, hashes: {} };
const config = { settings: {}, sources: [], smsConfigs: [] };
const statusOf = (report, id) => report.checks.find((check) => check.id === id).status;
// Answers RetrieveVersion, then the first answer whose path prefix matches, then an empty result.
const fakeGet = (answers = {}) => async (path) => {
  if (path === 'RetrieveVersion()') return { Version: '9.1.42.8' };
  const prefix = Object.keys(answers).find((key) => path.startsWith(key));
  if (prefix === undefined) return { value: [] };
  if (answers[prefix] instanceof Error) throw answers[prefix];
  return answers[prefix];
};
const notFound = () => Object.assign(new Error('404 Resource not found'), { status: 404 });

test('preflight_customApiTableMissing_failsP3', async () => {
  const report = await SurveyChecks.preflight({ get: fakeGet({ customapis: notFound() }), kit, config });

  assert.equal(statusOf(report, 'P3'), SurveyChecks.FAIL);
});

test('preflight_systemJobRefusesViews_failsP13', async () => {
  const get = fakeGet({ "EntityDefinitions(LogicalName='asyncoperation')?$select=CanCreateViews": { CanCreateViews: { Value: false } } });

  assert.equal(statusOf(await SurveyChecks.preflight({ get, kit, config }), 'P13'), SurveyChecks.FAIL);
});

test('preflight_systemJobAllowsViews_passesP13', async () => {
  const get = fakeGet({ "EntityDefinitions(LogicalName='asyncoperation')?$select=CanCreateViews": { CanCreateViews: { Value: true } } });

  assert.equal(statusOf(await SurveyChecks.preflight({ get, kit, config }), 'P13'), SurveyChecks.PASS);
});

test('postImport_healthViewPresent_passesQ11', async () => {
  const get = fakeGet({ savedqueries: { value: [{ savedqueryid: 'v1', name: HEALTH_VIEW.name }] } });

  assert.equal(statusOf(await SurveyChecks.postImport({ get, kit }), 'Q11'), SurveyChecks.PASS);
});

test('postImport_healthViewMissing_failsQ11', async () => {
  assert.equal(statusOf(await SurveyChecks.postImport({ get: fakeGet(), kit }), 'Q11'), SurveyChecks.FAIL);
});
