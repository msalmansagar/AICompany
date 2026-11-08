// Reads a filled workbook back into rows. Pure: no Dataverse access, so the parsing rules can
// be asserted without an org.
//
// The language columns are whatever follows the fixed columns, so an org adding a language
// needs no change here. Their headers are the language codes the export wrote.
//
// Mirrors scripts/translations-import.mjs.

import ExcelJS from 'exceljs';

const SHEET_NAME = 'Translations';
/** Entity, Record Id, Field, Where, Source, Source changed? — then one column per language. */
const FIXED_COLUMN_COUNT = 6;
const ENTITY_COLUMN = 1;
const RECORD_ID_COLUMN = 2;
const FIELD_COLUMN = 3;
const SOURCE_COLUMN = 5;

export interface ParsedTranslationRow {
  /** Worksheet row number, so a problem can be reported where the translator can see it. */
  readonly line: number;
  readonly entity: string;
  readonly recordId: string;
  readonly field: string;
  readonly source: string;
  /** Language code to the value in that column. Blank means "not filled in". */
  readonly values: Readonly<Record<string, string>>;
}

export interface ParsedTranslationWorkbook {
  readonly languages: readonly string[];
  readonly rows: readonly ParsedTranslationRow[];
}

export class TranslationWorkbookFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationWorkbookFormatError';
  }
}

export async function parseTranslationWorkbook(
  data: ArrayBuffer,
): Promise<ParsedTranslationWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new TranslationWorkbookFormatError(
      `Workbook has no '${SHEET_NAME}' sheet — is this the file the export produced?`,
    );
  }

  const languages = readLanguageHeaders(sheet);
  if (!languages.length) {
    throw new TranslationWorkbookFormatError(
      'No language columns found after the fixed columns — nothing could be imported from this file.',
    );
  }

  return { languages, rows: readRows(sheet, languages) };
}

function readLanguageHeaders(sheet: ExcelJS.Worksheet): string[] {
  const header = sheet.getRow(1).values;
  if (!Array.isArray(header)) return [];

  return header
    .slice(1 + FIXED_COLUMN_COUNT)
    .map((value) => cellText(value).trim())
    .filter((code) => code !== '');
}

function readRows(
  sheet: ExcelJS.Worksheet,
  languages: readonly string[],
): ParsedTranslationRow[] {
  const rows: ParsedTranslationRow[] = [];

  sheet.eachRow((row, line) => {
    if (line === 1) return;

    const cells = Array.isArray(row.values) ? row.values : [];
    const parsed = toRow(cells, languages, line);
    // A row missing part of its key cannot be matched to anything, so it is not a row.
    if (parsed.entity && parsed.recordId && parsed.field) rows.push(parsed);
  });

  return rows;
}

function toRow(
  cells: readonly unknown[],
  languages: readonly string[],
  line: number,
): ParsedTranslationRow {
  const values: Record<string, string> = {};
  languages.forEach((code, index) => {
    values[code] = cellText(cells[1 + FIXED_COLUMN_COUNT + index]).trim();
  });

  return {
    line,
    entity: cellText(cells[ENTITY_COLUMN]).trim(),
    recordId: cellText(cells[RECORD_ID_COLUMN]).trim(),
    field: cellText(cells[FIELD_COLUMN]).trim(),
    // Not trimmed: this becomes the source snapshot and is compared byte for byte against the
    // CRM value on the next export. Trimming it flags every padded label as stale.
    source: cellText(cells[SOURCE_COLUMN]),
    values,
  };
}

/**
 * Excel hands back a string, a rich-text run list, a hyperlink or a formula result depending on
 * how the cell was filled. Rich text is what a translator gets by pasting from Word or by
 * styling part of a cell, and reading it as empty would silently discard their work.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);

  const cell = value as { richText?: unknown; text?: unknown; result?: unknown };
  if (Array.isArray(cell.richText)) {
    return cell.richText.map((run) => String((run as { text?: unknown }).text ?? '')).join('');
  }
  if (cell.text !== undefined) return String(cell.text);
  if (cell.result !== undefined) return String(cell.result);
  return '';
}
