/**
 * Dual-platform tooling authentication tests.
 * Run: node --test crm/scripts/lib/
 *
 * Proves the deployment tooling can address both targets. Before Phase 1 the Entra token endpoint
 * was hard-coded, so no provisioning, registration or smoke script could run against on-premises.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAuthMode, describeTokenRequest, acquireTokenForMode } from './tooling-auth.mjs';

const ORG_CLOUD = 'https://org5869857f.crm4.dynamics.com';
const ORG_ONPREM = 'https://crm.qdb.internal/HLCRM';

describe('resolveAuthMode', () => {
  test('defaults to entra when unset, preserving existing cloud behaviour', () => {
    assert.equal(resolveAuthMode({}), 'entra');
  });

  test('accepts each supported mode, case-insensitively', () => {
    for (const mode of ['entra', 'adfs', 'ifd', 'windows']) {
      assert.equal(resolveAuthMode({ DV_AUTH_MODE: mode.toUpperCase() }), mode);
    }
  });

  test('rejects an unknown mode rather than silently falling back', () => {
    assert.throws(() => resolveAuthMode({ DV_AUTH_MODE: 'oauth' }), /DV_AUTH_MODE must be one of/);
  });
});

describe('describeTokenRequest', () => {
  test('builds the Entra endpoint and a .default scope for cloud', () => {
    const d = describeTokenRequest('entra', { tenantId: 'tenant-1', orgUrl: ORG_CLOUD });

    assert.equal(d.tokenEndpoint, 'https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token');
    assert.equal(d.scope, `${ORG_CLOUD}/.default`);
    assert.equal(d.resource, undefined);
  });

  test('builds the AD FS endpoint and a resource for on-premises', () => {
    const d = describeTokenRequest('adfs', { authority: 'https://adfs.qdb.local/adfs', orgUrl: ORG_ONPREM });

    assert.equal(d.tokenEndpoint, 'https://adfs.qdb.local/adfs/oauth2/token');
    assert.equal(d.resource, ORG_ONPREM);
    assert.equal(d.scope, undefined);
    assert.ok(!d.tokenEndpoint.includes('microsoftonline'), 'on-prem must not reach Entra');
  });

  test('tolerates a trailing slash on the authority', () => {
    const d = describeTokenRequest('ifd', { authority: 'https://adfs.qdb.local/adfs/', orgUrl: ORG_ONPREM });

    assert.equal(d.tokenEndpoint, 'https://adfs.qdb.local/adfs/oauth2/token');
  });

  test('requires a tenant for entra', () => {
    assert.throws(() => describeTokenRequest('entra', { orgUrl: ORG_CLOUD }), /DV_TENANT_ID is required/);
  });

  test('requires an authority for adfs and ifd', () => {
    assert.throws(() => describeTokenRequest('adfs', { orgUrl: ORG_ONPREM }), /DV_AUTH_AUTHORITY is required/);
    assert.throws(() => describeTokenRequest('ifd', { orgUrl: ORG_ONPREM }), /DV_AUTH_AUTHORITY is required/);
  });

  test('returns no endpoint for windows-integrated auth', () => {
    const d = describeTokenRequest('windows', { orgUrl: ORG_ONPREM });

    assert.equal(d.tokenEndpoint, undefined);
  });
});

describe('acquireTokenForMode', () => {
  test('explains the supported path instead of failing obscurely for windows auth', async () => {
    await assert.rejects(
      () => acquireTokenForMode({ clientId: 'c', clientSecret: 's', orgUrl: ORG_ONPREM }, 'windows'),
      /Plugin Registration Tool/,
    );
  });
});
