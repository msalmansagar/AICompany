/**
 * FR-CSE-025 — Regression gate unit tests.
 *
 * Run (from the repository root):
 *   node --test projects/dynamic-form-engine/scripts/regression-gate/__tests__/regression-gate.test.mjs
 *
 * Uses node:test (Node 18+, no additional dependencies).
 * All fixtures are built in-memory using gzipSync — no live CRM calls are made.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { decodeRenderCacheJson } from '../lib/decode.mjs';
import { normalise } from '../lib/normalise.mjs';
import { deepDiff } from '../lib/diff.mjs';
import { compareBaselines, buildFormIndex } from '../compare.mjs';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Encodes a plain JS object the same way the DFE publish plugin writes qdb_runtime_json.
 *
 * @param {unknown} content
 * @returns {string} Base64-encoded gzip-compressed JSON.
 */
function encodeAsRenderCache(content) {
  const json = JSON.stringify(content);
  const compressed = gzipSync(Buffer.from(json, 'utf8'));
  return compressed.toString('base64');
}

/**
 * @param {string} formCode
 * @param {string} language
 * @param {unknown} content - Already-decoded runtime JSON object.
 * @param {number} [version]
 * @returns {import('../lib/dataverse.mjs').RenderCacheEntry}
 */
function makeEntry(formCode, language, content, version = 1) {
  return { formCode, language, version, content };
}

/**
 * @param {import('../lib/dataverse.mjs').RenderCacheEntry[]} entries
 * @param {string} [orgUrl]
 * @returns {import('../compare.mjs').Baseline}
 */
function makeBaseline(entries, orgUrl = 'https://test.crm4.dynamics.com') {
  return { capturedOn: new Date().toISOString(), orgUrl, entries };
}

