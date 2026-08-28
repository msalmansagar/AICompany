// A grid field's columns were saved to CRM but never read back: FieldService hardcoded
// gridColumns to [] and the open-form path fetched options, lookup config and validation
// rules per field while skipping grid columns entirely. A maker added a column, saved it
// successfully, reloaded, and saw nothing.
//
// It also destroyed data. syncColumns deletes any persisted row the store does not know
// about, so the next save deleted the column that had just been saved — the DELETE/POST
// pair the proxy log showed on every save.

import { describe, it, expect } from 'vitest';
import { isGridFieldType } from '@/constants/fieldTypes';
import { GridColumnConfigService } from '@/services/GridColumnConfigService';

const FIELD_ID = '87857ce7-63a2-f111-b8db-70a8a55bc6a5';
const COLUMN_ID = '11111111-1111-1111-1111-111111111111';

describe('isGridFieldType', () => {
  it('recognisesAnInteractiveGrid', () => {
    expect(isGridFieldType('interactive-grid')).toBe(true);
  });

  it('recognisesARepeatingGrid', () => {
    expect(isGridFieldType('repeating_grid')).toBe(true);
  });

  it('rejectsAFieldTypeThatHasNoColumns', () => {
    expect(isGridFieldType('text')).toBe(false);
  });
});

describe('GridColumnConfigService.listColumnsForField', () => {
  function webApiReturning(entities: Array<Record<string, unknown>>) {
    return {
      retrieveMultipleRecords: async () => ({ entities }),
      createRecord: async () => ({ id: COLUMN_ID }),
      updateRecord: async () => ({}),
      deleteRecord: async () => ({}),
    } as unknown as ConstructorParameters<typeof GridColumnConfigService>[0];
  }

  it('readsAPersistedColumnBackWithItsRealId', async () => {
    const service = new GridColumnConfigService(webApiReturning([{
      qdb_grid_column_configid: COLUMN_ID,
      qdb_column_label: 'Full Name',
      qdb_column_attribute: 'qdb_full_name',
      qdb_column_field_type: 'text',
      qdb_display_order: 1,
      qdb_is_visible: true,
      qdb_is_editable: false,
    }]));

    const columns = await service.listColumnsForField(FIELD_ID);

    expect(columns).toHaveLength(1);
    expect(columns[0].id).toBe(COLUMN_ID);
    expect(columns[0].columnLabel).toBe('Full Name');
  });

  // The id is what stops the next save deleting the row: syncColumns keeps any column whose
  // id it recognises and deletes the rest, so a column read back without its real id would
  // be destroyed on the following save.
  it('doesNotReturnATemporaryIdForAPersistedColumn', async () => {
    const service = new GridColumnConfigService(webApiReturning([{
      qdb_grid_column_configid: COLUMN_ID,
      qdb_column_label: 'Full Name',
      qdb_display_order: 1,
    }]));

    const [column] = await service.listColumnsForField(FIELD_ID);

    expect(column.id.startsWith('tmp_')).toBe(false);
  });
});
