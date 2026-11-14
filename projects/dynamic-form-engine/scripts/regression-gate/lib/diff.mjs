/**
 * Deep structural diff for parsed JSON values.
 * Returns an array of findings; an empty array means the values are structurally identical.
 *
 * Arrays are compared element-by-element (index-keyed), not set-matched.  This is
 * intentional: the DFE runtime JSON preserves field and section order, so an index
 * shift is a real content change worth reporting.
 *
 * @module regression-gate/lib/diff
 */

/**
 * @typedef {{ path: string; op: 'changed' | 'added' | 'removed'; from: unknown; to: unknown }} DiffFinding
 */

/**
 * Performs a deep structural diff between two JSON values.
 *
 * @param {unknown} before - Baseline value (normalised).
 * @param {unknown} after  - Current value (normalised).
 * @param {string}  [path] - JSON path prefix (used for recursive calls).
 * @returns {DiffFinding[]}
 */
export function deepDiff(before, after, path = '') {
  if (before === after) return [];

  if (!isSameKind(before, after)) {
    return [{ path, op: 'changed', from: before, to: after }];
  }
  if (Array.isArray(before)) {
    return diffArrays(before, /** @type {unknown[]} */ (after), path);
  }
  if (before !== null && typeof before === 'object') {
    return diffObjects(
      /** @type {Record<string, unknown>} */ (before),
      /** @type {Record<string, unknown>} */ (after),
      path,
    );
  }
  // Primitive mismatch (typeof matched but values differ, e.g. 1 vs 2)
  return [{ path, op: 'changed', from: before, to: after }];
}

/**
 * Returns true when both values belong to the same structural category
 * (same typeof, same null-ness, same Array-ness).
 *
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function isSameKind(a, b) {
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if ((a === null) !== (b === null)) return false;
  return typeof a === typeof b;
}

/**
 * @param {unknown[]} before
 * @param {unknown[]} after
 * @param {string} path
 * @returns {DiffFinding[]}
 */
function diffArrays(before, after, path) {
  const findings = [];
  const maxLen = Math.max(before.length, after.length);
  for (let i = 0; i < maxLen; i++) {
    const childPath = `${path}[${i}]`;
    if (i >= before.length) {
      findings.push({ path: childPath, op: 'added', from: undefined, to: after[i] });
    } else if (i >= after.length) {
      findings.push({ path: childPath, op: 'removed', from: before[i], to: undefined });
    } else {
      findings.push(...deepDiff(before[i], after[i], childPath));
    }
  }
  return findings;
}

/**
 * @param {Record<string, unknown>} before
 * @param {Record<string, unknown>} after
 * @param {string} path
 * @returns {DiffFinding[]}
 */
function diffObjects(before, after, path) {
  const findings = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of allKeys) {
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in before)) {
      findings.push({ path: childPath, op: 'added', from: undefined, to: after[key] });
    } else if (!(key in after)) {
      findings.push({ path: childPath, op: 'removed', from: before[key], to: undefined });
    } else {
      findings.push(...deepDiff(before[key], after[key], childPath));
    }
  }
  return findings;
}
