import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, type MockedFunction } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, makeAuthAdapter, makeUserClaims } from './test-app.js';
import { TokenValidationError } from '@dcp/auth-adapters';

const EXCEPTION_RECORDS = [
  {
    msst_dcpidentityexceptionid: 'exc-uuid-001',
    msst_qid: undefined,
    msst_reason: 'missing',
    msst_status: 'open',
  },
  {
    msst_dcpidentityexceptionid: 'exc-uuid-002',
    msst_qid: 'QAT-DUP',
    msst_reason: 'duplicate',
    msst_status: 'open',
  },
];

vi.stubGlobal('fetch', vi.fn());

describe('GET /identity-exceptions', () => {
  let app: FastifyInstance;
  const authAdapter = makeAuthAdapter();

  beforeAll(async () => {
    app = await buildTestApp(authAdapter);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    const fetchMock = fetch as MockedFunction<typeof fetch>;
    fetchMock.mockReset();
    vi.mocked(authAdapter.validateUserToken).mockReset();
  });

  // ---------------------------------------------------------------------------
  // Auth failure
  // ---------------------------------------------------------------------------

  it('should_return_401_when_no_authorization_header_provided', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/identity-exceptions',
    });

    expect(response.statusCode).toBe(401);
  });

  it('should_return_401_when_bearer_token_is_invalid', async () => {
    vi.mocked(authAdapter.validateUserToken).mockRejectedValueOnce(
      new TokenValidationError('expired'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/identity-exceptions',
      headers: { authorization: 'Bearer invalid' },
    });

    expect(response.statusCode).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Happy path
  // ---------------------------------------------------------------------------

  it('should_return_exception_list_for_authenticated_caller', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(makeUserClaims());
    const fetchMock = fetch as MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ value: EXCEPTION_RECORDS }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/identity-exceptions',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ value: unknown[] }>();
    expect(body.value).toHaveLength(2);
  });

  it('should_return_empty_list_when_no_exceptions_exist', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(makeUserClaims());
    const fetchMock = fetch as MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/identity-exceptions',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ value: unknown[] }>().value).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Dataverse unavailable
  // ---------------------------------------------------------------------------

  it('should_return_503_when_dataverse_is_unreachable', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(makeUserClaims());
    const fetchMock = fetch as MockedFunction<typeof fetch>;
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));

    const response = await app.inject({
      method: 'GET',
      url: '/identity-exceptions',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json<{ code: string }>().code).toBe('dataverse_unavailable');
  });

  // ---------------------------------------------------------------------------
  // BFD refused when flag off
  // ---------------------------------------------------------------------------

  it('should_return_403_when_bfd_org_requested_and_flag_is_off', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(makeUserClaims());

    const response = await app.inject({
      method: 'GET',
      url: '/identity-exceptions?org=BFD',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json<{ code: string }>().code).toBe('bfd_disabled');
  });
});
