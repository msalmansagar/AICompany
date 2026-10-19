// On-prem 9.1 answers /api/data/v9.2 with a 500. The designer's three direct Web API calls —
// Publish (executeAction), the form-level save (updateRecordConditional) and the metadata
// pickers — used to hard-code v9.2, so on that server all three failed while every
// Xrm.WebApi call around them worked. The path now follows the org's own version.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CrmContextService } from '@/services/CrmContextService';
import { MetadataService } from '@/services/MetadataService';

const ON_PREM_CLIENT_URL = 'https://mcdynccatdev01/QDB';
const ON_PREM_WEB_API = `${ON_PREM_CLIENT_URL}/api/data/v9.1`;
const FORM_ID = '11111111-1111-1111-1111-111111111111';

const mockFetch = vi.fn();

function buildOnPremXrm(): typeof Xrm {
  return {
    WebApi: {},
    Utility: {
      getGlobalContext: () => ({
        getClientUrl: () => ON_PREM_CLIENT_URL,
        getVersion: () => '9.1.0.643',
        getUserId: () => '{22222222-2222-2222-2222-222222222222}',
        getUserName: () => 'Maker',
      }),
    },
  } as unknown as typeof Xrm;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ ok: true, status: 204, json: async () => ({ value: [] }), text: async () => '' });
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CrmContextService web API version', () => {
  it('getWebApiBaseUrl_onPrem91_usesV91', () => {
    const service = new CrmContextService(buildOnPremXrm());

    expect(service.getWebApiBaseUrl()).toBe(ON_PREM_WEB_API);
  });

  it('executeAction_onPrem91_postsToV91', async () => {
    const service = new CrmContextService(buildOnPremXrm());

    await service.getWebApi().executeAction('qdb_PublishForm', { FormCode: 'x' });

    expect(mockFetch.mock.calls[0][0]).toBe(`${ON_PREM_WEB_API}/qdb_PublishForm`);
  });

  it('updateRecordConditional_onPrem91_patchesV91', async () => {
    const service = new CrmContextService(buildOnPremXrm());

    await service.getWebApi().updateRecordConditional('qdb_form_definition', FORM_ID, { qdb_title: 'x' }, { ifMatch: 'W/"1"' });

    expect(mockFetch.mock.calls[0][0]).toBe(`${ON_PREM_WEB_API}/qdb_form_definitions(${FORM_ID})`);
  });

  it('getEntities_onPrem91_readsMetadataFromV91', async () => {
    const metadata = new MetadataService(new CrmContextService(buildOnPremXrm()));

    await metadata.getEntities();

    expect(mockFetch.mock.calls[0][0]).toMatch(new RegExp(`^${ON_PREM_WEB_API}/EntityDefinitions\\?`));
  });
});
