/**
 * Capture command: reads every active render-cache row from the org and writes a
 * baseline JSON file.  This command is READ-ONLY against CRM — it makes no changes.
 *
 * Baseline file format:
 *   {
 *     capturedOn: ISO timestamp,
 *     orgUrl: string,
 *     entries: [{ formCode, version, language, content: <decoded runtime JSON> }]
 *   }
 *
 * @module regression-gate/capture
 */
import { writeFileSync } from 'node:fs';
import { acquireDataverseToken } from './lib/auth.mjs';
import { readActiveRenderCacheEntries } from './lib/dataverse.mjs';

/**
 * @typedef {import('./lib/dataverse.mjs').RenderCacheEntry} RenderCacheEntry
 * @typedef {{ capturedOn: string; orgUrl: string; entries: RenderCacheEntry[] }} Baseline
 */

/**
 * Captures the current active render-cache state and writes it to a file.
 *
 * @param {string} outFilePath - Absolute path of the JSON file to write.
 * @returns {Promise<{ entryCount: number; orgUrl: string }>}
 */
export async function runCapture(outFilePath) {
  const { accessToken, orgUrl } = await acquireDataverseToken();
  const entries = await readActiveRenderCacheEntries(accessToken, orgUrl);
  const baseline = buildBaseline(orgUrl, entries);
  writeFileSync(outFilePath, JSON.stringify(baseline, null, 2), 'utf8');
  return { entryCount: entries.length, orgUrl };
}

/**
 * @param {string} orgUrl
 * @param {RenderCacheEntry[]} entries
 * @returns {Baseline}
 */
function buildBaseline(orgUrl, entries) {
  return {
    capturedOn: new Date().toISOString(),
    orgUrl,
    entries,
  };
}
