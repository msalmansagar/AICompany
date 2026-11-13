// A2 / NFR-CSE-004 (Part D): after runbook stage 2 the org runs the updated Form Engine with no
// SurveyEngine. This report proves that state and snapshots the render cache at that moment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SurveyChecks, emptyKit, notFound, rows, fakeGet, checkOf, base64Of, sha256Of } from './support/check-fakes.mjs';

const { PASS, FAIL } = SurveyChecks;
const formEngineOnly = (answers, kit = emptyKit()) => SurveyChecks.formEngineOnly({ get: fakeGet(answers), kit });

const HASH_KIT = emptyKit({ hashes: { designer: sha256Of('designer'), runtime: sha256Of('runtime'), formEnginePlugin: sha256Of('dll') } });
const kitBuilds = {
  "webresourceset?$select=content&$filter=name eq 'qdb_designer'": rows({ content: base64Of('designer') }),
  "webresourceset?$select=content&$filter=name eq 'qdb_runtime'": rows({ content: base64Of('runtime') }),
};

test('formEngineOnly_surveyEngineNotImported_passesS1', async () => {
  assert.equal(checkOf(await formEngineOnly({}), 'S1').status, PASS);
});

test('formEngineOnly_surveyEngineAlreadyImported_failsS1', async () => {
  const report = await formEngineOnly({ solutions: rows({ version: '1.0.0.0' }) });

  assert.match(checkOf(report, 'S1').detail, /cannot serve as A2 evidence/);
});

// A failed read proves nothing about absence, so it must not pass as "no SurveyEngine".
test('formEngineOnly_solutionsUnreadable_failsS1', async () => {
  assert.equal(checkOf(await formEngineOnly({ solutions: notFound() }), 'S1').status, FAIL);
});

test('formEngineOnly_stage2Landed_passesQ8AndQ9', async () => {
  const report = await formEngineOnly(kitBuilds, HASH_KIT);

  assert.deepEqual(['Q8', 'Q9'].map((id) => checkOf(report, id).status), [PASS, PASS]);
});

test('formEngineOnly_stage2NotDone_failsQ8AndQ9', async () => {
  const report = await formEngineOnly({}, HASH_KIT);

  assert.deepEqual(['Q8', 'Q9'].map((id) => checkOf(report, id).status), [FAIL, FAIL]);
});

test('formEngineOnly_doesNotCheckSurveyComponents', async () => {
  assert.equal(checkOf(await formEngineOnly({}), 'Q1'), undefined);
});

// ── The three sample forms republished in stage 2 must be the only render cache rows that change ──

const cacheRow = (formCode, language, version) => ({ formCode, language, version, modifiedOn: `v${version}` });
const BEFORE = [cacheRow('loan', 1033, 1), cacheRow('loan', 1025, 1), cacheRow('grid', 1033, 4), cacheRow('other', 1033, 2)];

test('renderCacheDifferences_onlyTheExpectedFormsChanged_answersNothing', () => {
  const after = [cacheRow('loan', 1033, 2), cacheRow('loan', 1025, 2), cacheRow('grid', 1033, 5), cacheRow('other', 1033, 2)];

  assert.deepEqual(SurveyChecks.renderCacheDifferences(BEFORE, after, ['loan', 'grid']), { unexpected: [], notChanged: [] });
});

test('renderCacheDifferences_anotherFormChanged_listsItAsUnexpected', () => {
  const after = [cacheRow('loan', 1033, 2), cacheRow('loan', 1025, 2), cacheRow('grid', 1033, 4), cacheRow('other', 1033, 3)];

  assert.deepEqual(SurveyChecks.renderCacheDifferences(BEFORE, after, ['loan']).unexpected, ['other|1033']);
});

test('renderCacheDifferences_expectedFormDidNotChange_listsItAsNotChanged', () => {
  assert.deepEqual(SurveyChecks.renderCacheDifferences(BEFORE, BEFORE, ['loan']).notChanged, ['loan']);
});

test('formEngineOnly_reportIsAStage2SnapshotOfTheRenderCache', async () => {
  const cache = rows({ qdb_form_code: 'loan', qdb_language_code: 1033, qdb_published_version: 3, modifiedon: '2026-11-20T08:00:00Z', statecode: 0 });

  const report = await formEngineOnly({ qdb_form_render_caches: cache });

  assert.deepEqual({ kind: report.kind, cache: report.renderCache.map((row) => `${row.formCode}|${row.version}`) }, { kind: 'survey-stage2', cache: ['loan|3'] });
});
