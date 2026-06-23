// RED → GREEN → REFACTOR — CustomCredentialAdapter unit tests

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomCredentialAdapter } from './CustomCredentialAdapter.js';
import { InvalidCredentialsError, TokenValidationError } from '../errors.js';
import type { CustomCredentialConfig } from '../AuthAdapterConfig.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@portal/dataverse-client', () => ({
  DataverseClient: vi.fn().mockImplementation(() => ({
    getList: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  })),
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

import bcrypt from 'bcryptjs';
import { DataverseClient } from '@portal/dataverse-client';

// ---------------------------------------------------------------------------
// Test fixture
// ---------------------------------------------------------------------------

const TEST_CONFIG: CustomCredentialConfig = {
  jwtSecret: 'super-secret-key-that-is-32-chars-long!!',
  dataverseOrgUrl: 'https://org.crm.dynamics.com',
  dataverseGetAccessToken: async () => 'access-token',
  accessTokenTtlSeconds: 3600,
  refreshTokenTtlSeconds: 86400,
  resetTokenTtlSeconds: 900,
};

const MOCK_DATAVERSE_USER = {
  qdb_portal_userid: 'user-guid-001',
  qdb_email: 'john@example.com',
  qdb_password_hash: '$2b$12$hashedpassword',
  qdb_first_name: 'John',
  qdb_last_name: 'Doe',
  qdb_display_name: 'John Doe',
  qdb_avatar_url: null,
  qdb_roles: '["portal_user"]',
  qdb_linked_entity_ids: '["entity-001"]',
  qdb_preferred_language: 'en' as const,
};

function getDataverseClientMock(): {
  getList: ReturnType<typeof vi.fn>;
  getById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
} {
  const MockClass = vi.mocked(DataverseClient);
  return MockClass.mock.results[MockClass.mock.results.length - 1]?.value as ReturnType<typeof getDataverseClientMock>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CustomCredentialAdapter.authenticateWithCredentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should_return_auth_result_when_credentials_are_valid', async () => {
    const dvMock = { getList: vi.fn().mockResolvedValue({ value: [MOCK_DATAVERSE_USER] }), getById: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.mocked(DataverseClient).mockImplementation(() => dvMock as unknown as DataverseClient);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const adapter = new CustomCredentialAdapter(TEST_CONFIG);
    const result = await adapter.authenticateWithCredentials('john@example.com', 'ValidP@ss1234');

    expect(result.accessToken).toBeTruthy();
    expect(result.user.email).toBe('john@example.com');
    expect(result.user.roles).toContain('portal_user');
  });

  it('should_throw_InvalidCredentialsError_when_user_not_found', async () => {
    const dvMock = { getList: vi.fn().mockResolvedValue({ value: [] }), getById: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.mocked(DataverseClient).mockImplementation(() => dvMock as unknown as DataverseClient);

    const adapter = new CustomCredentialAdapter(TEST_CONFIG);
    await expect(
      adapter.authenticateWithCredentials('nobody@example.com', 'password'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('should_throw_InvalidCredentialsError_when_password_does_not_match', async () => {
    const dvMock = { getList: vi.fn().mockResolvedValue({ value: [MOCK_DATAVERSE_USER] }), getById: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.mocked(DataverseClient).mockImplementation(() => dvMock as unknown as DataverseClient);
    vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

    const adapter = new CustomCredentialAdapter(TEST_CONFIG);
    await expect(
      adapter.authenticateWithCredentials('john@example.com', 'WrongPassword'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe('CustomCredentialAdapter.validateToken', () => {
  it('should_return_token_claims_when_token_is_valid', async () => {
    const dvMock = { getList: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.mocked(DataverseClient).mockImplementation(() => dvMock as unknown as DataverseClient);
    vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

    // Issue a real token then validate it
    const dvGetListMock = vi.fn().mockResolvedValue({ value: [MOCK_DATAVERSE_USER] });
    const dvMockFull = { getList: dvGetListMock, getById: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.mocked(DataverseClient).mockImplementation(() => dvMockFull as unknown as DataverseClient);

    const adapter = new CustomCredentialAdapter(TEST_CONFIG);
    const authResult = await adapter.authenticateWithCredentials('john@example.com', 'pass');
    const claims = await adapter.validateToken(authResult.accessToken);

    expect(claims.sub).toBe('user-guid-001');
    expect(claims.email).toBe('john@example.com');
  });

  it('should_throw_TokenValidationError_when_token_is_malformed', async () => {
    const dvMock = { getList: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.mocked(DataverseClient).mockImplementation(() => dvMock as unknown as DataverseClient);

    const adapter = new CustomCredentialAdapter(TEST_CONFIG);
    await expect(
      adapter.validateToken('not.a.valid.jwt.at.all'),
    ).rejects.toBeInstanceOf(TokenValidationError);
  });
});

describe('CustomCredentialAdapter.getUserByEmail', () => {
  it('should_return_null_when_user_does_not_exist', async () => {
    const dvMock = { getList: vi.fn().mockResolvedValue({ value: [] }), getById: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.mocked(DataverseClient).mockImplementation(() => dvMock as unknown as DataverseClient);

    const adapter = new CustomCredentialAdapter(TEST_CONFIG);
    const result = await adapter.getUserByEmail('unknown@example.com');

    expect(result).toBeNull();
  });

  it('should_return_user_profile_when_found', async () => {
    const dvMock = { getList: vi.fn().mockResolvedValue({ value: [MOCK_DATAVERSE_USER] }), getById: vi.fn(), create: vi.fn(), update: vi.fn() };
    vi.mocked(DataverseClient).mockImplementation(() => dvMock as unknown as DataverseClient);

    const adapter = new CustomCredentialAdapter(TEST_CONFIG);
    const result = await adapter.getUserByEmail('john@example.com');

    expect(result?.email).toBe('john@example.com');
    expect(result?.linkedEntityIds).toContain('entity-001');
  });
});
