// Is Visible = No used to remove a column from everything: the designer's own list query
// filtered it out, so a maker could not see the column to un-hide it, and createColumn
// hardcoded true so the designer could never set it in the first place. The flag was
// reachable only by editing the row directly in CRM.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GridColumnConfigService } from '@/services/GridColumnConfigService';
import { GRID_COLUMN_CONFIG_ATTRS } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { DesignerGridColumnConfig } from '@/state/models/DesignerFormModel';

const FIELD_ID = '00000000-0000-0000-0000-000000000001';
const COLUMN_ID = '00000000-0000-0000-0000-0000000000c1';

function buildMockWebApi() {
  return {
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as IWebApiAdapter;
}

function column(overrides: Partial<DesignerGridColumnConfig> = {}): DesignerGridColumnConfig {
  return {
    id: 'tmp_col_1',
    columnLabel: 'Reference',
    targetAttribute: 'qdb_reference',
    columnFieldType: 'text',
    displayOrder: 0,
    isVisible: true,
    isEditable: false,
    isRequired: false,
    maxLength: null,
    validationFormat: 'none',
    validationPattern: null,
    validationMessage: null,
    optionsJson: null,
    filterType: 'none',
    lookupTargetEntity: null,
    lookupDisplayAttribute: null,
    lookupValueAttribute: null,
    ...overrides,
  };
}

describe('GridColumnConfigService — hidden columns stay reachable', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: GridColumnConfigService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new GridColumnConfigService(webApi);
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: COLUMN_ID, entityType: 'qdb_grid_column_config' });
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
  });

  it('list_doesNotFilterOnIsVisible', async () => {
    await service.listColumnsForField(FIELD_ID);

    const query = vi.mocked(webApi.retrieveMultipleRecords).mock.calls[0][1] as string;

    expect(query).not.toContain(GRID_COLUMN_CONFIG_ATTRS.IS_VISIBLE + ' eq');
  });

  it('list_selectsIsVisible_soThePanelCanShowIt', async () => {
    await service.listColumnsForField(FIELD_ID);

    const query = vi.mocked(webApi.retrieveMultipleRecords).mock.calls[0][1] as string;

    expect(query).toContain(GRID_COLUMN_CONFIG_ATTRS.IS_VISIBLE);
  });

  it('create_writesTheMakersChoice_notAHardcodedTrue', async () => {
    await service.createColumn(FIELD_ID, column({ isVisible: false }));

    const payload = vi.mocked(webApi.createRecord).mock.calls[0][1] as Record<string, unknown>;

    expect(payload[GRID_COLUMN_CONFIG_ATTRS.IS_VISIBLE]).toBe(false);
  });

  it('update_sendsIsVisible_whenItChanges', async () => {
    await service.updateColumn(COLUMN_ID, { isVisible: false });

    const payload = vi.mocked(webApi.updateRecord).mock.calls[0][2] as Record<string, unknown>;

    expect(payload[GRID_COLUMN_CONFIG_ATTRS.IS_VISIBLE]).toBe(false);
  });

  // Records created before the column existed come back without the attribute at all.
  it('read_treatsAbsentIsVisibleAsVisible', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [{
        [GRID_COLUMN_CONFIG_ATTRS.ID]: COLUMN_ID,
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL]: 'Legacy',
        [GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR]: 'qdb_legacy',
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE]: 'text',
        [GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER]: 0,
      }],
    });

    const [result] = await service.listColumnsForField(FIELD_ID);

    expect(result.isVisible).toBe(true);
  });

  it('read_mapsIsVisibleFalse', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [{
        [GRID_COLUMN_CONFIG_ATTRS.ID]: COLUMN_ID,
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL]: 'Key',
        [GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR]: 'qdb_key',
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE]: 'text',
        [GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER]: 0,
        [GRID_COLUMN_CONFIG_ATTRS.IS_VISIBLE]: false,
      }],
    });

    const [result] = await service.listColumnsForField(FIELD_ID);

    expect(result.isVisible).toBe(false);
  });
});
