import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  parseTranslationWorkbook,
  TranslationWorkbookFormatError,
} from '@/services/translations/translationWorkbookParser';

const RECORD_ID = '44444444-4444-4444-4444-444444444444';
const HEADER = ['Entity', 'Record Id', 'Field', 'Where', 'Source (en)', 'Source changed?', 'ar'];

async function workbookOf(
  rows: unknown[][],
  header: unknown[] = HEADER,
  sheetName = 'Translations',
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.addRow(header);
  for (const row of rows) sheet.addRow(row);
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

const FILLED_ROW: unknown[] = [
  'qdb_form_field', RECORD_ID, 'qdb_label', 'fld_name', 'Full name', '', 'الاسم الكامل',
];

describe('parseTranslationWorkbook', () => {
  it('parse_readsLanguageCodes_fromTheColumnsAfterTheFixedOnes', async () => {
    const parsed = await parseTranslationWorkbook(await workbookOf([FILLED_ROW]));

    expect(parsed.languages).toEqual(['ar']);
  });

  it('parse_readsEveryLanguage_whenTheOrgHasMoreThanOne', async () => {
    const parsed = await parseTranslationWorkbook(
      await workbookOf([[...FILLED_ROW, 'Nom complet']], [...HEADER, 'fr']),
    );

    expect(parsed.languages).toEqual(['ar', 'fr']);
  });

  it('parse_returnsTheTranslatedValue_againstItsLanguage', async () => {
    const parsed = await parseTranslationWorkbook(await workbookOf([FILLED_ROW]));

    expect(parsed.rows[0].values.ar).toBe('الاسم الكامل');
  });

  it('parse_keepsSourceTextVerbatim_soTheSnapshotStillCompares', async () => {
    const padded = [...FILLED_ROW];
    padded[4] = '💼 ';

    const parsed = await parseTranslationWorkbook(await workbookOf([padded]));

    expect(parsed.rows[0].source).toBe('💼 ');
  });

  it('parse_trimsTranslatedValues_soStrayTypingDoesNotCountAsAChange', async () => {
    const padded = [...FILLED_ROW];
    padded[6] = '  الاسم الكامل  ';

    const parsed = await parseTranslationWorkbook(await workbookOf([padded]));

    expect(parsed.rows[0].values.ar).toBe('الاسم الكامل');
  });

  it('parse_skipsRows_whoseKeyIsIncomplete', async () => {
    const parsed = await parseTranslationWorkbook(
      await workbookOf([FILLED_ROW, ['qdb_form_field', '', 'qdb_label', '', 'Orphan', '', 'x']]),
    );

    expect(parsed.rows).toHaveLength(1);
  });

  it('parse_reportsBlankCells_asEmptyRatherThanMissing', async () => {
    const blank = [...FILLED_ROW];
    blank[6] = '';

    const parsed = await parseTranslationWorkbook(await workbookOf([blank]));

    expect(parsed.rows[0].values.ar).toBe('');
  });

  it('parse_readsRichTextCells_asTheirText', async () => {
    const rich = [...FILLED_ROW];
    rich[6] = { richText: [{ text: 'الاسم' }, { text: ' الكامل' }] };

    const parsed = await parseTranslationWorkbook(await workbookOf([rich]));

    expect(parsed.rows[0].values.ar).toBe('الاسم الكامل');
  });

  it('parse_rejectsAWorkbook_withNoTranslationsSheet', async () => {
    await expect(
      parseTranslationWorkbook(await workbookOf([FILLED_ROW], HEADER, 'Sheet1')),
    ).rejects.toBeInstanceOf(TranslationWorkbookFormatError);
  });

  it('parse_rejectsAWorkbook_withNoLanguageColumns', async () => {
    await expect(
      parseTranslationWorkbook(await workbookOf([FILLED_ROW.slice(0, 6)], HEADER.slice(0, 6))),
    ).rejects.toBeInstanceOf(TranslationWorkbookFormatError);
  });
});
