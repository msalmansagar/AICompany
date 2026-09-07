import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmLookupService } from './CrmLookupService.js';

const mockAuthService = { getAccessToken: vi.fn().mockResolvedValue('mock-token') } as never;
const mockFetch = vi.fn();
// The lookup resolves the entity-set name from metadata before querying — the Web API
// addresses records by set name, which is not the logical name plus "s". Answering that
// call here keeps every assertion below aimed at the search request itself.
function metadataResponse(url: string) {
  const match = /LogicalName='([^']+)'/.exec(url);
  return Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(''),
    json: () => Promise.resolve({ EntitySetName: `${match ? match[1] : 'x'}s` }),
  });
}
global.fetch = ((url: unknown, options: unknown) =>
  String(url).includes('EntityDefinitions')
    ? metadataResponse(String(url))
    : mockFetch(url, options)) as never;

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

// DFE-LKPCOL-001 — multi-column + language-aware display.
describe('CrmLookupService.searchLookup display columns', () => {
  let service: CrmLookupService;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new CrmLookupService(mockAuthService);
  });

  function okRows(rows: Array<Record<string, unknown>>) {
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ value: rows }), text: () => Promise.resolve(''), headers: { get: () => null } });
  }

  const COLUMNS = [
    { attribute: 'name', arabicAttribute: 'qdb_name_ar', header: 'Name' },
    { attribute: 'accountnumber', header: 'Account #' },
  ];

  it('selects_all_column_attributes_and_returns_them_in_additionalAttributes', async () => {
    mockFetch.mockImplementation(() => okRows([{ accountid: '1', name: 'Acme', accountnumber: 'A-1' }]));
    const results = await service.searchLookup({ entityLogicalName: 'account', displayAttribute: 'name', maxResults: 10, displayColumns: COLUMNS });
    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    expect(url).toContain('name');
    expect(url).toContain('accountnumber');
    expect(results[0].displayName).toBe('Acme'); // first column is the primary label
    expect(results[0].additionalAttributes).toEqual({ name: 'Acme', accountnumber: 'A-1' });
  });

  it('uses_the_arabic_attribute_for_the_primary_column_when_lang_is_ar', async () => {
    mockFetch.mockImplementation(() => okRows([{ accountid: '1', qdb_name_ar: 'أكمي', accountnumber: 'A-1' }]));
    const results = await service.searchLookup({ entityLogicalName: 'account', displayAttribute: 'name', maxResults: 10, displayColumns: COLUMNS, lang: 'ar', searchTerm: 'أ' });
    const url = decodeURIComponent(mockFetch.mock.calls[0][0] as string);
    // primary column resolves to the Arabic attribute for select, order and search
    expect(url).toContain('qdb_name_ar');
    expect(url).toContain("contains(qdb_name_ar,'أ')");
    expect(url).toContain('$orderby=qdb_name_ar');
    expect(results[0].displayName).toBe('أكمي');
    expect(results[0].additionalAttributes?.name).toBe('أكمي'); // keyed by base attribute
  });

  it('falls_back_to_single_displayAttribute_when_no_columns', async () => {
    mockFetch.mockImplementation(() => okRows([{ accountid: '1', name: 'Acme' }]));
    const results = await service.searchLookup({ entityLogicalName: 'account', displayAttribute: 'name', maxResults: 10 });
    expect(results[0].displayName).toBe('Acme');
    expect(results[0].additionalAttributes).toBeUndefined();
  });
});
