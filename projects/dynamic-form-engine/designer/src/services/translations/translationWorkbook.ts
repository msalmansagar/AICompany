// Builds the translator-facing workbook: one row per translatable string, one column per
// target language.
//
// The first columns are the translation key. The import matches on them, so they are locked
// and the sheet is protected — an edited key silently breaks the round trip, and a translator
// has no way to know they have done it.
//
// Mirrors scripts/translations-export.mjs, which produces the same sheet headlessly.

import ExcelJS from 'exceljs';
import type { TranslatableString } from './translatableSpec';
import { translationKey } from './translatableSpec';
import type { ExportLanguage } from './LanguageConfigService';
import type { ExistingTranslation } from './ExistingTranslationsReader';
import { sourceStateOf, describeSourceState, type SourceState } from './sourceState';

const SHEET_NAME = 'Translations';
/** Entity, Record Id and Field identify the row; freezing them keeps them visible while scrolling. */
const KEY_COLUMN_COUNT = 3;
const LOCKED_COLUMNS = ['entity', 'recordId', 'field', 'context', 'source'];
const CHANGED_FONT = { bold: true, color: { argb: 'FFC00000' } };
const UNVERIFIED_FONT = { color: { argb: 'FF9C6500' } };

export interface WorkbookInput {
  readonly rows: readonly TranslatableString[];
  readonly languages: readonly ExportLanguage[];
  readonly existing: ReadonlyMap<string, ExistingTranslation>;
  readonly sourceLanguage: string;
}

export interface BuiltWorkbook {
  readonly buffer: ArrayBuffer;
  /** Rows whose English moved on after translating. */
  readonly changedCount: number;
  /** Rows carrying no snapshot, so staleness cannot be determined either way. */
  readonly unverifiedCount: number;
}

export async function buildTranslationWorkbook(input: WorkbookInput): Promise<BuiltWorkbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME, {
    views: [{ state: 'frozen', xSplit: KEY_COLUMN_COUNT, ySplit: 1 }],
  });

  sheet.columns = defineColumns(input);
  sheet.getRow(1).font = { bold: true };

  const counts = appendRows(sheet, input);
  applyReadingOrder(sheet, input.languages);
  await applyProtection(sheet, input.languages);

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer: buffer as ArrayBuffer, ...counts };
}

function defineColumns({ languages, sourceLanguage }: WorkbookInput): Partial<ExcelJS.Column>[] {
  return [
    { header: 'Entity', key: 'entity', width: 26 },
    { header: 'Record Id', key: 'recordId', width: 38 },
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Where', key: 'context', width: 24 },
    { header: `Source (${sourceLanguage})`, key: 'source', width: 46 },
    { header: 'Source changed?', key: 'stale', width: 24 },
    ...languages.map(({ code }) => ({ header: code, key: `lang_${code}`, width: 46 })),
  ];
}

function appendRows(
  sheet: ExcelJS.Worksheet,
  input: WorkbookInput,
): { changedCount: number; unverifiedCount: number } {
  const codes = input.languages.map(({ code }) => code);
  let changedCount = 0;
  let unverifiedCount = 0;

  for (const row of input.rows) {
    const state = sourceStateOf(row, codes, input.existing);
    const added = sheet.addRow({
      ...row,
      ...translatedValues(row, codes, input.existing),
      stale: describeSourceState(state),
    });

    applyStateFont(added, state);
    if (state.changed.length) changedCount++;
    else if (state.unverified.length) unverifiedCount++;
  }

  return { changedCount, unverifiedCount };
}

function translatedValues(
  row: TranslatableString,
  codes: readonly string[],
  existing: ReadonlyMap<string, ExistingTranslation>,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const code of codes) {
    const found = existing.get(translationKey(row.entity, row.recordId, row.field, code));
    values[`lang_${code}`] = found?.value ?? '';
  }
  return values;
}

function applyStateFont(row: ExcelJS.Row, state: SourceState): void {
  if (state.changed.length) row.getCell('stale').font = CHANGED_FONT;
  else if (state.unverified.length) row.getCell('stale').font = UNVERIFIED_FONT;
}

/** Without this a translator sees right-to-left text laid out left to right, and mis-reads it. */
function applyReadingOrder(sheet: ExcelJS.Worksheet, languages: readonly ExportLanguage[]): void {
  for (const { code, isRtl } of languages) {
    if (!isRtl) continue;
    sheet.getColumn(`lang_${code}`).alignment = { readingOrder: 'rtl', horizontal: 'right' };
  }
}

/**
 * Under sheet protection a cell is locked unless it says otherwise — that is the OOXML default,
 * not exceljs behaviour. Locking the key columns is therefore not the part that needs saying:
 * the language columns must be unlocked explicitly, or the translator opens a workbook they
 * cannot type a single character into.
 */
async function applyProtection(
  sheet: ExcelJS.Worksheet,
  languages: readonly ExportLanguage[],
): Promise<void> {
  for (const key of LOCKED_COLUMNS) {
    sheet.getColumn(key).protection = { locked: true };
  }
  for (const { code } of languages) {
    sheet.getColumn(`lang_${code}`).protection = { locked: false };
  }

  await sheet.protect('', {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
  });
}
