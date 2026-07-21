import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmFileService } from './CrmFileService.js';

const mockAuthService = { getAccessToken: vi.fn().mockResolvedValue('mock-token') } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

function crmJson(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(''),
    headers: { get: () => null },
  });
}

describe('CrmFileService.downloadFromCrmNotes', () => {
  let service: CrmFileService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CrmFileService(mockAuthService);
  });

  it('decodes_the_base64_document_body_and_returns_name_and_type', async () => {
    const original = 'Hello, document.';
    mockFetch.mockReturnValue(crmJson({
      documentbody: Buffer.from(original, 'utf-8').toString('base64'),
      filename: 'proof.pdf',
      mimetype: 'application/pdf',
    }));

    const result = await service.downloadFromCrmNotes('11111111-1111-1111-1111-111111111111');

    expect(result.content.toString('utf-8')).toBe(original);
    expect(result.fileName).toBe('proof.pdf');
    expect(result.mimeType).toBe('application/pdf');
  });

  it('requests_only_the_needed_annotation_columns', async () => {
    mockFetch.mockReturnValue(crmJson({ documentbody: '', filename: 'x', mimetype: 'text/plain' }));
    await service.downloadFromCrmNotes('abc-123');
    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain('/annotations(abc-123)');
    expect(url).toContain('$select=documentbody,filename,mimetype');
  });

  it('falls_back_to_safe_defaults_when_fields_are_missing', async () => {
    mockFetch.mockReturnValue(crmJson({}));
    const result = await service.downloadFromCrmNotes('missing');
    expect(result.content.length).toBe(0);
    expect(result.fileName).toBe('download');
    expect(result.mimeType).toBe('application/octet-stream');
  });
});
