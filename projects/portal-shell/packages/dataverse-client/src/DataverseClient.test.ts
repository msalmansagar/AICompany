// RED → GREEN → REFACTOR — DataverseClient unit tests
// Uses vi.fn() to intercept global fetch so no real network call is made.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataverseClient } from './DataverseClient.js';
import { DataverseError, DataverseNotFoundError } from './DataverseError.js';

const ORG_URL = 'https://org5869857f.crm4.dynamics.com';
const ACCESS_TOKEN = 'msal-access-token';

function makeClient(): DataverseClient {
  return new DataverseClient({
    orgUrl: ORG_URL,
    getAccessToken: async () => ACCESS_TOKEN,
  });
}

function mockFetchOk(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status,
      json: async () => body,
    }),
  );
}

function mockFetchError(status: number, odataCode: string, message: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: { code: odataCode, message } }),
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// getList
// ---------------------------------------------------------------------------

describe('DataverseClient.getList', () => {
  it('should_return_list_result_when_dataverse_responds_ok', async () => {
    const payload = { value: [{ qdb_name: 'Portal A' }], '@odata.count': 1 };
    mockFetchOk(payload);

    const client = makeClient();
    const result = await client.getList<{ qdb_name: string }>('qdb_portal_configs', {
      select: ['qdb_name'],
      top: 10,
    });

    expect(result.value).toHaveLength(1);
    expect(result.value[0]?.qdb_name).toBe('Portal A');
  });

  it('should_include_correct_odata_headers_in_request', async () => {
    mockFetchOk({ value: [] });

    const client = makeClient();
    await client.getList('qdb_portal_configs');

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;

    expect(headers['OData-MaxVersion']).toBe('4.0');
    expect(headers['Prefer']).toBe('odata.include-annotations="*"');
    expect(headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('should_propagate_correlation_id_header_when_provided', async () => {
    mockFetchOk({ value: [] });

    const client = makeClient();
    await client.getList('qdb_portal_configs', {}, { correlationId: 'test-corr-123' });

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const headers = (call[1] as RequestInit).headers as Record<string, string>;

    expect(headers['x-correlation-id']).toBe('test-corr-123');
  });
});

// ---------------------------------------------------------------------------
// getById
// ---------------------------------------------------------------------------

describe('DataverseClient.getById', () => {
  it('should_return_single_record_when_found', async () => {
    const record = { qdb_portal_configid: 'abc-123', qdb_name: 'Main Portal' };
    mockFetchOk(record);

    const client = makeClient();
    const result = await client.getById<typeof record>('qdb_portal_configs', 'abc-123');

    expect(result.qdb_name).toBe('Main Portal');
  });

  it('should_throw_DataverseNotFoundError_when_record_missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: { code: '0x80040217', message: 'Record does not exist' } }),
      }),
    );

    const client = makeClient();
    await expect(
      client.getById('qdb_portal_configs', 'missing-id'),
    ).rejects.toBeInstanceOf(DataverseNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

describe('DataverseClient.create', () => {
  it('should_post_json_body_and_return_created_record', async () => {
    const created = { qdb_portal_configid: 'new-id', qdb_name: 'New Portal' };
    mockFetchOk(created, 201);

    const client = makeClient();
    const result = await client.create<typeof created>('qdb_portal_configs', {
      qdb_name: 'New Portal',
    });

    expect(result.qdb_portal_configid).toBe('new-id');
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('DataverseClient.update', () => {
  it('should_send_patch_request_and_resolve_without_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => undefined }),
    );

    const client = makeClient();
    await expect(
      client.update('qdb_portal_configs', 'abc-123', { qdb_name: 'Updated' }),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('DataverseClient.delete', () => {
  it('should_send_delete_request_and_resolve_without_error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => undefined }),
    );

    const client = makeClient();
    await expect(
      client.delete('qdb_portal_configs', 'abc-123'),
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe('DataverseClient error handling', () => {
  it('should_throw_DataverseError_with_odata_code_on_4xx', async () => {
    mockFetchError(400, 'bad_request_code', 'Invalid query');

    const client = makeClient();
    const error = await client.getList('qdb_portal_configs').catch((e) => e);

    expect(error).toBeInstanceOf(DataverseError);
    expect((error as DataverseError).odataCode).toBe('bad_request_code');
    expect((error as DataverseError).httpStatus).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// executeBatch
// ---------------------------------------------------------------------------

const VER_ID_OLD = '22222222-2222-2222-2222-222222222222';
const VER_ID_NEW = '33333333-3333-3333-3333-333333333333';

function makeBatchSuccessResponse(): string {
  return [
    '--batchresponse_r1',
    'Content-Type: multipart/mixed; boundary=changesetresponse_r1',
    '',
    '--changesetresponse_r1',
    'Content-Type: application/http',
    'Content-Transfer-Encoding: binary',
    '',
    'HTTP/1.1 204 No Content',
    '',
    '--changesetresponse_r1',
    'Content-Type: application/http',
    'Content-Transfer-Encoding: binary',
    '',
    'HTTP/1.1 204 No Content',
    '',
    '--changesetresponse_r1--',
    '--batchresponse_r1--',
  ].join('\r\n');
}

function makeBatchErrorResponse(status: number, code: string, message: string): string {
  return [
    '--batchresponse_r1',
    'Content-Type: multipart/mixed; boundary=changesetresponse_r1',
    '',
    '--changesetresponse_r1',
    'Content-Type: application/http',
    'Content-Transfer-Encoding: binary',
    '',
    `HTTP/1.1 ${status} Error`,
    'Content-Type: application/json',
    '',
    JSON.stringify({ error: { code, message } }),
    '--changesetresponse_r1--',
    '--batchresponse_r1--',
  ].join('\r\n');
}

describe('DataverseClient.executeBatch', () => {
  it('should_return_immediately_when_operations_array_is_empty', async () => {
    const client = makeClient();
    // No fetch stub — a call to fetch would throw; verifies no network call occurs
    await expect(client.executeBatch([])).resolves.toBeUndefined();
  });

  it('should_resolve_when_all_batch_operations_return_204', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => makeBatchSuccessResponse(),
      }),
    );

    const client = makeClient();
    await expect(
      client.executeBatch([
        { method: 'PATCH', entity: 'qdb_component_versionses', id: VER_ID_OLD, body: { qdb_islatest: false } },
        { method: 'PATCH', entity: 'qdb_component_versionses', id: VER_ID_NEW, body: { qdb_islatest: true } },
      ]),
    ).resolves.toBeUndefined();
  });

  it('should_throw_DataverseError_when_changeset_contains_error_response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => makeBatchErrorResponse(400, '0x80040220', 'Record does not exist'),
      }),
    );

    const client = makeClient();
    const error = await client
      .executeBatch([
        { method: 'PATCH', entity: 'qdb_component_versionses', id: VER_ID_OLD, body: { qdb_islatest: false } },
      ])
      .catch((e) => e);

    expect(error).toBeInstanceOf(DataverseError);
    expect((error as DataverseError).httpStatus).toBe(400);
    expect((error as DataverseError).odataCode).toBe('0x80040220');
  });

  it('should_send_multipart_mixed_content_type_with_batch_boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => makeBatchSuccessResponse(),
      }),
    );

    const client = makeClient();
    await client.executeBatch([
      { method: 'PATCH', entity: 'qdb_component_versionses', id: VER_ID_OLD, body: { qdb_islatest: false } },
    ]);

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;

    expect(headers['Content-Type']).toMatch(/^multipart\/mixed;boundary=batch_/);
  });

  it('should_include_both_patch_operations_in_request_body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => makeBatchSuccessResponse(),
      }),
    );

    const client = makeClient();
    await client.executeBatch([
      { method: 'PATCH', entity: 'qdb_component_versionses', id: VER_ID_OLD, body: { qdb_islatest: false } },
      { method: 'PATCH', entity: 'qdb_component_versionses', id: VER_ID_NEW, body: { qdb_islatest: true } },
    ]);

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const body = (call[1] as RequestInit).body as string;

    expect(body).toContain(VER_ID_OLD);
    expect(body).toContain(VER_ID_NEW);
    expect(body).toContain('"qdb_islatest":false');
    expect(body).toContain('"qdb_islatest":true');
  });
});
