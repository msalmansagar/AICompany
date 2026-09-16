/**
 * Test helpers for building the Fastify app with mock dependencies.
 * Used by all route tests to avoid real network calls.
 */
import { vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { IAuthAdapter, UserClaims } from '@dcp/auth-adapters';
import type { AppConfig } from '../config.js';

export const TEST_CORRELATION_ID = 'test-corr-id-00000000';

export function makeTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    PORT: 3100,
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    DV_DATAVERSE_URL: 'https://hl-crm.example.com',
    DV_TENANT_ID: 'tenant-id',
    DV_CLIENT_ID: 'client-id',
    DV_CLIENT_SECRET: 'client-secret',
    DV_SCOPE: 'https://hl-crm/.default',
    FEATURE_BFD: false,
    AUTH_PROVIDER: 'adfs',
    AUTH_ISSUER_URL: 'https://adfs.example.com/adfs',
    ...overrides,
  };
}

export function makeUserClaims(overrides: Partial<UserClaims> = {}): UserClaims {
  return {
    sub: 'test-user-001',
    email: 'officer@example.com',
    roles: ['Collection Officer'],
    hasViewSensitivePii: false,
    ...overrides,
  };
}

export function makeAuthAdapter(claims: UserClaims = makeUserClaims()): IAuthAdapter {
  return {
    validateUserToken: vi.fn(async (_jwt: string) => claims),
    getServiceToken: vi.fn(async () => 'mock-service-token'),
  };
}

export async function buildTestApp(
  authAdapter: IAuthAdapter,
  configOverrides: Partial<AppConfig> = {},
): Promise<FastifyInstance> {
  const config = makeTestConfig(configOverrides);
  const app = await buildApp(config, { authAdapter });
  await app.ready();
  return app;
}
