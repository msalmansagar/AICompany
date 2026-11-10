/**
 * Minimal Dataverse Web API client for the survey provisioner (cloud, client credentials).
 * Credentials come only from env vars (DV_TENANT_ID, DV_CLIENT_ID, DV_CLIENT_SECRET,
 * DV_DATAVERSE_URL); nothing is logged except paths and status codes.
 *
 * @module survey-provisioning/dataverse-client
 */

export class DataverseRequestError extends Error {
  constructor(method, path, status, body) {
    super(`${method} ${path} -> ${status}: ${body.slice(0, 400)}`);
    this.name = 'DataverseRequestError';
    this.status = status;
  }
}

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Environment variable ${name} is required.`);
  return value;
};

async function fetchToken(orgUrl) {
  const response = await fetch(`https://login.microsoftonline.com/${requireEnv('DV_TENANT_ID')}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials', client_id: requireEnv('DV_CLIENT_ID'),
      client_secret: requireEnv('DV_CLIENT_SECRET'), scope: `${orgUrl}/.default`,
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`Token request failed: ${json.error_description ?? response.status}`);
  return json.access_token;
}

/**
 * Creates a client bound to one org. Every write carries the solution header so new components
 * land in SurveyEngine rather than the Default solution.
 *
 * @param {{ solutionUniqueName: string }} options
 */
export async function createDataverseClient({ solutionUniqueName }) {
  const orgUrl = requireEnv('DV_DATAVERSE_URL').replace(/\/$/, '');
  const apiUrl = `${orgUrl}/api/data/${process.env.DV_API_VERSION ?? 'v9.2'}`;
  const accessToken = await fetchToken(orgUrl);
  const baseHeaders = {
    Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'Content-Type': 'application/json',
    'OData-MaxVersion': '4.0', 'OData-Version': '4.0',
  };

  async function send(method, path, body, extraHeaders = {}) {
    const headers = { ...baseHeaders, ...(method === 'GET' ? {} : { 'MSCRM.SolutionUniqueName': solutionUniqueName }), ...extraHeaders };
    const response = await fetch(`${apiUrl}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    if (!response.ok) throw new DataverseRequestError(method, path, response.status, text);
    return { json: text ? JSON.parse(text) : null, entityId: parseEntityId(response.headers.get('OData-EntityId')) };
  }

  /** GET that answers null on 404 instead of throwing, for existence checks. */
  async function find(path) {
    try {
      return (await send('GET', path)).json;
    } catch (error) {
      if (error instanceof DataverseRequestError && error.status === 404) return null;
      throw error;
    }
  }

  return { orgUrl, send, find };
}

// A Dataverse create answers 204 with an empty body; the new id is only in OData-EntityId.
function parseEntityId(header) {
  return header?.match(/\(([0-9a-f-]{36})\)\s*$/i)?.[1] ?? null;
}
