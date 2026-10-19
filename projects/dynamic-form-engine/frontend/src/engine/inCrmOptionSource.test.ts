import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { optionsApi } from '../../webresource/xrm/optionsApi';

// The in-CRM runtime reads a field's CRM option source from attribute metadata. It used to
// cast every source to PicklistAttributeMetadata, which Dataverse answers with 404 for a
// multi-select choice — and the runtime turned that 404 into an empty dropdown, silently.

const SOURCE_FIELD = {
  id: 'field-1',
  optionSourceEntity: 'qdb_servicerequest',
  optionSourceAttribute: 'qdb_keychallengesinoperationstoday',
  options: [{ value: '1', label: 'Hand-copied', displayOrder: 1, isDefault: false, isActive: true }],
};

vi.mock('../../webresource/xrm/formApi', () => ({
  getLoadedForm: () => ({ tabs: [{ sections: [{ fields: [SOURCE_FIELD] }] }] }),
}));

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function attributeType(typeName: string) {
  return jsonResponse({ AttributeTypeName: { Value: typeName } });
}

const OPTION_SET = jsonResponse({
  OptionSet: {
    Options: [
      { Value: 100000000, Label: { UserLocalizedLabel: { Label: 'Cash flow' } } },
      { Value: 100000001, Label: { UserLocalizedLabel: { Label: 'Hiring' } } },
    ],
  },
});

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal('fetch', mockFetch);
  (globalThis as unknown as { Xrm: unknown }).Xrm = {
    WebApi: {},
    Utility: { getGlobalContext: () => ({ getClientUrl: () => 'https://onprem/QDB', getVersion: () => '9.1.0.643' }) },
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('in-CRM option source', () => {
  it('getOptions_multiSelectSource_readsThroughTheMultiSelectCast', async () => {
    mockFetch.mockResolvedValueOnce(attributeType('MultiSelectPicklistType')).mockResolvedValueOnce(OPTION_SET);

    await optionsApi.getOptions('field-1', 'demo');

    expect(mockFetch.mock.calls[1][0]).toContain('/Microsoft.Dynamics.CRM.MultiSelectPicklistAttributeMetadata?');
  });

  it('getOptions_picklistSource_returnsTheLiveOptionsInCrmOrder', async () => {
    mockFetch.mockResolvedValueOnce(attributeType('PicklistType')).mockResolvedValueOnce(OPTION_SET);

    const { data } = await optionsApi.getOptions('field-1', 'demo');

    expect(data.map((option) => [option.value, option.label])).toEqual([['100000000', 'Cash flow'], ['100000001', 'Hiring']]);
  });

  it('getOptions_onPrem91_readsMetadataFromV91', async () => {
    mockFetch.mockResolvedValueOnce(attributeType('PicklistType')).mockResolvedValueOnce(OPTION_SET);

    await optionsApi.getOptions('field-1', 'demo');

    expect(mockFetch.mock.calls[0][0]).toMatch(/^https:\/\/onprem\/QDB\/api\/data\/v9\.1\/EntityDefinitions/);
  });

  it('getOptions_metadataRequestFails_warnsAndReturnsNoOptions', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: { message: 'boom' } }, 500));

    const { data } = await optionsApi.getOptions('field-1', 'demo');

    expect({ data, warned: warn.mock.calls.length > 0 }).toEqual({ data: [], warned: true });
  });
});
