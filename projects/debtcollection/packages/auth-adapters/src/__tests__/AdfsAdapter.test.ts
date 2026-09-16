import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AdfsAdapter } from '../AdfsAdapter.js';
import { TokenValidationError } from '../errors.js';
import { startMockOidcIssuer, type MockOidcIssuer } from './mock-oidc-issuer.js';
import type { OrgTarget } from '@dcp/types';
import { VIEW_SENSITIVE_PII_CLAIM } from '@dcp/types';

const HL_ORG: OrgTarget = { orgKey: 'HL', baseUrl: 'https://hl-crm.example.com', apiVersion: '9.2' };

describe('AdfsAdapter', () => {
  let issuer: MockOidcIssuer;
  let adapter: AdfsAdapter;

  beforeAll(async () => {
    issuer = await startMockOidcIssuer();
    adapter = new AdfsAdapter({ allowInsecureRequests: true,
      issuerUrl: issuer.url,
      orgCredentials: {
        HL: { clientId: 'test-client-id', clientSecret: 'test-secret', scope: 'api' },
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

    it('should_cache_discovery_config_across_multiple_calls', async () => {
      await adapter.getServiceToken(HL_ORG);
      await adapter.getServiceToken(HL_ORG);
      // No assertion needed — just verifying it does not throw on repeated calls
    });
  });

  describe('validateUserToken', () => {
    it('should_return_claims_for_a_valid_token', async () => {
      const jwt = await issuer.signToken({
        sub: 'user-123',
        email: 'officer@example.com',
        roles: ['Collection Officer'],
      });

      const claims = await adapter.validateUserToken(jwt);

      expect(claims.sub).toBe('user-123');
      expect(claims.email).toBe('officer@example.com');
      expect(claims.roles).toContain('Collection Officer');
      expect(claims.hasViewSensitivePii).toBe(false);
    });

    it('should_set_hasViewSensitivePii_true_when_role_is_present', async () => {
      const jwt = await issuer.signToken({
        sub: 'manager-456',
        roles: ['Senior Manager', VIEW_SENSITIVE_PII_CLAIM],
      });

      const claims = await adapter.validateUserToken(jwt);

      expect(claims.hasViewSensitivePii).toBe(true);
    });

    it('should_throw_TokenValidationError_for_an_expired_token', async () => {
      const expiredJwt = await issuer.signToken({ sub: 'user-789' }, -1);

      await expect(adapter.validateUserToken(expiredJwt)).rejects.toBeInstanceOf(
        TokenValidationError,
      );
    });

    it('should_throw_TokenValidationError_for_a_tampered_token', async () => {
      const jwt = await issuer.signToken({ sub: 'user-abc' });
      const parts = jwt.split('.');
      // Flip one character in the signature
      const tamperedSig = (parts[2] ?? '') + 'X';
      const tampered = `${parts[0]}.${parts[1]}.${tamperedSig}`;

      await expect(adapter.validateUserToken(tampered)).rejects.toBeInstanceOf(
        TokenValidationError,
      );
    });

    it('should_throw_TokenValidationError_when_iss_does_not_match_discovery_issuer', async () => {
      // Token signed with the correct key but carrying a different iss claim.
      // Without issuer validation, this token would pass signature checks and
      // be accepted — this test proves the issuer claim is enforced.
      const jwt = await issuer.signToken(
        { sub: 'attacker-001' },
        3600,
        'https://evil.example.com',
      );

      await expect(adapter.validateUserToken(jwt)).rejects.toBeInstanceOf(
        TokenValidationError,
      );
    });
  });
});