/**
 * Returns a sample runtime-JSON object matching the structure produced by the
 * DFE publish plugin.  Volatile stamps are intentionally included so that
 * normalise() can be verified against them.
 *
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function makeSampleFormContent(overrides = {}) {
  return {
    formCode: 'FRM-001',
    formTitle: 'Test Form',
    // Volatile stamps — these must not affect comparison outcome:
    generatorVersion: '2.1.0',
    generatedOn: '2026-11-09T10:00:00.000Z',
    publishedOn: '2026-11-09T09:55:00.000Z',
    tabs: [
      {
        code: 'TAB-1',
        sections: [
          {
            code: 'SEC-1',
            fields: [
              { code: 'FLD-001', label: 'First Name', isHidden: false },
              { code: 'FLD-002', label: 'Last Name', isHidden: false },
            ],
          },
        ],
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// decodeRenderCacheJson
// ---------------------------------------------------------------------------

describe('decodeRenderCacheJson', () => {
  it('decodes a valid Base64-gzipped JSON payload back to the original object', () => {
    const original = { formCode: 'FRM-001', tabs: [{ code: 'T1', fields: [] }] };
    const encoded = encodeAsRenderCache(original);
    const decoded = decodeRenderCacheJson(encoded);
    assert.deepEqual(decoded, original);
  });

  it('throws a clear error on an empty string — never silently passes', () => {
    assert.throws(
      () => decodeRenderCacheJson(''),
      { message: /empty or not a string/ },
    );
  });

  it('throws a clear error on a non-string argument — never silently passes', () => {
    // @ts-expect-error — intentional wrong type for test
    assert.throws(
      () => decodeRenderCacheJson(null),
      { message: /empty or not a string/ },
    );
  });

  it('throws a clear error when base64 decodes to truncated gzip — never silently passes', () => {
    // "truncated garbage" base64-encodes fine but is not valid gzip data.
    const corruptGzip = Buffer.from('not-gzip-data').toString('base64');
    assert.throws(
      () => decodeRenderCacheJson(corruptGzip),
      { message: /gzip decompress failed/ },
    );
  });

  it('throws a clear error when gzip wraps invalid JSON — never silently passes', () => {
    const compressed = gzipSync(Buffer.from('not { valid json !!', 'utf8'));
    const encoded = compressed.toString('base64');
    assert.throws(
      () => decodeRenderCacheJson(encoded),
      { message: /JSON parse failed/ },
    );
  });
});

// ---------------------------------------------------------------------------
// normalise
// ---------------------------------------------------------------------------

describe('normalise', () => {
  it('strips known volatile stamp keys from the top-level object', () => {
    const input = { formCode: 'FRM-001', generatorVersion: '2.1.0', tabs: [] };
    const result = normalise(input);
    assert.equal('generatorVersion' in result, false);
    assert.equal(/** @type {any} */ (result).formCode, 'FRM-001');
  });

  it('strips the version and modifiedAt keys the C# publisher emits on re-publish', () => {
    const baseline = { formCode: 'FRM-001', version: 3, modifiedAt: '2026-11-01T08:00:00Z', tabs: [] };
    const republished = { formCode: 'FRM-001', version: 4, modifiedAt: '2026-11-09T08:00:00Z', tabs: [] };
    assert.deepEqual(normalise(republished), normalise(baseline));
  });

  it('strips all default volatile stamp variants (camelCase, snake_case, qdb_ prefix)', () => {
    const input = {
      qdb_published_on: '2026-11-09',
      publishedOn: '2026-11-09',
      published_on: '2026-11-09',
      qdb_last_generated_on: '2026-11-09',
      lastGeneratedOn: '2026-11-09',
      generatedOn: '2026-11-09',
      generated_on: '2026-11-09',
      qdb_generator_version: '2.0',
      generatorVersion: '2.0',
      generator_version: '2.0',
      qdb_generation_duration_ms: 150,
      generationDurationMs: 150,
      generation_duration_ms: 150,
      formCode: 'FRM-001',
    };
    const result = normalise(input);
    const resultObj = /** @type {Record<string, unknown>} */ (result);
    assert.equal(resultObj.formCode, 'FRM-001');
    for (const key of Object.keys(input)) {
      if (key !== 'formCode') {
        assert.equal(key in resultObj, false, `expected ${key} to be stripped`);
      }
    }
  });

  it('strips volatile stamps nested inside arrays and child objects', () => {
    const input = {
      tabs: [
        {
          publishedOn: '2026-11-01',
          code: 'TAB-1',
          sections: [{ generatedOn: '2026-11-01', code: 'SEC-1' }],
        },
      ],
    };
    const result = /** @type {any} */ (normalise(input));
    assert.equal('publishedOn' in result.tabs[0], false);
    assert.equal('generatedOn' in result.tabs[0].sections[0], false);
    assert.equal(result.tabs[0].code, 'TAB-1');
    assert.equal(result.tabs[0].sections[0].code, 'SEC-1');
  });

  it('strips extra stamps when explicitly provided', () => {
    const input = { formCode: 'FRM-001', customBuildId: 'abc-123' };
    const result = /** @type {any} */ (normalise(input, ['customBuildId']));
    assert.equal('customBuildId' in result, false);
    assert.equal(result.formCode, 'FRM-001');
  });

  it('does not mutate the original input object', () => {
    const original = { generatorVersion: '1.0', formCode: 'X' };
    normalise(original);
    assert.equal(original.generatorVersion, '1.0');
  });

  it('handles arrays of primitives without error', () => {
    const input = { codes: ['a', 'b', 'c'], generatorVersion: '1.0' };
    const result = /** @type {any} */ (normalise(input));
    assert.deepEqual(result.codes, ['a', 'b', 'c']);
  });
});

// ---------------------------------------------------------------------------
// deepDiff
// ---------------------------------------------------------------------------

