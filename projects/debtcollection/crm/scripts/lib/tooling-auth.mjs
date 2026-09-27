/**
 * tooling-auth.mjs
 * Deployment-tooling authentication adapter.
 *
 * On-premises and Dataverse cloud are equal deployment targets, so the tooling must be able to reach
 * either. The token mechanism is the one genuine platform difference here, and the Master Prompt
 * permits deployment tooling to differ — but it has to *exist* for both, which it previously did not:
 * the Entra token endpoint was hard-coded, so no provisioning, registration or smoke script could run
 * against an on-premises organisation.
 *
 * Selected by `DV_AUTH_MODE`:
 *   entra   — Microsoft Entra ID (Azure AD) client credentials. Dataverse cloud.
 *   adfs    — AD FS 2019 / any standards OIDC token endpoint, client credentials.
 *   ifd     — Dynamics 365 CE on-premises IFD (claims) via an OAuth token endpoint.
 *   windows — Windows-integrated auth against an on-premises org (no bearer token).
 *
 * `windows` returns no token: callers must send the request with the ambient Windows credentials.
 * Node's fetch cannot do Negotiate/NTLM, so that mode is reported as unsupported by this tooling and
 * the Plugin Registration Tool / solution import path is used instead (see DeploymentGuide.md).
 */

/** @typedef {{ mode: string, tokenEndpoint?: string, scope?: string, resource?: string }} AuthDescriptor */

const MODES = ['entra', 'adfs', 'ifd', 'windows'];

/**
 * Resolves which authentication mode the tooling should use.
 * Defaults to `entra` only when `DV_AUTH_MODE` is unset, preserving existing cloud behaviour.
 * @param {Record<string, string|undefined>} env
 * @returns {string}
 */
export function resolveAuthMode(env = process.env) {
  const mode = (env.DV_AUTH_MODE ?? 'entra').toLowerCase();
  if (!MODES.includes(mode)) {
    throw new Error(`DV_AUTH_MODE must be one of ${MODES.join(', ')} — got "${mode}"`);
  }
  return mode;
}

/**
 * Builds the token-endpoint descriptor for a mode without contacting the network.
 * Kept pure so it can be unit-tested for both platforms.
 * @param {string} mode
 * @param {{ tenantId?: string, orgUrl: string, authority?: string }} cfg
 * @returns {AuthDescriptor}
 */
export function describeTokenRequest(mode, cfg) {
  if (mode === 'entra') {
    if (!cfg.tenantId) throw new Error('DV_TENANT_ID is required for DV_AUTH_MODE=entra');
    return {
      mode,
      tokenEndpoint: `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`,
      scope: `${cfg.orgUrl}/.default`,
    };
  }
  if (mode === 'adfs' || mode === 'ifd') {
    if (!cfg.authority) {
      throw new Error(`DV_AUTH_AUTHORITY is required for DV_AUTH_MODE=${mode} ` +
        '(e.g. https://adfs.qdb.local/adfs — the tooling appends /oauth2/token)');
    }
    const authority = cfg.authority.replace(/\/$/, '');
    // AD FS 2019 exposes the standard OAuth2 token endpoint here; on-prem CRM expects the org URL
    // as the `resource` rather than a `.default` scope.
    return { mode, tokenEndpoint: `${authority}/oauth2/token`, resource: cfg.orgUrl };
  }
  return { mode }; // windows — no bearer token
}

/**
 * Acquires a bearer token for the configured mode.
 * @param {{ tenantId?: string, clientId: string, clientSecret: string, orgUrl: string, authority?: string }} cfg
 * @param {string} [mode]
 * @returns {Promise<string>}
 */
export async function acquireTokenForMode(cfg, mode = resolveAuthMode()) {
  if (mode === 'windows') {
    throw new Error(
      'DV_AUTH_MODE=windows: Node fetch cannot perform Negotiate/NTLM authentication. ' +
      'Deploy to this organisation with the Plugin Registration Tool and solution import ' +
      '(see docs/DeploymentGuide.md), or configure AD FS and use DV_AUTH_MODE=adfs.',
    );
  }

  const descriptor = describeTokenRequest(mode, cfg);
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  if (descriptor.scope) body.set('scope', descriptor.scope);
  if (descriptor.resource) body.set('resource', descriptor.resource);

  const res = await fetch(descriptor.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    throw new Error(`Auth failed (${mode}) ${res.status}: ${await res.text()}`);
  }
  const { access_token: accessToken } = await res.json();
  if (!accessToken) throw new Error(`Auth succeeded (${mode}) but no access_token was returned`);
  return accessToken;
}
