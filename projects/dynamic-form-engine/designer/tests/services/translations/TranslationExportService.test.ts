import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { createTranslationExportService } from '@/services/translations/TranslationExportService';
import { ENTITY_NAMES } from '@/constants/entityNames';
import { FakeWebApi } from './fakeWebApi';

const FORM_ID = '11111111-1111-1111-1111-111111111111';
const TAB_ID = '22222222-2222-2222-2222-222222222222';

function orgWith(overrides: Record<string, Record<string, unknown>[]> = {}): FakeWebApi {
  return new FakeWebApi({
    qdb_form_definition: [
      { qdb_form_definitionid: FORM_ID, qdb_title: 'Loan Application', qdb_form_code: 'loan' },
    ],
    qdb_form_tab: [{ qdb_form_tabid: TAB_ID, qdb_label: 'Applicant', qdb_schema_name: 'tab_1' }],
    [ENTITY_NAMES.LANGUAGE_CONFIG]: [
      { qdb_language_code: 'en', qdb_is_default: true, qdb_rtl_direction: false },
      { qdb_language_code: 'ar', qdb_is_default: false, qdb_rtl_direction: true },
    ],
    [ENTITY_NAMES.TRANSLATION]: [],
    ...overrides,
  });
}

describe('TranslationExportService', () => {
  it('exportForm_countsEveryStringItFound', async () => {
    const result = await createTranslationExportService(orgWith()).exportForm(FORM_ID, 'loan');

    expect(result.stringCount).toBe(2);
  });

  it('exportForm_namesTheTargetLanguages_excludingTheSource', async () => {
    const result = await createTranslationExportService(orgWith()).exportForm(FORM_ID, 'loan');

    expect(result.languages).toEqual(['ar']);
  });

  it('exportForm_producesAReadableWorkbook', async () => {
    const result = await createTranslationExportService(orgWith()).exportForm(FORM_ID, 'loan');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    expect(workbook.getWorksheet('Translations')?.rowCount).toBe(3);
  });

  it('exportForm_reportsUnverifiedRows_forTranslationsWithNoSnapshot', async () => {
    const org = orgWith({
      [ENTITY_NAMES.TRANSLATION]: [
        {
          qdb_entity_name: 'qdb_form_tab',
          qdb_record_id: TAB_ID,
          qdb_field_name: 'qdb_label',
          qdb_language_code: 'ar',
          qdb_translated_value: 'مقدم الطلب',
          qdb_source_value: null,
        },
      ],
    });

    const result = await createTranslationExportService(org).exportForm(FORM_ID, 'loan');

    expect(result).toMatchObject({ changedCount: 0, unverifiedCount: 1 });
  });

  it('exportForm_surfacesSkippedTables_ratherThanReturningAShortWorkbookSilently', async () => {
    const org = new FakeWebApi(
      {
        qdb_form_definition: [{ qdb_form_definitionid: FORM_ID, qdb_title: 'Loan Application' }],
        [ENTITY_NAMES.LANGUAGE_CONFIG]: [
          { qdb_language_code: 'en', qdb_is_default: true },
          { qdb_language_code: 'ar', qdb_is_default: false },
        ],
        [ENTITY_NAMES.TRANSLATION]: [],
      },
      { qdb_info_card_screen: new Error('Resource not found for the segment') },
    );

    const result = await createTranslationExportService(org).exportForm(FORM_ID, 'loan');

    expect(result.skipped).toContainEqual({
      entity: 'qdb_info_card_screen',
      reason: 'Resource not found for the segment',
    });
  });

  it('exportForm_buildsAFileName_fromTheFormCode', async () => {
    const result = await createTranslationExportService(orgWith()).exportForm(FORM_ID, 'loan');

    expect(result.fileName).toBe('translations-loan.xlsx');
  });

  it('exportForm_stripsCharactersAFileSystemWouldReject_fromTheFormCode', async () => {
    const result = await createTranslationExportService(orgWith()).exportForm(FORM_ID, 'a/b c:d');

    expect(result.fileName).toBe('translations-a-b-c-d.xlsx');
  });
});
