// A lookup column can order its options by the display attribute. The direction rides in
// the column's options JSON, so it has to survive the encode/decode round trip — a column
// that saves the sort but loads it back as null would lose it on the next save.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GridColumnConfigService } from '@/services/GridColumnConfigService';
import { GRID_COLUMN_CONFIG_ATTRS } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';
import type { DesignerGridColumnConfig } from '@/state/models/DesignerFormModel';

const FIELD_ID = '00000000-0000-0000-0000-000000000001';
const COLUMN_ID = '00000000-0000-0000-0000-0000000000c1';

function buildMockWebApi() {
  return {
    createRecord: vi.fn().mockResolvedValue({ id: COLUMN_ID }),
    updateRecord: vi.fn().mockResolvedValue(undefined),
    deleteRecord: vi.fn(),
    retrieveRecord: vi.fn(),
    retrieveMultipleRecords: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as IWebApiAdapter;
}

function lookupColumn(overrides: Partial<DesignerGridColumnConfig> = {}): DesignerGridColumnConfig {
  return {
    id: 'tmp_col_1',
    columnLabel: 'Year',
    targetAttribute: 'qdb_year',
    columnFieldType: 'lookup',
    displayOrder: 0,
    isVisible: true,
    isEditable: false,
    isRequired: false,
    maxLength: null,
    validationFormat: 'none',
    validationPattern: null,
    validationMessage: null,
    optionsJson: null,
    filterType: 'lookup',
    lookupTargetEntity: 'qdb_year',
    lookupDisplayAttribute: 'qdb_name',
    lookupValueAttribute: 'qdb_yearid',
    lookupSort: null,
    ...overrides,
  };
}

function storedOptionsJson(webApi: IWebApiAdapter): Record<string, unknown> {
  const payload = (webApi.createRecord as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
  return JSON.parse(String(payload[GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON])) as Record<string, unknown>;
}

describe('GridColumnConfigService lookup sort', () => {
  let webApi: IWebApiAdapter;
  let service: GridColumnConfigService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new GridColumnConfigService(webApi);
  });

  it('should_store_the_sort_direction_when_the_maker_sets_one', async () => {
    await service.createColumn(FIELD_ID, lookupColumn({ lookupSort: 'asc' }));

    expect(storedOptionsJson(webApi)['lookupSort']).toBe('asc');
  });

  it('should_omit_the_sort_when_the_column_is_unsorted', async () => {
    await service.createColumn(FIELD_ID, lookupColumn());

    expect(storedOptionsJson(webApi)).not.toHaveProperty('lookupSort');
  });

  it('should_keep_the_lookup_config_alongside_the_sort', async () => {
    await service.createColumn(FIELD_ID, lookupColumn({ lookupSort: 'desc' }));

    const stored = storedOptionsJson(webApi);
    expect(stored['lookupTargetEntity']).toBe('qdb_year');
    expect(stored['lookupDisplayAttribute']).toBe('qdb_name');
    expect(stored['lookupSort']).toBe('desc');
  });

  it('should_read_the_sort_back_when_loading_a_column', async () => {
    (webApi.retrieveMultipleRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ entities: [
      {
        [GRID_COLUMN_CONFIG_ATTRS.ID]: COLUMN_ID,
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL]: 'Year',
        [GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR]: 'qdb_year',
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE]: 'lookup',
        [GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER]: 1,
        [GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON]: JSON.stringify({
          v: 2,
          filterType: 'lookup',
          lookupTargetEntity: 'qdb_year',
          lookupDisplayAttribute: 'qdb_name',
          lookupSort: 'desc',
        }),
      },
    ] });

    const columns = await service.listColumnsForField(FIELD_ID);

    expect(columns[0].lookupSort).toBe('desc');
  });

  it('should_accept_the_shorter_sort_key_when_the_json_was_authored_by_hand', async () => {
    (webApi.retrieveMultipleRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ entities: [
      {
        [GRID_COLUMN_CONFIG_ATTRS.ID]: COLUMN_ID,
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL]: 'Year',
        [GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR]: 'qdb_year',
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE]: 'lookup',
        [GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER]: 1,
        [GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON]: JSON.stringify({
          v: 2,
          filterType: 'lookup',
          lookupTargetEntity: 'qdb_year',
          lookupDisplayAttribute: 'qdb_name',
          lookupValueAttribute: 'qdb_yearid',
          sort: 'asc',
        }),
      },
    ] });

    const columns = await service.listColumnsForField(FIELD_ID);

    expect(columns[0].lookupSort).toBe('asc');
  });

  it('should_ignore_a_sort_value_that_names_no_direction', async () => {
    (webApi.retrieveMultipleRecords as ReturnType<typeof vi.fn>).mockResolvedValue({ entities: [
      {
        [GRID_COLUMN_CONFIG_ATTRS.ID]: COLUMN_ID,
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL]: 'Year',
        [GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR]: 'qdb_year',
        [GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE]: 'lookup',
        [GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER]: 1,
        [GRID_COLUMN_CONFIG_ATTRS.OPTIONS_JSON]: JSON.stringify({ v: 2, sort: 'sideways' }),
      },
    ] });

    const columns = await service.listColumnsForField(FIELD_ID);

    expect(columns[0].lookupSort).toBeNull();
  });
});
