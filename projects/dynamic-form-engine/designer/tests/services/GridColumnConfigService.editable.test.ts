// An empty qdb_is_editable means editable to the publisher (FieldBuilder.cs GetBoolOrTrue),
// but the designer loaded it as false. Any Save of the grid field then wrote false back, and
// every such column silently turned read-only on the next publish (found 2026-11-10 by the
// survey-engine B0 Save test on three-changes-demo).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GridColumnConfigService } from '@/services/GridColumnConfigService';
import { GRID_COLUMN_CONFIG_ATTRS } from '@/constants/attributeNames';
import type { IWebApiAdapter } from '@/services/IWebApiAdapter';

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

function columnRecord(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    [GRID_COLUMN_CONFIG_ATTRS.ID]: COLUMN_ID,
    [GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL]: 'Full Name',
    [GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR]: 'fullname',
    [GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE]: 'text',
    [GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER]: 1,
    ...extra,
  };
}

describe('GridColumnConfigService — Is Editable round trip', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: GridColumnConfigService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new GridColumnConfigService(webApi);
  });

  it('listColumnsForField_isEditableAbsent_loadsAsEditable', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [columnRecord()] });

    const [result] = await service.listColumnsForField(FIELD_ID);

    expect(result.isEditable).toBe(true);
  });

  it('listColumnsForField_isEditableNull_loadsAsEditable', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [columnRecord({ [GRID_COLUMN_CONFIG_ATTRS.IS_EDITABLE]: null })],
    });

    const [result] = await service.listColumnsForField(FIELD_ID);

    expect(result.isEditable).toBe(true);
  });

  it('listColumnsForField_isEditableFalse_loadsAsReadOnly', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [columnRecord({ [GRID_COLUMN_CONFIG_ATTRS.IS_EDITABLE]: false })],
    });

    const [result] = await service.listColumnsForField(FIELD_ID);

    expect(result.isEditable).toBe(false);
  });
});
