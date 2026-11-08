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
 *
 * Translations made before that snapshot existed carry no source text, so they cannot be
 * compared to anything. Those are reported UNKNOWN rather than left blank: blank means
 * "compared, still current", and letting an uncomparable row claim that is the exact silence
 * this is here to prevent. UNKNOWN clears itself the first time the row goes through an import.
 */
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import {
  acquireToken, headers, collectRecords, buildRows, loadTranslations,
  translationKey, activeLanguages, resolveForm,
} from './translations-lib.mjs';

const SOURCE_LANGUAGE = 'en';
const KEY_COLUMNS = 3;
const CHANGED_FONT = { bold: true, color: { argb: 'FFC00000' } };
const UNVERIFIED_FONT = { color: { argb: 'FF9C6500' } };

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

  const codes = languages.map((l) => l.code);
  console.log(`Strings: ${rows.length}   languages: ${codes.join(', ') || '(none configured)'}`);

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
    { header: 'Source changed?', key: 'stale', width: 24 },
    ...codes.map((code) => ({ header: code, key: `lang_${code}`, width: 46 })),
  ];

  sheet.getRow(1).font = { bold: true };

  let changedCount = 0;
  let unverifiedCount = 0;
  for (const row of rows) {
    const state = sourceState(row, codes, existing);
    const added = sheet.addRow({
      ...row,
      ...languageValues(row, codes, existing),
      stale: describeState(state),
    });

    if (state.changed.length) {
      added.getCell('stale').font = CHANGED_FONT;
      changedCount++;
    } else if (state.unverified.length) {
      added.getCell('stale').font = UNVERIFIED_FONT;
      unverifiedCount++;
    }
  }

  // Right-to-left languages read wrong in a left-aligned column. Which ones those are is
  // configuration in qdb_language_config, not something to infer from the language code.
  for (const { code, isRtl } of languages) {
    if (isRtl) {
      sheet.getColumn(`lang_${code}`).alignment = { readingOrder: 'rtl', horizontal: 'right' };
    }
  }

  // Under sheet protection a cell is locked unless it says otherwise — the OOXML default. So
  // the language columns have to be unlocked explicitly, or the translator opens a workbook
  // they cannot type a single character into. Locking the key columns is the easy half.
  for (const { code } of languages) {
    sheet.getColumn(`lang_${code}`).protection = { locked: false };
  }

  sheet.getColumn('entity').protection = { locked: true };
  sheet.getColumn('recordId').protection = { locked: true };
  sheet.getColumn('field').protection = { locked: true };
  sheet.getColumn('context').protection = { locked: true };
  sheet.getColumn('source').protection = { locked: true };
  await sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true });

  await workbook.xlsx.writeFile(outPath);

  console.log(`\nWrote ${outPath}`);
  if (changedCount) console.log(`${changedCount} row(s) flagged — their English changed after the translation was made.`);
  if (unverifiedCount) {
    console.log(`${unverifiedCount} row(s) UNKNOWN — translated before source snapshots existed, so staleness cannot be`);
    console.log('  determined. Importing the row once records a snapshot and clears it.');
  }
  console.log('\nFill in the language columns, then:');
  console.log(`  node --env-file=scripts/.env scripts/translations-import.mjs "${outPath}" --dry-run`);
}

/**
 * Per language, how each existing translation stands against the current English.
 * A language with no translation at all is absent from both lists — there is nothing
 * to be stale about, and the empty cell already says "translate me".
 */
function sourceState(row, languages, existing) {
  const changed = [];
  const unverified = [];

  for (const code of languages) {
    const found = existing.get(translationKey(row.entity, row.recordId, row.field, code));
    if (!found?.qdb_translated_value) continue;

    const snapshot = found.qdb_source_value;
    if (!snapshot) unverified.push(code);
    else if (snapshot !== row.source) changed.push(code);
  }

  return { changed, unverified };
}

/** Both states can appear on one row when the org has more than one language. */
function describeState({ changed, unverified }) {
  const parts = [];
  if (changed.length) parts.push(`YES (${changed.join(', ')})`);
  if (unverified.length) parts.push(`UNKNOWN (${unverified.join(', ')})`);
  return parts.join('  ');
}

function languageValues(row, languages, existing) {
  const values = {};
  for (const code of languages) {
    const found = existing.get(translationKey(row.entity, row.recordId, row.field, code));
    values[`lang_${code}`] = found?.qdb_translated_value ?? '';
  }
  return values;
}

run().catch((e) => { console.error('\nEXPORT FAILED:', e.message); process.exit(1); });
