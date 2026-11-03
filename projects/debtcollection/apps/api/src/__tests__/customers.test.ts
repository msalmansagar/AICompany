import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, type MockedFunction } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, makeAuthAdapter, makeUserClaims, TEST_CORRELATION_ID } from './test-app.js';
import { TokenValidationError } from '@dcp/auth-adapters';
import { CORRELATION_ID_HEADER, VIEW_SENSITIVE_PII_CLAIM } from '@dcp/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CUSTOMER_RECORD = {
  msst_dcpcustomerid: 'cust-uuid-001',
  msst_qid: 'QAT-001',
  msst_fullname: 'Ahmad Al-Kuwari',
  msst_stopcontact: false,
  msst_mobile: '+974 5555 0001',
  msst_email: 'ahmad@example.com',
  msst_address: 'Doha, Qatar',
};

const NOT_FOUND_STATUS = 404;

// Shared fetch mock for Dataverse calls
let fetchMock: MockedFunction<typeof fetch>;

vi.stubGlobal('fetch', vi.fn());

describe('GET /customers/:qid', () => {
  let app: FastifyInstance;
  const authAdapter = makeAuthAdapter();

  beforeAll(async () => {
    app = await buildTestApp(authAdapter);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fetchMock = fetch as MockedFunction<typeof fetch>;
    fetchMock.mockReset();
    vi.mocked(authAdapter.validateUserToken).mockReset();
  });

  // ---------------------------------------------------------------------------
  // Auth failure
  // ---------------------------------------------------------------------------

  it('should_return_401_when_authorization_header_is_missing', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/customers/QAT-001',
    });

    expect(response.statusCode).toBe(401);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('unauthorized');
  });

  it('should_return_401_when_token_is_invalid', async () => {
    vi.mocked(authAdapter.validateUserToken).mockRejectedValueOnce(
      new TokenValidationError('expired'),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/customers/QAT-001',
      headers: { authorization: 'Bearer bad-token' },
    });

    expect(response.statusCode).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // Happy path — PII masked
  // ---------------------------------------------------------------------------

  it('should_return_customer_with_pii_masked_for_unprivileged_caller', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(
      makeUserClaims({ hasViewSensitivePii: false }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(CUSTOMER_RECORD), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/customers/QAT-001',
      headers: {
        authorization: 'Bearer valid-token',
        [CORRELATION_ID_HEADER]: TEST_CORRELATION_ID,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body['msst_fullname']).toBe('Ahmad Al-Kuwari');
    // PII fields must be absent
    expect(body['msst_mobile']).toBeUndefined();
    expect(body['msst_email']).toBeUndefined();
    expect(body['msst_address']).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Happy path — PII visible
  // ---------------------------------------------------------------------------

  it('should_return_full_customer_including_pii_for_privileged_caller', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(
      makeUserClaims({ hasViewSensitivePii: true, roles: [VIEW_SENSITIVE_PII_CLAIM] }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(CUSTOMER_RECORD), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/customers/QAT-001',
      headers: { authorization: 'Bearer privileged-token' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body['msst_mobile']).toBe('+974 5555 0001');
    expect(body['msst_email']).toBe('ahmad@example.com');
    expect(body['msst_address']).toBe('Doha, Qatar');
  });

  // ---------------------------------------------------------------------------
  // Not found
  // ---------------------------------------------------------------------------

  it('should_return_404_when_customer_qid_does_not_exist', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(makeUserClaims());
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }));

    const response = await app.inject({
      method: 'GET',
      url: '/customers/UNKNOWN',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(NOT_FOUND_STATUS);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('customer_not_found');
  });

  // ---------------------------------------------------------------------------
  // Validation failure
  // ---------------------------------------------------------------------------

  it('should_return_422_when_qid_param_is_empty', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(makeUserClaims());

    const response = await app.inject({
      method: 'GET',
      url: '/customers/%20', // URL-encoded space → empty after trim
      headers: { authorization: 'Bearer valid-token' },
    });

    // Fastify returns 404 for param-regex failures or 422 for zod — either is acceptable.
    expect([404, 422]).toContain(response.statusCode);
  });

  // ---------------------------------------------------------------------------
  // Correlation ID echoed
  // ---------------------------------------------------------------------------

  it('should_echo_correlation_id_in_response_header', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(makeUserClaims());
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(CUSTOMER_RECORD), { status: 200 }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/customers/QAT-001',
      headers: {
        authorization: 'Bearer valid-token',
        [CORRELATION_ID_HEADER]: TEST_CORRELATION_ID,
      },
    });

    expect(response.headers[CORRELATION_ID_HEADER]).toBe(TEST_CORRELATION_ID);
  });

  // ---------------------------------------------------------------------------
  // BFD refused when flag is off
  // ---------------------------------------------------------------------------

  it('should_return_403_when_bfd_org_is_requested_and_flag_is_off', async () => {
    vi.mocked(authAdapter.validateUserToken).mockResolvedValueOnce(makeUserClaims());

    const response = await app.inject({
      method: 'GET',
      url: '/customers/QAT-001?org=BFD',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json<{ code: string }>();
    expect(body.code).toBe('bfd_disabled');
  });
});
