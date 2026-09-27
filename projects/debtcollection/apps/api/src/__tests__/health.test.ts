import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, makeAuthAdapter, TEST_CORRELATION_ID } from './test-app.js';
import { CORRELATION_ID_HEADER } from '@dcp/types';

// Mock fetch so health probes do not make real network calls
vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })));

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp(makeAuthAdapter());
  });

  afterAll(async () => {
    await app.close();
  });

  it('should_return_200_with_status_ok_and_version', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; timestamp: string; orgs: unknown }>();
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
    expect(body.orgs).toBeDefined();
  });

  it('should_not_require_authorization', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      // Intentionally no Authorization header
    });

    expect(response.statusCode).not.toBe(401);
  });

  it('should_report_bfd_as_disabled_when_feature_flag_is_off', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    const body = response.json<{ orgs: { BFD: { status: string } } }>();

    expect(body.orgs.BFD.status).toBe('disabled');
  });

  it('should_echo_incoming_correlation_id_in_response_headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { [CORRELATION_ID_HEADER]: TEST_CORRELATION_ID },
    });

    expect(response.headers[CORRELATION_ID_HEADER]).toBe(TEST_CORRELATION_ID);
  });

  it('should_generate_correlation_id_when_header_is_absent', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    const correlationId = response.headers[CORRELATION_ID_HEADER];
    expect(typeof correlationId).toBe('string');
    expect((correlationId as string).length).toBeGreaterThan(0);
  });
});
