import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { buildTranslationWorkbook } from '@/services/translations/translationWorkbook';
import { translationKey, type TranslatableString } from '@/services/translations/translatableSpec';
import type { ExistingTranslation } from '@/services/translations/ExistingTranslationsReader';

const RECORD_ID = '44444444-4444-4444-4444-444444444444';
const RECORD_ID_COLUMN = 2;
const SOURCE_COLUMN = 5;
const STALE_COLUMN = 6;
const ARABIC_COLUMN = 7;

const ROW: TranslatableString = {
  entity: 'qdb_form_field',
  recordId: RECORD_ID,
  field: 'qdb_label',
  source: 'Full name',
  context: 'fld_name',
};

function existingWith(translation: Partial<ExistingTranslation>): Map<string, ExistingTranslation> {
  return new Map([
    [
      translationKey(ROW.entity, ROW.recordId, ROW.field, 'ar'),
      { value: 'الاسم الكامل', sourceSnapshot: 'Full name', ...translation },
    ],
  ]);
}

async function build(existing: Map<string, ExistingTranslation>) {
  const built = await buildTranslationWorkbook({
    rows: [ROW],
    languages: [{ code: 'ar', isRtl: true }],
    existing,
    sourceLanguage: 'en',
  });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(built.buffer);
  return { built, sheet: workbook.getWorksheet('Translations')! };
}

describe('buildTranslationWorkbook', () => {
  it('build_leavesTheStateBlank_whenTheSnapshotMatchesTheSource', async () => {
    const { sheet } = await build(existingWith({}));

    expect(sheet.getRow(2).getCell(STALE_COLUMN).value ?? '').toBe('');
  });

  it('build_reportsYes_whenTheSourceMovedOnAfterTranslating', async () => {
    const { sheet } = await build(existingWith({ sourceSnapshot: 'Complete name' }));

    expect(sheet.getRow(2).getCell(STALE_COLUMN).value).toBe('YES (ar)');
  });

  it('build_reportsUnknown_whenThereIsNoSnapshotToCompare', async () => {
    const { sheet } = await build(existingWith({ sourceSnapshot: '' }));

    expect(sheet.getRow(2).getCell(STALE_COLUMN).value).toBe('UNKNOWN (ar)');
  });

  it('build_leavesTheStateBlank_whenNothingIsTranslatedYet', async () => {
    const { sheet } = await build(new Map());

    expect(sheet.getRow(2).getCell(STALE_COLUMN).value ?? '').toBe('');
  });

  it('build_countsChangedRows_separatelyFromUnverifiedOnes', async () => {
    const { built } = await build(existingWith({ sourceSnapshot: 'Complete name' }));

    expect(built).toMatchObject({ changedCount: 1, unverifiedCount: 0 });
  });

  it('build_countsUnverifiedRows_whenNoSnapshotExists', async () => {
    const { built } = await build(existingWith({ sourceSnapshot: '' }));

    expect(built).toMatchObject({ changedCount: 0, unverifiedCount: 1 });
  });

  it('build_writesTheExistingTranslation_intoTheLanguageColumn', async () => {
    const { sheet } = await build(existingWith({}));

    expect(sheet.getRow(2).getCell(ARABIC_COLUMN).value).toBe("الاسم الكامل");
  });

  // Column keys do not survive a save/load round trip in exceljs, so the reloaded sheet is
  // addressed by index — which is also what a translator's Excel sees.
  it('build_unlocksLanguageColumns_soTheWorkbookCanBeTypedInto', async () => {
    const { sheet } = await build(existingWith({}));

    expect(sheet.getColumn(ARABIC_COLUMN).protection?.locked).toBe(false);
  });

  it('build_leavesKeyColumnsLocked_soTheRoundTripCannotBeBrokenByEditingThem', async () => {
    const { sheet } = await build(existingWith({}));

    // Locked is the OOXML default under sheet protection, so it is never written out as
    // locked="1". What must not happen is the key column being explicitly unlocked.
    expect(sheet.getColumn(RECORD_ID_COLUMN).protection?.locked).not.toBe(false);
  });

  it('build_setsRightToLeftReadingOrder_forAnRtlLanguage', async () => {
    const { sheet } = await build(existingWith({}));

    expect(sheet.getColumn(ARABIC_COLUMN).alignment?.readingOrder).toBe('rtl');
  });

  it('build_namesTheSourceColumn_afterTheSourceLanguage', async () => {
    const { sheet } = await build(existingWith({}));

    expect(sheet.getRow(1).getCell(SOURCE_COLUMN).value).toBe('Source (en)');
  });
});
