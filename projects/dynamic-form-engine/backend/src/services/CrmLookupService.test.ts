import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmLookupService } from './CrmLookupService.js';

const mockAuthService = { getAccessToken: vi.fn().mockResolvedValue('mock-token') } as never;
const mockFetch = vi.fn();
global.fetch = mockFetch;

function okEmpty() {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ value: [] }),
    text: () => Promise.resolve(''),
    headers: { get: () => null },
  });
}

describe('CrmLookupService.searchLookup active-record filter', () => {
  let service: CrmLookupService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CrmLookupService(mockAuthService);
  });

  it('default_entity_filters_by_statecode', async () => {
    mockFetch.mockImplementation(okEmpty);
    await service.searchLookup({ entityLogicalName: 'contact', displayAttribute: 'fullname', maxResults: 10 });
    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(url).toContain('statecode eq 0');
  });

  it('systemuser_filters_by_isdisabled_not_statecode', async () => {
    // Regression: systemuser has no statecode column (Dataverse 0x80060888).
    mockFetch.mockImplementation(okEmpty);
    await service.searchLookup({ entityLogicalName: 'systemuser', displayAttribute: 'fullname', maxResults: 10 });
    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(url).toContain('isdisabled eq false');
    expect(url).not.toContain('statecode');
  });

  it('team_omits_active_filter_entirely', async () => {
    mockFetch.mockImplementation(okEmpty);
    await service.searchLookup({ entityLogicalName: 'team', displayAttribute: 'name', maxResults: 10 });
    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(url).not.toContain('statecode');
    expect(url).not.toContain('isdisabled');
    expect(url).not.toContain('$filter=&');
  });
});