describe('deepDiff', () => {
  it('returns an empty array for identical primitive values', () => {
    assert.deepEqual(deepDiff('a', 'a'), []);
    assert.deepEqual(deepDiff(42, 42), []);
    assert.deepEqual(deepDiff(true, true), []);
    assert.deepEqual(deepDiff(null, null), []);
  });

  it('returns an empty array for deeply identical nested objects', () => {
    const a = { x: 1, y: { z: [1, 2, 3] } };
    const b = { x: 1, y: { z: [1, 2, 3] } };
    assert.deepEqual(deepDiff(a, b), []);
  });

  it('reports a changed primitive at the correct JSON path', () => {
    const before = { tabs: [{ code: 'T1', label: 'old' }] };
    const after = { tabs: [{ code: 'T1', label: 'new' }] };
    const diffs = deepDiff(before, after);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].path, 'tabs[0].label');
    assert.equal(diffs[0].op, 'changed');
    assert.equal(diffs[0].from, 'old');
    assert.equal(diffs[0].to, 'new');
  });

  it('reports a removed object key', () => {
    const diffs = deepDiff({ a: 1, b: 2 }, { a: 1 });
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].op, 'removed');
    assert.equal(diffs[0].path, 'b');
    assert.equal(diffs[0].from, 2);
    assert.equal(diffs[0].to, undefined);
  });

  it('reports an added object key', () => {
    const diffs = deepDiff({ a: 1 }, { a: 1, b: 2 });
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].op, 'added');
    assert.equal(diffs[0].path, 'b');
    assert.equal(diffs[0].from, undefined);
    assert.equal(diffs[0].to, 2);
  });

  it('reports a type change as a single changed entry', () => {
    const diffs = deepDiff({ val: 1 }, { val: '1' });
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].op, 'changed');
    assert.equal(diffs[0].from, 1);
    assert.equal(diffs[0].to, '1');
  });

  it('reports array element additions when current is longer', () => {
    const diffs = deepDiff([1, 2], [1, 2, 3]);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].op, 'added');
    assert.equal(diffs[0].path, '[2]');
  });

  it('reports array element removals when current is shorter', () => {
    const diffs = deepDiff([1, 2, 3], [1, 2]);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].op, 'removed');
    assert.equal(diffs[0].path, '[2]');
  });

  it('reports path correctly for deeply nested field changes', () => {
    const before = { tabs: [{ sections: [{ fields: [{ isHidden: false }] }] }] };
    const after = { tabs: [{ sections: [{ fields: [{ isHidden: true }] }] }] };
    const diffs = deepDiff(before, after);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].path, 'tabs[0].sections[0].fields[0].isHidden');
  });
});

// ---------------------------------------------------------------------------
// buildFormIndex
// ---------------------------------------------------------------------------

describe('buildFormIndex', () => {
  it('indexes entries by formCode:::language', () => {
    const entries = [
      makeEntry('FRM-001', 'en', {}),
      makeEntry('FRM-001', 'ar', {}),
    ];
    const index = buildFormIndex(entries);
    assert.equal(index.size, 2);
    assert.ok(index.has('FRM-001:::en'));
    assert.ok(index.has('FRM-001:::ar'));
  });

  it('keeps the highest version when multiple entries share the same formCode+language', () => {
    const entries = [
      makeEntry('FRM-001', 'en', { v: 1 }, 1),
      makeEntry('FRM-001', 'en', { v: 2 }, 2),
    ];
    const index = buildFormIndex(entries);
    assert.equal(index.size, 1);
    assert.equal(/** @type {any} */ (index.get('FRM-001:::en')).version, 2);
  });
});

// ---------------------------------------------------------------------------
// compareBaselines — the five gate scenarios from the architecture doc
// ---------------------------------------------------------------------------

