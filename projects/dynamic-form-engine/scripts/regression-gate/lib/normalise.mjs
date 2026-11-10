/**
 * Content normalisation: strips volatile stamp keys from a parsed JSON value at any
 * depth before a structural comparison.  The original value is not mutated.
 *
 * @module regression-gate/lib/normalise
 */
import { DEFAULT_VOLATILE_STAMPS } from './volatile-stamps.mjs';

/**
 * Returns a deep copy of parsedJson with all volatile stamp keys removed at every
 * level of the object graph.
 *
 * @param {unknown} parsedJson - Any JSON value.
 * @param {readonly string[]} [extraStamps] - Additional key names to strip beyond the defaults.
 * @returns {unknown} Normalised copy (new object; original is untouched).
 */
export function normalise(parsedJson, extraStamps = []) {
  const stampSet = new Set([...DEFAULT_VOLATILE_STAMPS, ...extraStamps]);
  return stripStamps(parsedJson, stampSet);
}

/**
 * @param {unknown} value
 * @param {Set<string>} stampSet
 * @returns {unknown}
 */
function stripStamps(value, stampSet) {
  if (Array.isArray(value)) {
    return value.map((item) => stripStamps(item, stampSet));
  }
  if (value !== null && typeof value === 'object') {
    return stripObjectStamps(/** @type {Record<string, unknown>} */ (value), stampSet);
  }
  return value;
}

/**
 * @param {Record<string, unknown>} obj
 * @param {Set<string>} stampSet
 * @returns {Record<string, unknown>}
 */
function stripObjectStamps(obj, stampSet) {
  const result = /** @type {Record<string, unknown>} */ ({});
  for (const [key, val] of Object.entries(obj)) {
    if (stampSet.has(key)) continue;
    result[key] = stripStamps(val, stampSet);
  }
  return result;
}
