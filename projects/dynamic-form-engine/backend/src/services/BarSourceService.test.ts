import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BarSourceService } from './BarSourceService.js';
import type { BarSourceConfig } from '@qdb/shared';

// The bar's numbers read from a CRM record. The caller supplies only a record id — the
// entity and the three attributes come from the maker's config, so this cannot be used to
// read columns nobody configured.

const mockAuthService = { getAccessToken: vi.fn().mockResolvedValue('token') } as never;
const mockFetch = vi.fn();

function metadataResponse(url: string) {
  const match = /LogicalName='([^']+)'/.exec(url);
  return Promise.resolve({
    ok: true, status: 200, text: () => Promise.resolve(''), headers: { get: () => null },
    json: () => Promise.resolve({ EntitySetName: `${match ? match[1] : 'x'}s` }),
  });
}
global.fetch = ((url: unknown, options: unknown) =>
  String(url).includes('EntityDefinitions') ? metadataResponse(String(url)) : mockFetch(url, options)) as never;

function record(body: Record<string, unknown>) {
  return Promise.resolve({
    ok: true, status: 200, text: () => Promise.resolve(''), headers: { get: () => null },
    json: () => Promise.resolve(body),
  });
}

const CONFIG: BarSourceConfig = {
  sourceFieldSchemaName: 'cel_customer',
  entityLogicalName: 'qdb_creditline',
  minAttribute: 'qdb_floor',
  maxAttribute: 'qdb_limit',
  valueAttribute: 'qdb_utilised',
};
const RECORD_ID = '11111111-1111-1111-1111-111111111111';

describe('BarSourceService', () => {
  let service: BarSourceService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BarSourceService(mockAuthService);
  });

  it('readsMinMaxAndValueFromTheRecord', async () => {
    mockFetch.mockReturnValueOnce(record({ qdb_floor: 500, qdb_limit: 1500, qdb_utilised: 750 }));

    expect(await service.readValues(CONFIG, RECORD_ID)).toEqual({ min: 500, max: 1500, value: 750 });
  });

  it('selectsOnlyTheConfiguredAttributes', async () => {
    // The config is the allow-list — a caller cannot widen it.
    mockFetch.mockReturnValueOnce(record({ qdb_limit: 100, qdb_utilised: 10 }));

    await service.readValues(CONFIG, RECORD_ID);

    const url = String((mockFetch.mock.calls[0] as [string])[0]);
    expect(url).toContain('/qdb_creditlines(11111111-1111-1111-1111-111111111111)');
    expect(url).toContain('$select=qdb_limit,qdb_utilised,qdb_floor');
  });

  it('treatsAnAbsentMinimumAsZero_soExistingBarsAreUnchanged', async () => {
    mockFetch.mockReturnValueOnce(record({ qdb_limit: 1000, qdb_utilised: 400 }));
    const { minAttribute, ...withoutMin } = CONFIG;

    expect(await service.readValues(withoutMin, RECORD_ID)).toEqual({ min: 0, max: 1000, value: 400 });
  });

  it('readsANullColumnAsZero_ratherThanBreakingTheBar', async () => {
    mockFetch.mockReturnValueOnce(record({ qdb_floor: null, qdb_limit: 1000, qdb_utilised: null }));

    expect(await service.readValues(CONFIG, RECORD_ID)).toEqual({ min: 0, max: 1000, value: 0 });
  });

  it('acceptsABracedGuid', async () => {
    mockFetch.mockReturnValueOnce(record({ qdb_limit: 1, qdb_utilised: 1 }));

    await service.readValues(CONFIG, `{${RECORD_ID}}`);

    expect(String((mockFetch.mock.calls[0] as [string])[0])).toContain(`(${RECORD_ID})`);
  });

  it('rejectsARecordIdThatIsNotAGuid_beforeCallingCrm', async () => {
    await expect(service.readValues(CONFIG, "abc') or 1=1--")).rejects.toThrow(/not a valid record id/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('throwsWhenTheRecordCannotBeRead_ratherThanShowingZeroAsIfItWereData', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve({
      ok: false, status: 404, text: () => Promise.resolve('not found'),
      headers: { get: () => null }, json: () => Promise.resolve({}),
    }));

    await expect(service.readValues(CONFIG, RECORD_ID)).rejects.toThrow(/could not be read/);
  });
});
