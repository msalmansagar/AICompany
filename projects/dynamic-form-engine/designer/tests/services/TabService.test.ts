// RED — failing until implementation is in place.
// Tests cover:
//   1. createTab sends qdb_hide_tab_bar in the payload.
//   2. updateTab sends qdb_hide_tab_bar when provided.
//   3. listTabsForForm maps qdb_hide_tab_bar from the CRM record to hideTabBar on the model.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TabService } from '@/services/TabService';
import { FORM_TAB_ATTRS } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

function buildMockWebApi(): IWebApiAdapter {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
  } as unknown as IWebApiAdapter;
}

const ENTITY_FORM_TAB = 'qdb_form_tabs';

describe('TabService — hideTabBar', () => {
  let webApi: IWebApiAdapter;
  let service: TabService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new TabService(webApi);
  });

  it('createTab_withHideTabBarTrue_sendsFieldInPayload', async () => {
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'new-tab-id', entityType: ENTITY_FORM_TAB });

    await service.createTab({
      formId: 'form-1',
      label: 'Full Screen Tab',
      sortOrder: 0,
      hideTabBar: true,
    });

    expect(webApi.createRecord).toHaveBeenCalledOnce();
    const [, payload] = vi.mocked(webApi.createRecord).mock.calls[0];
    expect(payload).toMatchObject({
      [FORM_TAB_ATTRS.HIDE_TAB_BAR]: true,
    });
  });

  it('createTab_withHideTabBarFalse_sendsFieldInPayload', async () => {
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'new-tab-id', entityType: ENTITY_FORM_TAB });

    await service.createTab({
      formId: 'form-1',
      label: 'Normal Tab',
      sortOrder: 1,
      hideTabBar: false,
    });

    expect(webApi.createRecord).toHaveBeenCalledOnce();
    const [, payload] = vi.mocked(webApi.createRecord).mock.calls[0];
    expect(payload).toMatchObject({
      [FORM_TAB_ATTRS.HIDE_TAB_BAR]: false,
    });
  });

  it('createTab_withoutHideTabBar_defaultsToFalse', async () => {
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: 'new-tab-id', entityType: ENTITY_FORM_TAB });

    await service.createTab({
      formId: 'form-1',
      label: 'Default Tab',
      sortOrder: 2,
    });

    const [, payload] = vi.mocked(webApi.createRecord).mock.calls[0];
    expect(payload).toMatchObject({
      [FORM_TAB_ATTRS.HIDE_TAB_BAR]: false,
    });
  });

  it('updateTab_withHideTabBarTrue_sendsFieldInPayload', async () => {
    vi.mocked(webApi.updateRecord).mockResolvedValue(undefined);

    await service.updateTab('tab-id-1', { hideTabBar: true });

    expect(webApi.updateRecord).toHaveBeenCalledOnce();
    const [, , data] = vi.mocked(webApi.updateRecord).mock.calls[0];
    expect(data).toMatchObject({
      [FORM_TAB_ATTRS.HIDE_TAB_BAR]: true,
    });
  });

  it('updateTab_withHideTabBarFalse_sendsFieldInPayload', async () => {
    vi.mocked(webApi.updateRecord).mockResolvedValue(undefined);

    await service.updateTab('tab-id-1', { hideTabBar: false });

    const [, , data] = vi.mocked(webApi.updateRecord).mock.calls[0];
    expect(data).toMatchObject({
      [FORM_TAB_ATTRS.HIDE_TAB_BAR]: false,
    });
  });

  it('updateTab_withoutHideTabBar_doesNotSendField', async () => {
    vi.mocked(webApi.updateRecord).mockResolvedValue(undefined);

    await service.updateTab('tab-id-1', { label: 'Updated Label' });

    const [, , data] = vi.mocked(webApi.updateRecord).mock.calls[0];
    expect(data).not.toHaveProperty(FORM_TAB_ATTRS.HIDE_TAB_BAR);
  });

  it('listTabsForForm_mapsHideTabBarTrueFromRecord', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [
        {
          [FORM_TAB_ATTRS.ID]: 'tab-guid-1',
          [FORM_TAB_ATTRS.FORM_ID_VALUE]: 'form-guid-1',
          [FORM_TAB_ATTRS.LABEL]: 'Landing',
          [FORM_TAB_ATTRS.ICON_NAME]: null,
          [FORM_TAB_ATTRS.SORT_ORDER]: 0,
          [FORM_TAB_ATTRS.IS_VISIBLE]: true,
          [FORM_TAB_ATTRS.REQUIRES_PREVIOUS_TAB_COMPLETE]: false,
          [FORM_TAB_ATTRS.HIDE_TAB_BAR]: true,
        },
      ],
      nextLink: undefined,
    });

    const tabs = await service.listTabsForForm('form-guid-1');

    expect(tabs).toHaveLength(1);
    expect(tabs[0].hideTabBar).toBe(true);
  });

  it('listTabsForForm_mapsHideTabBarFalseFromRecord', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [
        {
          [FORM_TAB_ATTRS.ID]: 'tab-guid-2',
          [FORM_TAB_ATTRS.FORM_ID_VALUE]: 'form-guid-1',
          [FORM_TAB_ATTRS.LABEL]: 'Normal',
          [FORM_TAB_ATTRS.ICON_NAME]: null,
          [FORM_TAB_ATTRS.SORT_ORDER]: 1,
          [FORM_TAB_ATTRS.IS_VISIBLE]: true,
          [FORM_TAB_ATTRS.REQUIRES_PREVIOUS_TAB_COMPLETE]: false,
          [FORM_TAB_ATTRS.HIDE_TAB_BAR]: false,
        },
      ],
      nextLink: undefined,
    });

    const tabs = await service.listTabsForForm('form-guid-1');

    expect(tabs[0].hideTabBar).toBe(false);
  });

  it('listTabsForForm_treatsAbsentHideTabBarAsFalse', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [
        {
          [FORM_TAB_ATTRS.ID]: 'tab-guid-3',
          [FORM_TAB_ATTRS.FORM_ID_VALUE]: 'form-guid-1',
          [FORM_TAB_ATTRS.LABEL]: 'Legacy Tab',
          [FORM_TAB_ATTRS.ICON_NAME]: null,
          [FORM_TAB_ATTRS.SORT_ORDER]: 2,
          [FORM_TAB_ATTRS.IS_VISIBLE]: true,
          [FORM_TAB_ATTRS.REQUIRES_PREVIOUS_TAB_COMPLETE]: false,
          // HIDE_TAB_BAR intentionally absent — legacy record before field was added
        },
      ],
      nextLink: undefined,
    });

    const tabs = await service.listTabsForForm('form-guid-1');

    expect(tabs[0].hideTabBar).toBe(false);
  });

  it('listTabsForForm_selectQueryIncludesHideTabBarAttribute', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [], nextLink: undefined });

    await service.listTabsForForm('form-guid-1');

    const [, query] = vi.mocked(webApi.retrieveMultipleRecords).mock.calls[0];
    expect(query).toContain(FORM_TAB_ATTRS.HIDE_TAB_BAR);
  });
});
