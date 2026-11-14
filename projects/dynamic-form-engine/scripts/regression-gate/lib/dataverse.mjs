/**
 * Dataverse read layer for the regression gate.
 * Fetches every active render-cache row and decodes each one into a plain JS object.
 *
 * Active = qdb_is_active eq true AND qdb_status eq 2  (Active in the local option set,
 * confirmed in RENDER-CACHE-SCHEMA.md: Active=2).
 *
 * On-prem API version note (from project memory — on-prem 9.1 returns HTTP 500 for
 * v9.2 endpoints): set DV_API_VERSION=v9.1 in scripts/.env when capturing from an
 * on-prem 9.1 org.  Defaults to v9.2 (cloud).
 *
 * @module regression-gate/lib/dataverse
 */
import { decodeRenderCacheJson } from './decode.mjs';

const DEFAULT_API_VERSION = 'v9.2';
const ENTITY_SET = 'qdb_form_render_caches';
const ACTIVE_STATUS_CODE = 2;
const SELECT_COLUMNS = [
  'qdb_form_code',
  'qdb_published_version',
  'qdb_language_code',
  'qdb_runtime_json',
].join(',');

/**
 * @typedef {{ formCode: string; version: number; language: string; content: unknown }} RenderCacheEntry
 */

/**
 * Reads all active render-cache rows from the org and decodes each blob.
 *
 * @param {string} accessToken - Bearer token from acquireDataverseToken().
 * @param {string} orgUrl      - Full org URL, e.g. https://org5869857f.crm4.dynamics.com.
 * @returns {Promise<RenderCacheEntry[]>}
 */
export async function readActiveRenderCacheEntries(accessToken, orgUrl) {
  const apiVersion = process.env.DV_API_VERSION ?? DEFAULT_API_VERSION;
  const rows = await fetchAllActiveRows(accessToken, orgUrl, apiVersion);
  return rows.map(decodeRow);
}

/**
 * @param {string} accessToken
 * @param {string} orgUrl
 * @param {string} apiVersion
 * @returns {Promise<Record<string, unknown>[]>}
 */
async function fetchAllActiveRows(accessToken, orgUrl, apiVersion) {
  const filter = `qdb_is_active eq true and qdb_status eq ${ACTIVE_STATUS_CODE}`;
  const firstPageUrl =
    `${orgUrl}/api/data/${apiVersion}/${ENTITY_SET}` +
    `?$filter=${encodeURIComponent(filter)}&$select=${SELECT_COLUMNS}`;
  const rows = [];
  for (let url = firstPageUrl; url; ) {
    const page = await fetchPage(url, accessToken);
    rows.push(...(page.value ?? []));
    url = page['@odata.nextLink'];
  }
  return rows;
}

/**
 * Fetches one OData page. A baseline missing rows past the first page would let a
 * changed form pass the gate unseen, so paging is followed to the end.
 *
 * @param {string} url
 * @param {string} accessToken
 * @returns {Promise<Record<string, unknown>>}
 */
async function fetchPage(url, accessToken) {
  const response = await fetch(url, { headers: buildODataHeaders(accessToken) });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Dataverse read failed (${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json();
}

/**
 * @param {string} accessToken
 * @returns {Record<string, string>}
 */
function buildODataHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0',
    'OData-Version': '4.0',
  };
}

/**
 * @param {Record<string, unknown>} row
 * @returns {RenderCacheEntry}
 */
function decodeRow(row) {
  const content = decodeRenderCacheJson(/** @type {string} */ (row.qdb_runtime_json));
  return {
    formCode: /** @type {string} */ (row.qdb_form_code),
    version: /** @type {number} */ (row.qdb_published_version),
    language: /** @type {string} */ (row.qdb_language_code),
    content,
  };
}
