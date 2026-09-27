/**
 * queues.mjs
 * Ensures the Phase 1 collection queues exist (FR-037). Queues are data, resolved by name at
 * runtime by the router and the StopContactQueueMover plugin, never by GUID.
 */
import { apiGet, apiPost } from './crm-client.mjs';

export const PHASE1_QUEUES = ['Early Collection', 'High Risk', 'Deceased & Insurance'];

/** @param {string} name */
const escapeQuotes = (name) => name.replace(/'/g, "''");

/**
 * Creates a queue by name if absent. Returns created | skipped.
 * @param {object} cfg @param {string} token @param {string} solutionName @param {string} name
 * @returns {Promise<'created'|'skipped'>}
 */
export async function ensureQueue(cfg, token, solutionName, name) {
  const existing = await apiGet(cfg, token, solutionName,
    `/queues?$select=queueid&$filter=name eq '${encodeURIComponent(escapeQuotes(name))}'&$top=1`);
  if (existing?.value?.length) {
    console.log(`  [SKIP] Queue ${name}`);
    return 'skipped';
  }
  await apiPost(cfg, token, solutionName, '/queues', { name, description: 'DCP Phase 1 collection queue (FR-037)' });
  console.log(`  [CREATED] Queue ${name}`);
  return 'created';
}
