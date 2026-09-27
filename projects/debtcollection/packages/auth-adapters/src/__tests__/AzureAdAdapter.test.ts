import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AzureAdAdapter } from '../AzureAdAdapter.js';
import { TokenValidationError } from '../errors.js';
import { startMockOidcIssuer, type MockOidcIssuer } from './mock-oidc-issuer.js';
import type { OrgTarget } from '@dcp/types';
import { VIEW_SENSITIVE_PII_CLAIM } from '@dcp/types';

const HL_ORG: OrgTarget = { orgKey: 'HL', baseUrl: 'https://hl-crm.example.com', apiVersion: '9.2' };

describe('AzureAdAdapter', () => {
  let issuer: MockOidcIssuer;
  let adapter: AzureAdAdapter;

  beforeAll(async () => {
    issuer = await startMockOidcIssuer();
    adapter = new AzureAdAdapter({ allowInsecureRequests: true,
      issuerUrl: issuer.url,
      orgCredentials: {
        HL: { clientId: 'azure-client-id', clientSecret: 'azure-secret', scope: 'api' },
      },
    });
  });

  afterAll(async () => {
    await issuer.stop();
  });

  describe('getServiceToken', () => {
    it('should_return_access_token_from_client_credentials_grant', async () => {
      const token = await adapter.getServiceToken(HL_ORG);
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    });

    it('should_throw_TokenGrantError_for_unconfigured_org', async () => {
      const bfdOrg: OrgTarget = { orgKey: 'BFD', baseUrl: 'https://bfd.example.com', apiVersion: '9.2' };
      await expect(adapter.getServiceToken(bfdOrg)).rejects.toMatchObject({
        code: 'token_grant_failed',
      });
    });
  });

  describe('validateUserToken', () => {
    it('should_validate_token_and_extract_claims', async () => {
      const jwt = await issuer.signToken({
        sub: 'azure-user-001',
        email: 'rm@example.com',
        roles: ['Relationship Manager'],
      });

      const claims = await adapter.validateUserToken(jwt);

      expect(claims.sub).toBe('azure-user-001');
      expect(claims.email).toBe('rm@example.com');
      expect(claims.hasViewSensitivePii).toBe(false);
    });

    it('should_recognise_view_sensitive_pii_role_in_azure_token', async () => {
      const jwt = await issuer.signToken({
        sub: 'senior-manager',
        roles: [VIEW_SENSITIVE_PII_CLAIM, 'Senior Manager'],
      });

      const claims = await adapter.validateUserToken(jwt);

      expect(claims.hasViewSensitivePii).toBe(true);
    });

    it('should_throw_TokenValidationError_for_expired_token', async () => {
      const expiredJwt = await issuer.signToken({ sub: 'u' }, -1);
      await expect(adapter.validateUserToken(expiredJwt)).rejects.toBeInstanceOf(
        TokenValidationError,
      );
    });

    it('should_throw_TokenValidationError_when_iss_does_not_match_discovery_issuer', async () => {
      // Token signed with the correct key but carrying a different iss claim.
      // Without issuer validation, this token would pass signature checks and
      // be accepted — this test proves the issuer claim is enforced.
      const jwt = await issuer.signToken(
        { sub: 'attacker-002' },
        3600,
        'https://evil.example.com',
      );

      await expect(adapter.validateUserToken(jwt)).rejects.toBeInstanceOf(
        TokenValidationError,
      );
    });
  });
});
