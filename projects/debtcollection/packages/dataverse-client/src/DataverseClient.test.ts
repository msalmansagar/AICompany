import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { DataverseClient } from './DataverseClient.js';
import { CrmApiError, CrmNotFoundError, CrmAuthError } from './CrmApiError.js';
import type { OrgTarget } from '@dcp/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const HL_ORG: OrgTarget = {
  orgKey: 'HL',
  baseUrl: 'https://hl-crm.example.com',
  apiVersion: '9.2',
};

const mockGetAccessToken = vi.fn<(orgKey: string) => Promise<string>>(
  async () => 'test-bearer-token',
);

function buildClient(): DataverseClient {
  return new DataverseClient({ org: HL_ORG, getAccessToken: mockGetAccessToken });
}

function mockFetchResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const responseBody = body !== null ? JSON.stringify(body) : null;
  return new Response(responseBody, {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DataverseClient', () => {
  let fetchSpy: MockedFunction<typeof fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch') as MockedFunction<typeof fetch>;
    fetchSpy.mockReset();
    mockGetAccessToken.mockClear();
  });

  describe('getList', () => {
    it('should_return_records_when_dataverse_responds_200', async () => {
      const records = [{ msst_dcpcustomerid: 'abc', msst_qid: 'QAT-001' }];
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse(200, { value: records }),
      );

      const client = buildClient();
      const result = await client.getList('msst_dcpcustomers');

      expect(result.value).toHaveLength(1);
      expect(result.value[0]).toMatchObject({ msst_qid: 'QAT-001' });
    });

    it('should_include_authorization_header_in_every_request', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, { value: [] }));

      const client = buildClient();
      await client.getList('msst_dcpcustomers');

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/api/data/v9.2/msst_dcpcustomers');
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer test-bearer-token');
    });

    it('should_propagate_correlation_id_header_to_crm', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, { value: [] }));

      const client = buildClient();
      await client.getList('msst_dcpcustomers', {}, { correlationId: 'corr-123' });

      const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers['x-correlation-id']).toBe('corr-123');
    });
  });

  describe('getByAlternateKey', () => {
    it('should_build_correct_alternate_key_url', async () => {
      const record = { msst_dcpcustomerid: 'uuid-1', msst_qid: 'QAT-001' };
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(200, record));

      const client = buildClient();
      const result = await client.getByAlternateKey<typeof record>(
        'msst_dcpcustomers',
        'msst_qid',
        'QAT-001',
      );

      expect(result.msst_qid).toBe('QAT-001');
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toContain("msst_dcpcustomers(msst_qid='QAT-001')");
    });

    it('should_throw_CrmNotFoundError_when_record_missing', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(404, {}));

      const client = buildClient();
      await expect(
        client.getByAlternateKey('msst_dcpcustomers', 'msst_qid', 'NOT-FOUND'),
      ).rejects.toBeInstanceOf(CrmNotFoundError);
    });
  });

  describe('create', () => {
    it('should_return_id_parsed_from_OData_EntityId_header_on_204', async () => {
      const entityId = 'https://hl-crm.example.com/api/data/v9.2/msst_dcpcustomers(new-guid-001)';
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse(204, null, { 'OData-EntityId': entityId }),
      );

      const client = buildClient();
      const result = await client.create('msst_dcpcustomers', { msst_qid: 'QAT-002' });

      expect(result).toEqual({ id: 'new-guid-001' });
    });

    it('should_throw_CrmApiError_when_204_but_OData_EntityId_header_is_absent', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(204, null));

      const client = buildClient();
      const error = await client
        .create('msst_dcpcustomers', { msst_qid: 'QAT-003' })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CrmApiError);
      const crmError = error as CrmApiError;
      expect(crmError.odataCode).toBe('missing_entity_id_header');
    });

    it('should_not_issue_a_follow_up_GET_after_successful_create', async () => {
      const entityId = 'https://hl-crm.example.com/api/data/v9.2/msst_dcpcustomers(no-get-guid)';
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse(204, null, { 'OData-EntityId': entityId }),
      );

      const client = buildClient();
      await client.create('msst_dcpcustomers', { msst_qid: 'QAT-004' });

      expect(fetchSpy).toHaveBeenCalledOnce();
    });
  });

  describe('retry behaviour', () => {
    it('should_retry_on_429_and_succeed_on_second_attempt', async () => {
      fetchSpy
        .mockResolvedValueOnce(mockFetchResponse(429, {}))
        .mockResolvedValueOnce(mockFetchResponse(200, { value: [] }));

      const client = buildClient();
      const result = await client.getList('msst_dcpcustomers');

      expect(result.value).toHaveLength(0);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('should_throw_CrmApiError_after_exhausting_retries', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(429, {}));

      const client = buildClient();
      await expect(client.getList('msst_dcpcustomers')).rejects.toBeInstanceOf(CrmApiError);
    });
  });

  describe('error handling', () => {
    it('should_throw_CrmAuthError_on_401', async () => {
      fetchSpy.mockResolvedValueOnce(mockFetchResponse(401, {}));

      const client = buildClient();
      await expect(client.getList('msst_dcpcustomers')).rejects.toBeInstanceOf(CrmAuthError);
    });

    it('should_throw_CrmApiError_with_odata_code_on_400', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockFetchResponse(400, {
          error: { code: '0x80060888', message: 'Invalid request' },
        }),
      );

      const client = buildClient();
      const error = await client.getList('msst_dcpcustomers').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CrmApiError);
      const crmError = error as CrmApiError;
      expect(crmError.odataCode).toBe('0x80060888');
    });
  });
});
