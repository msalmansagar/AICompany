/**
 * Export every translatable string on a form to an Excel workbook.
 *
 *   node --env-file=scripts/.env scripts/translations-export.mjs <formCode|formGuid> [out.xlsx]
 *
 * One row per string. The first three columns are the translation key and are locked — the
 * import matches on them, so an edit there breaks the round trip. Context columns are there
 * so a translator is not working blind: "Name" means nothing without knowing where it sits.
 *
 * A language column is emitted for every active language in the org, so Arabic and anything
 * added later are translated in the same pass.
 *
 * STALE DETECTION: each translation records the source text it was made from. When the
 * English later changes, the export flags that row — otherwise the translation silently
 * stays wrong and nobody notices until a user sees it.
 */
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import {
  acquireToken, headers, collectRecords, buildRows, loadTranslations,
  translationKey, activeLanguages, resolveForm,
} from './translations-lib.mjs';

const SOURCE_LANGUAGE = 'en';
const KEY_COLUMNS = 3;

async function run() {
  const formRef = process.argv[2];
  if (!formRef) throw new Error('Usage: translations-export.mjs <formCode|formGuid> [out.xlsx]');

  const H = headers(await acquireToken());
  const form = await resolveForm(H, formRef);
  const formId = form.qdb_form_definitionid;
  const outPath = resolve(process.argv[3] ?? `translations-${form.qdb_form_code}.xlsx`);

  console.log(`Form: ${form.qdb_form_code} — ${form.qdb_title}`);

  const byEntity = await collectRecords(H, formId);
  const rows = buildRows(byEntity);
  const languages = await activeLanguages(H, SOURCE_LANGUAGE);
  const existing = await loadTranslations(H, [...new Set(rows.map((r) => r.recordId))]);

  console.log(`Strings: ${rows.length}   languages: ${languages.join(', ') || '(none configured)'}`);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Translations', {
    views: [{ state: 'frozen', xSplit: KEY_COLUMNS, ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Entity', key: 'entity', width: 26 },
    { header: 'Record Id', key: 'recordId', width: 38 },
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Where', key: 'context', width: 24 },
    { header: `Source (${SOURCE_LANGUAGE})`, key: 'source', width: 46 },
    { header: 'Source changed?', key: 'stale', width: 16 },
    ...languages.map((code) => ({ header: code, key: `lang_${code}`, width: 46 })),
  ];

  sheet.getRow(1).font = { bold: true };

  let staleCount = 0;
  for (const row of rows) {
    const values = { ...row, stale: '' };
    const notes = [];

    for (const code of languages) {
      const found = existing.get(translationKey(row.entity, row.recordId, row.field, code));
      values[`lang_${code}`] = found?.qdb_translated_value ?? '';

      // Flag only where a translation exists and the source has moved on since.
      const snapshot = found?.qdb_source_value;
      if (found?.qdb_translated_value && snapshot && snapshot !== row.source) notes.push(code);
    }

    if (notes.length) { values.stale = `YES (${notes.join(', ')})`; staleCount++; }
    const added = sheet.addRow(values);
    if (notes.length) added.getCell('stale').font = { bold: true, color: { argb: 'FFC00000' } };
  }

  // Arabic reads right to left; without this a translator sees the text mis-ordered.
  for (const code of languages) {
    if (code.toLowerCase().startsWith('ar')) {
      sheet.getColumn(`lang_${code}`).alignment = { readingOrder: 'rtl', horizontal: 'right' };
    }
  }

  // The key columns drive the import. Locking them makes a broken round trip much less likely.
  sheet.getColumn('entity').protection = { locked: true };
  sheet.getColumn('recordId').protection = { locked: true };
  sheet.getColumn('field').protection = { locked: true };
  sheet.getColumn('context').protection = { locked: true };
  sheet.getColumn('source').protection = { locked: true };
  await sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true });

  await workbook.xlsx.writeFile(outPath);

  console.log(`\nWrote ${outPath}`);
  if (staleCount) console.log(`${staleCount} row(s) flagged — their English changed after the translation was made.`);
  console.log('\nFill in the language columns, then:');
  console.log(`  node --env-file=scripts/.env scripts/translations-import.mjs "${outPath}" --dry-run`);
}

run().catch((e) => { console.error('\nEXPORT FAILED:', e.message); process.exit(1); });
