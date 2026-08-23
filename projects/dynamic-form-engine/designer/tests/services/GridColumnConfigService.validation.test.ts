// Grid columns gained per-column validation (required / max length / format). These cover the
// round trip: what the designer writes to CRM, and what it reads back.
//
// The clearing cases matter most. A maker who turns a rule off must end up with null in the
// column, not with an empty string or a 'none' that reads back as a rule matching nothing.

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

function baseRecord(): Record<string, unknown> {
  return {
    [GRID_COLUMN_CONFIG_ATTRS.ID]: COLUMN_ID,
    [GRID_COLUMN_CONFIG_ATTRS.COLUMN_LABEL]: 'Reference',
    [GRID_COLUMN_CONFIG_ATTRS.TARGET_ATTR]: 'qdb_reference',
    [GRID_COLUMN_CONFIG_ATTRS.COLUMN_TYPE]: 'text',
    [GRID_COLUMN_CONFIG_ATTRS.DISPLAY_ORDER]: 0,
  };
}

describe('GridColumnConfigService — per-column validation', () => {
  let webApi: ReturnType<typeof buildMockWebApi>;
  let service: GridColumnConfigService;

  beforeEach(() => {
    webApi = buildMockWebApi();
    service = new GridColumnConfigService(webApi);
    vi.mocked(webApi.createRecord).mockResolvedValue({ id: COLUMN_ID, entityType: 'qdb_grid_column_config' });
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [] });
  });

  async function createPayload(col: DesignerGridColumnConfig): Promise<Record<string, unknown>> {
    await service.createColumn(FIELD_ID, col);
    return vi.mocked(webApi.createRecord).mock.calls[0][1] as Record<string, unknown>;
  }

  it('create_writesEveryValidationColumn', async () => {
    const payload = await createPayload(column({
      isRequired: true,
      maxLength: 40,
      validationFormat: 'email',
      validationMessage: 'Enter a work email',
    }));

    expect(payload[GRID_COLUMN_CONFIG_ATTRS.IS_REQUIRED]).toBe(true);
    expect(payload[GRID_COLUMN_CONFIG_ATTRS.MAX_LENGTH]).toBe(40);
    expect(payload[GRID_COLUMN_CONFIG_ATTRS.VALIDATION_FORMAT]).toBe('email');
    expect(payload[GRID_COLUMN_CONFIG_ATTRS.VALIDATION_MESSAGE]).toBe('Enter a work email');
  });

  it('create_writesFormatNoneAsNull', async () => {
    const payload = await createPayload(column({ validationFormat: 'none' }));

    expect(payload[GRID_COLUMN_CONFIG_ATTRS.VALIDATION_FORMAT]).toBeNull();
  });

  it('create_writesABlankPatternAsNull', async () => {
    const payload = await createPayload(column({ validationPattern: '' }));

    expect(payload[GRID_COLUMN_CONFIG_ATTRS.VALIDATION_PATTERN]).toBeNull();
  });

  it('create_writesNoMaxLengthAsNull', async () => {
    const payload = await createPayload(column({ maxLength: null }));

    expect(payload[GRID_COLUMN_CONFIG_ATTRS.MAX_LENGTH]).toBeNull();
  });

  it('update_writesTheValidationColumns_whenOneChanges', async () => {
    await service.updateColumn(COLUMN_ID, { isRequired: true, maxLength: 12 });

    const payload = vi.mocked(webApi.updateRecord).mock.calls[0][2] as Record<string, unknown>;

    expect(payload[GRID_COLUMN_CONFIG_ATTRS.IS_REQUIRED]).toBe(true);
    expect(payload[GRID_COLUMN_CONFIG_ATTRS.MAX_LENGTH]).toBe(12);
  });

  it('update_leavesValidationAlone_whenOnlyTheLabelChanges', async () => {
    await service.updateColumn(COLUMN_ID, { columnLabel: 'Renamed' });

    const payload = vi.mocked(webApi.updateRecord).mock.calls[0][2] as Record<string, unknown>;

    expect(payload).not.toHaveProperty(GRID_COLUMN_CONFIG_ATTRS.IS_REQUIRED);
    expect(payload).not.toHaveProperty(GRID_COLUMN_CONFIG_ATTRS.MAX_LENGTH);
  });

  it('read_mapsTheValidationColumns', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [{
        ...baseRecord(),
        [GRID_COLUMN_CONFIG_ATTRS.IS_REQUIRED]: true,
        [GRID_COLUMN_CONFIG_ATTRS.MAX_LENGTH]: 40,
        [GRID_COLUMN_CONFIG_ATTRS.VALIDATION_FORMAT]: 'email',
        [GRID_COLUMN_CONFIG_ATTRS.VALIDATION_PATTERN]: null,
        [GRID_COLUMN_CONFIG_ATTRS.VALIDATION_MESSAGE]: 'Enter a work email',
      }],
    });

    const [result] = await service.listColumnsForField(FIELD_ID);

    expect(result.isRequired).toBe(true);
    expect(result.maxLength).toBe(40);
    expect(result.validationFormat).toBe('email');
    expect(result.validationMessage).toBe('Enter a work email');
  });

  // Columns created before these existed come back without the attributes at all.
  it('read_defaultsToNoValidation_forALegacyColumn', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({ entities: [baseRecord()] });

    const [result] = await service.listColumnsForField(FIELD_ID);

    expect(result.isRequired).toBe(false);
    expect(result.maxLength).toBeNull();
    expect(result.validationFormat).toBe('none');
    expect(result.validationPattern).toBeNull();
  });

  // A stored typo should show in the panel as "no format", not as a blank dropdown.
  it('read_treatsAnUnrecognisedFormatAsNone', async () => {
    vi.mocked(webApi.retrieveMultipleRecords).mockResolvedValue({
      entities: [{ ...baseRecord(), [GRID_COLUMN_CONFIG_ATTRS.VALIDATION_FORMAT]: 'emial' }],
    });

    const [result] = await service.listColumnsForField(FIELD_ID);

    expect(result.validationFormat).toBe('none');
  });
});
