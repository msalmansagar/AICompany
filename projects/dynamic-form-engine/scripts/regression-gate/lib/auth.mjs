/**
 * Azure AD OAuth2 client-credentials token helper for Dataverse.
 *
 * Credentials are read exclusively from environment variables — never from source
 * (ANTI-005, Article VII).  Set them in scripts/.env:
 *
 *   DV_TENANT_ID     Azure AD tenant GUID
 *   DV_CLIENT_ID     Service-principal application (client) GUID
 *   DV_CLIENT_SECRET Service-principal client secret
 *   DV_DATAVERSE_URL Full org URL, e.g. https://org5869857f.crm4.dynamics.com
 *
 * This helper is cloud-only (client-credentials flow). On-prem orgs use Windows /
 * AD FS auth — if on-prem capture is needed, replace this module with a compatible
 * one and document the swap in the README.
 *
 * @module regression-gate/lib/auth
 */

/**
 * @typedef {{ accessToken: string; orgUrl: string }} TokenResult
 */

/**
 * Acquires a Dataverse access token using the env-var credentials.
 *
 * @returns {Promise<TokenResult>}
 * @throws {Error} If any required env var is missing or the token request fails.
 */
export async function acquireDataverseToken() {
  const { tenantId, clientId, clientSecret, orgUrl } = readEnvConfig();
  const accessToken = await fetchToken({ tenantId, clientId, clientSecret, orgUrl });
  return { accessToken, orgUrl };
}

/**
 * @returns {{ tenantId: string; clientId: string; clientSecret: string; orgUrl: string }}
 */
function readEnvConfig() {
  return {
    tenantId: requireEnv('DV_TENANT_ID'),
    clientId: requireEnv('DV_CLIENT_ID'),
    clientSecret: requireEnv('DV_CLIENT_SECRET'),
    orgUrl: requireEnv('DV_DATAVERSE_URL'),
  };
}

/**
 * @param {string} name
 * @returns {string}
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/**
 * @param {{ tenantId: string; clientId: string; clientSecret: string; orgUrl: string }} params
 * @returns {Promise<string>}
 */
async function fetchToken({ tenantId, clientId, clientSecret, orgUrl }) {
  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${orgUrl}/.default`,
  });
  const response = await fetch(url, { method: 'POST', body });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(
      `Token request failed (${response.status}): ${json.error_description ?? json.error}`,
    );
  }
  return json.access_token;
}
