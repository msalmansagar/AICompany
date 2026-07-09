'use strict';

/**
 * crm-api-client.js
 *
 * Single source of truth for Dataverse client-credentials auth and request
 * headers shared by the SOP maintenance scripts. No hardcoded org identity —
 * every value is required from the environment and validated fail-fast.
 *
 * Required env vars:
 *   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, DATAVERSE_URL
 */

const REQUIRED_ENV = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'DATAVERSE_URL'];

/**
 * Reads and validates the CRM connection config from the environment.
 * Exits the process with a clear message if any value is missing.
 * @returns {{ tenantId: string, clientId: string, clientSecret: string, orgUrl: string, apiBase: string }}
 */
function loadCrmConfig() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`[FATAL] Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
  const orgUrl = process.env.DATAVERSE_URL;
  return {
    tenantId:     process.env.AZURE_TENANT_ID,
    clientId:     process.env.AZURE_CLIENT_ID,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
    orgUrl,
    apiBase:      `${orgUrl}/api/data/v9.2`,
  };
}

/**
 * Acquires an OAuth access token via the client-credentials flow.
 * @param {{ tenantId: string, clientId: string, clientSecret: string, orgUrl: string }} config
 * @returns {Promise<string>} bearer access token
 */
async function getToken(config) {
  const res = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     config.clientId,
        client_secret: config.clientSecret,
        scope:         `${config.orgUrl}/.default`,
      }).toString(),
    }
  );
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Auth failed: ${res.status} ${errorText}`);
  }
  const { access_token: accessToken } = await res.json();
  return accessToken;
}

/**
 * Builds standard Dataverse Web API headers, merging any extra headers.
 * @param {string} token bearer access token
 * @param {Record<string, string>} [extra] additional headers (e.g. Prefer, MSCRM.SolutionName)
 * @returns {Record<string, string>}
 */
function buildHeaders(token, extra = {}) {
  return {
    Authorization:      `Bearer ${token}`,
    'Content-Type':     'application/json',
    Accept:             'application/json',
    'OData-Version':    '4.0',
    'OData-MaxVersion': '4.0',
    ...extra,
  };
}

module.exports = { loadCrmConfig, getToken, buildHeaders };
