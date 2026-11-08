import { describe, it, expect } from 'vitest';
import {
  createTranslationImportService,
  UnresolvedRecordsError,
} from '@/services/translations/TranslationImportService';
import type { ParsedTranslationWorkbook } from '@/services/translations/translationWorkbookParser';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FakeWebApi } from './fakeWebApi';

const FIELD_ID = '44444444-4444-4444-4444-444444444444';

function workbook(values: Record<string, string>, source = 'Full name'): ParsedTranslationWorkbook {
  return {
    languages: ['ar'],
    rows: [
      {
        line: 2,
        entity: 'qdb_form_field',
        recordId: FIELD_ID,
        field: 'qdb_label',
        source,
        values,
      },
    ],
  };
}

function existingTranslation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    qdb_translationid: 'tr-001',
    qdb_entity_name: 'qdb_form_field',
    qdb_record_id: FIELD_ID,
    qdb_field_name: 'qdb_label',
    qdb_language_code: 'ar',
    qdb_translated_value: 'الاسم الكامل',
    qdb_source_value: 'Full name',
    ...overrides,
  };
}

function orgWith(translations: Record<string, unknown>[] = []): FakeWebApi {
  return new FakeWebApi({
    qdb_form_field: [{ qdb_form_fieldid: FIELD_ID }],
    [ENTITY_NAMES.TRANSLATION]: translations,
  });
}

describe('TranslationImportService', () => {
  it('apply_createsATranslation_whenNoneExists', async () => {
    const api = orgWith();

    const summary = await createTranslationImportService(api).apply(
      workbook({ ar: 'الاسم الكامل' }),
      { dryRun: false },
    );

    expect(summary).toMatchObject({ created: 1, updated: 0, unchanged: 0, blank: 0 });
  });

  it('apply_storesTheSourceSnapshot_alongsideTheTranslation', async () => {
    const api = orgWith();

    await createTranslationImportService(api).apply(workbook({ ar: 'الاسم الكامل' }), {
      dryRun: false,
    });

    expect(api.created[0].data).toMatchObject({ qdb_source_value: 'Full name' });
  });

  it('apply_updatesATranslation_whenTheValueChanged', async () => {
    const api = orgWith([existingTranslation({ qdb_translated_value: 'اسم' })]);

    const summary = await createTranslationImportService(api).apply(
      workbook({ ar: 'الاسم الكامل' }),
      { dryRun: false },
    );

    expect(summary).toMatchObject({ created: 0, updated: 1 });
  });

  it('apply_updatesATranslation_whenOnlyTheSourceMovedOn', async () => {
    const api = orgWith([existingTranslation({ qdb_source_value: 'Complete name' })]);

    const summary = await createTranslationImportService(api).apply(
      workbook({ ar: 'الاسم الكامل' }),
      { dryRun: false },
    );

    expect(summary).toMatchObject({ updated: 1 });
  });

  it('apply_writesNothing_whenValueAndSnapshotBothMatch', async () => {
    const api = orgWith([existingTranslation()]);

    const summary = await createTranslationImportService(api).apply(
      workbook({ ar: 'الاسم الكامل' }),
      { dryRun: false },
    );

    expect(summary).toMatchObject({ unchanged: 1 });
    expect(api.writes).toBe(0);
  });

  it('apply_leavesAnExistingTranslationAlone_whenTheCellIsBlank', async () => {
    const api = orgWith([existingTranslation()]);

    const summary = await createTranslationImportService(api).apply(workbook({ ar: '' }), {
      dryRun: false,
    });

    expect(summary).toMatchObject({ blank: 1, created: 0, updated: 0 });
    expect(api.writes).toBe(0);
  });

  it('apply_writesNothing_onADryRun', async () => {
    const api = orgWith();

    const summary = await createTranslationImportService(api).apply(
      workbook({ ar: 'الاسم الكامل' }),
      { dryRun: true },
    );

    expect(summary).toMatchObject({ created: 1, dryRun: true });
    expect(api.writes).toBe(0);
  });

  it('apply_aborts_whenARowPointsAtARecordThatNoLongerExists', async () => {
    const api = new FakeWebApi({ qdb_form_field: [], [ENTITY_NAMES.TRANSLATION]: [] });

    await expect(
      createTranslationImportService(api).apply(workbook({ ar: 'الاسم الكامل' }), { dryRun: false }),
    ).rejects.toBeInstanceOf(UnresolvedRecordsError);
  });

  it('apply_writesNothingAtAll_whenAnyRowFailsToResolve', async () => {
    const api = new FakeWebApi({ qdb_form_field: [], [ENTITY_NAMES.TRANSLATION]: [] });

    await createTranslationImportService(api)
      .apply(workbook({ ar: 'الاسم الكامل' }), { dryRun: false })
      .catch(() => undefined);

    expect(api.writes).toBe(0);
  });

  it('apply_namesTheUnresolvedRecords_soTheyCanBeFound', async () => {
    const api = new FakeWebApi({ qdb_form_field: [], [ENTITY_NAMES.TRANSLATION]: [] });

    const error = await createTranslationImportService(api)
      .apply(workbook({ ar: 'الاسم الكامل' }), { dryRun: false })
      .then(() => null)
      .catch((thrown: unknown) => thrown as UnresolvedRecordsError);

    expect(error?.unresolved).toEqual([`qdb_form_field(${FIELD_ID})`]);
  });
});
