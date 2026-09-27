/**
 * Dual-platform configuration tests (Phase 1).
 *
 * On-premises (D365 CE 9.1) and Dataverse cloud are equal deployment targets. The Web API version is
 * therefore configuration, never a constant in application source — the same build must serve both.
 * These tests fail if anyone reintroduces a compiled-in version.
 */
import { describe, it, expect } from 'vitest';
import { buildTestApp, makeAuthAdapter } from './test-app.js';

describe('Web API version is configuration, not a constant', () => {
  it('should_use_v9_1_for_an_on_premises_deployment', async () => {
    const app = await buildTestApp(makeAuthAdapter(), { DV_API_VERSION: '9.1' });

    expect(app.hlOrgTarget.apiVersion).toBe('9.1');

    await app.close();
  });

  it('should_use_v9_2_for_a_cloud_deployment', async () => {
    const app = await buildTestApp(makeAuthAdapter(), { DV_API_VERSION: '9.2' });

    expect(app.hlOrgTarget.apiVersion).toBe('9.2');

    await app.close();
  });

  it('should_let_each_organisation_run_a_different_platform_version', async () => {
    const app = await buildTestApp(makeAuthAdapter(), {
      DV_API_VERSION: '9.1',
      FEATURE_BFD: true,
      DV_BFD_DATAVERSE_URL: 'https://bfd-crm.example.com',
      DV_BFD_CLIENT_ID: 'bfd-client',
      DV_BFD_CLIENT_SECRET: 'bfd-secret',
      DV_BFD_SCOPE: 'https://bfd-crm/.default',
      DV_BFD_API_VERSION: '9.2',
    });

    expect(app.hlOrgTarget.apiVersion).toBe('9.1');
    expect(app.bfdOrgTarget?.apiVersion).toBe('9.2');

    await app.close();
  });

  it('should_fall_back_to_the_shared_version_when_the_bfd_version_is_not_set', async () => {
    const app = await buildTestApp(makeAuthAdapter(), {
      DV_API_VERSION: '9.1',
      FEATURE_BFD: true,
      DV_BFD_DATAVERSE_URL: 'https://bfd-crm.example.com',
      DV_BFD_CLIENT_ID: 'bfd-client',
      DV_BFD_CLIENT_SECRET: 'bfd-secret',
      DV_BFD_SCOPE: 'https://bfd-crm/.default',
    });

    expect(app.bfdOrgTarget?.apiVersion).toBe('9.1');

    await app.close();
  });
});
