/**
 * Compare command: compares two baselines (or a baseline against the live org) and
 * reports added, removed and changed forms.
 *
 * Matching key: (formCode, language).  Version is intentionally excluded because
 * the current baseline will have a higher version after re-publishing; the gate
 * checks CONTENT, not version numbers.  When multiple versions exist for the same
 * key (should not happen in a clean org but handled defensively), the highest
 * version wins.
 *
 * Exit semantics (enforced by index.mjs):
 *   0 = status 'identical'  — no removed or changed forms; added forms are reported
 *                             but do not block the release (new forms are not regressions).
 *   1 = status 'different'  — one or more removed or changed forms; release is BLOCKED.
 *
 * @module regression-gate/compare
 */
import { readFileSync } from 'node:fs';
import { normalise } from './lib/normalise.mjs';
import { deepDiff } from './lib/diff.mjs';
import { acquireDataverseToken } from './lib/auth.mjs';
import { readActiveRenderCacheEntries } from './lib/dataverse.mjs';

/**
 * @typedef {import('./capture.mjs').Baseline} Baseline
 * @typedef {import('./lib/dataverse.mjs').RenderCacheEntry} RenderCacheEntry
 * @typedef {import('./lib/diff.mjs').DiffFinding} DiffFinding
 * @typedef {{ formCode: string; language: string }} FormKey
 * @typedef {{ formCode: string; language: string; diffs: DiffFinding[] }} ChangedForm
 * @typedef {{ status: 'identical' | 'different'; added: FormKey[]; removed: FormKey[]; changed: ChangedForm[] }} CompareResult
 */

/**
 * Compares two baselines and returns a structured result.
 *
 * @param {Baseline} baseline    - The pre-deploy reference snapshot.
 * @param {Baseline} current     - The post-deploy current snapshot.
 * @param {string[]} [extraStamps] - Additional volatile stamp keys to strip before comparing.
 * @returns {CompareResult}
 */
export function compareBaselines(baseline, current, extraStamps = []) {
  const baseIndex = buildFormIndex(baseline.entries);
  const currIndex = buildFormIndex(current.entries);
  const added = findAddedForms(baseIndex, currIndex);
  const removed = findRemovedForms(baseIndex, currIndex);
  const changed = findChangedForms(baseIndex, currIndex, extraStamps);
  const isBlocking = removed.length > 0 || changed.length > 0;
  return { status: isBlocking ? 'different' : 'identical', added, removed, changed };
}

/**
 * Loads a baseline from a JSON file on disk.
 *
 * @param {string} filePath
 * @returns {Baseline}
 */
export function loadBaseline(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Captures the current org state as a baseline (used for --current live).
 *
 * @returns {Promise<Baseline>}
 */
export async function captureCurrentState() {
  const { accessToken, orgUrl } = await acquireDataverseToken();
  const entries = await readActiveRenderCacheEntries(accessToken, orgUrl);
  return { capturedOn: new Date().toISOString(), orgUrl, entries };
}

/**
 * Builds a lookup map keyed by (formCode, language).
 * When multiple versions exist for the same key, the highest version wins.
 *
 * @param {RenderCacheEntry[]} entries
 * @returns {Map<string, RenderCacheEntry>}
 */
export function buildFormIndex(entries) {
  const index = new Map();
  for (const entry of entries) {
    const key = buildEntryKey(entry.formCode, entry.language);
    const existing = index.get(key);
    if (!existing || entry.version > existing.version) {
      index.set(key, entry);
    }
  }
  return index;
}

/**
 * @param {string} formCode
 * @param {string} language
 * @returns {string}
 */
function buildEntryKey(formCode, language) {
  return `${formCode}:::${language}`;
}

/**
 * @param {Map<string, RenderCacheEntry>} baseIndex
 * @param {Map<string, RenderCacheEntry>} currIndex
 * @returns {FormKey[]}
 */
function findAddedForms(baseIndex, currIndex) {
  const added = [];
  for (const [key, entry] of currIndex) {
    if (!baseIndex.has(key)) {
      added.push({ formCode: entry.formCode, language: entry.language });
    }
  }
  return added;
}

/**
 * @param {Map<string, RenderCacheEntry>} baseIndex
 * @param {Map<string, RenderCacheEntry>} currIndex
 * @returns {FormKey[]}
 */
function findRemovedForms(baseIndex, currIndex) {
  const removed = [];
  for (const [key, entry] of baseIndex) {
    if (!currIndex.has(key)) {
      removed.push({ formCode: entry.formCode, language: entry.language });
    }
  }
  return removed;
}

/**
 * @param {Map<string, RenderCacheEntry>} baseIndex
 * @param {Map<string, RenderCacheEntry>} currIndex
 * @param {string[]} extraStamps
 * @returns {ChangedForm[]}
 */
function findChangedForms(baseIndex, currIndex, extraStamps) {
  const changed = [];
  for (const [key, baseEntry] of baseIndex) {
    if (!currIndex.has(key)) continue;
    const currEntry = /** @type {RenderCacheEntry} */ (currIndex.get(key));
    const normBase = normalise(baseEntry.content, extraStamps);
    const normCurr = normalise(currEntry.content, extraStamps);
    const diffs = deepDiff(normBase, normCurr);
    if (diffs.length > 0) {
      changed.push({ formCode: baseEntry.formCode, language: baseEntry.language, diffs });
    }
  }
  return changed;
}
