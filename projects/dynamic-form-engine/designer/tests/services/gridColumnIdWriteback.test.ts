// A created grid column's real id was never written back to the store, so the store kept its
// tmp_ id forever. syncColumns deletes any persisted row whose id it does not recognise, so
// every subsequent save deleted the row it had just created and made another one — visible in
// the proxy log as an endless DELETE/POST pair, and to the maker as a column that vanishes.

import { describe, it, expect } from 'vitest';
import { GridColumnConfigService } from '@/services/GridColumnConfigService';

const FIELD_ID = '3670e935-2da1-f111-b8dc-70a8a55bc6a5';
const EXISTING_ID = '11111111-1111-1111-1111-111111111111';

function column(id: string, label: string) {
  return {
    id, columnLabel: label, targetAttribute: 'qdb_x', columnFieldType: 'text',
    displayOrder: 1, isVisible: true, isEditable: false, isRequired: false,
    maxLength: null, validationFormat: 'none' as const, validationPattern: null,
    validationMessage: null, optionsJson: null, filterType: 'none' as const,
    lookupTargetEntity: null, lookupDisplayAttribute: null, lookupValueAttribute: null,
  };
}

function fakeWebApi(existing: Array<Record<string, unknown>> = []) {
  const calls = { created: 0, deleted: [] as string[], updated: [] as string[] };
  const webApi = {
    retrieveMultipleRecords: async () => ({ entities: existing }),
    createRecord: async () => { calls.created += 1; return { id: EXISTING_ID }; },
    updateRecord: async (_e: string, id: string) => { calls.updated.push(id); return {}; },
    deleteRecord: async (_e: string, id: string) => { calls.deleted.push(id); return {}; },
  } as unknown as ConstructorParameters<typeof GridColumnConfigService>[0];
  return { webApi, calls };
}

describe('syncColumns — reporting created ids', () => {
  it('returnsTheRealIdKeyedByTheTemporaryOne', async () => {
    const { webApi } = fakeWebApi();
    const service = new GridColumnConfigService(webApi);

    const resolved = await service.syncColumns(FIELD_ID, [column('tmp_col_1', 'Full Name')]);

    expect(resolved).toEqual({ tmp_col_1: EXISTING_ID });
  });

  it('reportsNothingWhenEveryColumnAlreadyHasARealId', async () => {
    const { webApi } = fakeWebApi([
      { qdb_grid_column_configid: EXISTING_ID, qdb_column_label: 'Full Name', qdb_display_order: 1 },
    ]);
    const service = new GridColumnConfigService(webApi);

    const resolved = await service.syncColumns(FIELD_ID, [column(EXISTING_ID, 'Full Name')]);

    expect(resolved).toEqual({});
  });

  // The behaviour the churn came from: a column already persisted under a real id must be
  // updated in place, never deleted and recreated.
  it('updatesAnAlreadyPersistedColumn_ratherThanDeletingAndRecreatingIt', async () => {
    const { webApi, calls } = fakeWebApi([
      { qdb_grid_column_configid: EXISTING_ID, qdb_column_label: 'Full Name', qdb_display_order: 1 },
    ]);
    const service = new GridColumnConfigService(webApi);

    await service.syncColumns(FIELD_ID, [column(EXISTING_ID, 'Full Name')]);

    expect(calls.deleted).toEqual([]);
    expect(calls.created).toBe(0);
    expect(calls.updated).toEqual([EXISTING_ID]);
  });
});
