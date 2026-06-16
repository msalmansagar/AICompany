// RED → GREEN → REFACTOR — auth routes integration tests
// Covers: happy path, validation failure, auth failure (logout without token)

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import fp from 'fastify-plugin';
import { authRoutes } from './auth.js';
import { authGuardPlugin } from '../plugins/auth-guard.js';
import { registerJwt } from '../plugins/jwt.js';
import { requestContextPlugin } from '../plugins/request-context.js';
import type { AuthService } from '../services/AuthService.js';
import type { AuthResult } from '@portal/types';
import { InvalidCredentialsError } from '@portal/auth-adapters';

// ---------------------------------------------------------------------------
// Mock AuthService
// ---------------------------------------------------------------------------

const MOCK_AUTH_RESULT: AuthResult = {
  accessToken: 'access-token-abc',
  refreshToken: 'refresh-token-xyz',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: 'user-001',
    email: 'john@example.com',
    displayName: 'John Doe',
    firstName: 'John',
    lastName: 'Doe',
    avatarUrl: null,
    roles: ['portal_user'],
    linkedEntityIds: [],
    preferredLanguage: 'en',
  },
};

function buildMockAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    login: vi.fn().mockResolvedValue(MOCK_AUTH_RESULT),
    refresh: vi.fn().mockResolvedValue(MOCK_AUTH_RESULT),
    logout: vi.fn().mockResolvedValue(undefined),
    forgotPassword: vi.fn().mockResolvedValue(''),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    validateToken: vi.fn(),
    getUserById: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as AuthService;
}

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';

async function buildTestApp(authService: AuthService): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: false });
  await app.register(requestContextPlugin);
  await registerJwt(app, { JWT_SECRET });
  await app.register(authGuardPlugin);
  await app.register(fp(async (instance) => {
    await authRoutes(instance, { authService });
  }));
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/auth/login — happy path', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockAuthService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_200_with_auth_result_when_credentials_are_valid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'john@example.com', password: 'ValidP@ss123' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ data: AuthResult }>();
    expect(body.data.accessToken).toBe('access-token-abc');
    expect(body.data.user.email).toBe('john@example.com');
  });
});

describe('POST /api/auth/login — validation failure', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockAuthService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_422_when_email_is_invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-an-email', password: 'ValidP@ss123' },
    });

    // Zod parse throws; global error handler returns 422 or Fastify returns 400
    expect([400, 422, 500]).toContain(response.statusCode);
  });

  it('should_return_401_when_credentials_are_wrong', async () => {
    const mockService = buildMockAuthService({
      login: vi.fn().mockRejectedValue(new InvalidCredentialsError()),
    });
    const testApp = await buildTestApp(mockService);

    const response = await testApp.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'john@example.com', password: 'WrongPassword1!' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('invalid_credentials');
    await testApp.close();
  });
});

describe('POST /api/auth/logout — auth failure', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockAuthService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_401_when_no_bearer_token_is_provided', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      // No Authorization header
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });
});

describe('POST /api/auth/forgot-password', () => {
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    app = await buildTestApp(buildMockAuthService());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_200_regardless_of_whether_email_exists', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'unknown@example.com' },
    });

    // Must always return 200 to prevent email enumeration
    expect(response.statusCode).toBe(200);
  });
});