describe('compareBaselines', () => {
  it('scenario 1: identical content with different timestamps → status identical (not blocking)', () => {
    // Baseline and current have the same form structure; only volatile stamps differ.
    const contentA = makeSampleFormContent({ generatedOn: '2026-11-09T08:00:00.000Z', generatorVersion: '2.0.0' });
    const contentB = makeSampleFormContent({ generatedOn: '2026-11-09T10:00:00.000Z', generatorVersion: '2.1.0' });
    const baseline = makeBaseline([makeEntry('FRM-001', 'en', contentA)]);
    const current = makeBaseline([makeEntry('FRM-001', 'en', contentB, 2)]);

    const result = compareBaselines(baseline, current);

    assert.equal(result.status, 'identical');
    assert.equal(result.changed.length, 0);
    assert.equal(result.removed.length, 0);
  });

  it('scenario 2: one changed field → status different, path reported', () => {
    const contentA = makeSampleFormContent();
    const contentB = makeSampleFormContent();
    // Mutate a content field (not a volatile stamp) in the current snapshot.
    /** @type {any} */ (contentB).tabs[0].sections[0].fields[0].isHidden = true;

    const baseline = makeBaseline([makeEntry('FRM-001', 'en', contentA)]);
    const current = makeBaseline([makeEntry('FRM-001', 'en', contentB)]);

    const result = compareBaselines(baseline, current);

    assert.equal(result.status, 'different');
    assert.equal(result.changed.length, 1);
    assert.equal(result.changed[0].formCode, 'FRM-001');

    const isHiddenDiff = result.changed[0].diffs.find((d) => d.path.includes('isHidden'));
    assert.ok(isHiddenDiff, 'diff findings should include the isHidden path');
    assert.equal(isHiddenDiff.from, false);
    assert.equal(isHiddenDiff.to, true);
  });

  it('scenario 3: a removed form → status different, removed list populated', () => {
    const baseline = makeBaseline([
      makeEntry('FRM-001', 'en', makeSampleFormContent()),
      makeEntry('FRM-002', 'en', makeSampleFormContent({ formCode: 'FRM-002' })),
    ]);
    const current = makeBaseline([
      makeEntry('FRM-001', 'en', makeSampleFormContent()),
    ]);

    const result = compareBaselines(baseline, current);

    assert.equal(result.status, 'different');
    assert.equal(result.removed.length, 1);
    assert.equal(result.removed[0].formCode, 'FRM-002');
    assert.equal(result.removed[0].language, 'en');
  });

  it('scenario 4: an added form → reported but release is not blocked (status identical)', () => {
    const baseline = makeBaseline([
      makeEntry('FRM-001', 'en', makeSampleFormContent()),
    ]);
    const current = makeBaseline([
      makeEntry('FRM-001', 'en', makeSampleFormContent()),
      makeEntry('FRM-002', 'en', makeSampleFormContent({ formCode: 'FRM-002' })),
    ]);

    const result = compareBaselines(baseline, current);

    assert.equal(result.status, 'identical');
    assert.equal(result.added.length, 1);
    assert.equal(result.added[0].formCode, 'FRM-002');
    assert.equal(result.changed.length, 0);
    assert.equal(result.removed.length, 0);
  });

  it('scenario 5: corrupt payload in an entry → decodeRenderCacheJson throws a clear error', () => {
    // This scenario covers the read path: if a row in the org has a corrupt blob,
    // decode throws — it never returns a silently wrong result.
    const corruptBase64 = Buffer.from('this is not gzip data').toString('base64');
    assert.throws(
      () => decodeRenderCacheJson(corruptBase64),
      { message: /gzip decompress failed/ },
    );
  });

  it('compares multi-language entries independently', () => {
    const baseline = makeBaseline([
      makeEntry('FRM-001', 'en', makeSampleFormContent()),
      makeEntry('FRM-001', 'ar', makeSampleFormContent()),
    ]);
    // AR version has a changed label; EN is identical.
    const arContent = makeSampleFormContent();
    /** @type {any} */ (arContent).tabs[0].sections[0].fields[0].label = 'الاسم الأول';
    const current = makeBaseline([
      makeEntry('FRM-001', 'en', makeSampleFormContent()),
      makeEntry('FRM-001', 'ar', arContent),
    ]);

    const result = compareBaselines(baseline, current);

    assert.equal(result.status, 'different');
    assert.equal(result.changed.length, 1);
    assert.equal(result.changed[0].formCode, 'FRM-001');
    assert.equal(result.changed[0].language, 'ar');
  });

  it('accepts extra volatile stamps via the third argument', () => {
    const contentA = makeSampleFormContent({ customBuildRef: 'build-001' });
    const contentB = makeSampleFormContent({ customBuildRef: 'build-002' });
    const baseline = makeBaseline([makeEntry('FRM-001', 'en', contentA)]);
    const current = makeBaseline([makeEntry('FRM-001', 'en', contentB)]);

    // Without extra stamps the custom field is treated as content → different.
    const withoutExtra = compareBaselines(baseline, current);
    assert.equal(withoutExtra.status, 'different');

    // With the custom stamp enrolled, it is stripped → identical.
    const withExtra = compareBaselines(baseline, current, ['customBuildRef']);
    assert.equal(withExtra.status, 'identical');
  });
});
