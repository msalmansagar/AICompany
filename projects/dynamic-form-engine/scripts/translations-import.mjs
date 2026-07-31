/**
 * Import translations from the exported workbook back into qdb_translation.
 *
 *   node --env-file=scripts/.env scripts/translations-import.mjs <file.xlsx> [--dry-run]
 *
 * Non-destructive by design:
 *   · a blank cell leaves the existing translation alone — it never means "delete"
 *   · a filled cell creates or updates that language's translation
 *   · nothing is ever deleted by an import; removing a translation stays a deliberate act
 *
 * Each write also stores the source text it was translated from, so a later export can flag
 * translations whose English has since changed.
 *
 * A row whose key no longer resolves to a real record FAILS LOUDLY naming the row rather
 * than being skipped in silence — a quietly dropped row is how translations go missing.
 */
import ExcelJS from 'exceljs';
import { resolve } from 'node:path';
import { API, acquireToken, headers, get, loadTranslations, translationKey } from './translations-lib.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const FIXED_COLUMNS = ['Entity', 'Record Id', 'Field', 'Where', 'Source (en)', 'Source changed?'];

async function upsert(H, existing, row, language, value) {
  const key = translationKey(row.entity, row.recordId, row.field, language);
  const found = existing.get(key);

  const payload = {
    qdb_entity_name: row.entity,
    qdb_record_id: row.recordId,
    qdb_field_name: row.field,
    qdb_language_code: language,
    qdb_translated_value: value,
    qdb_source_value: row.source,
    qdb_is_active: true,
  };

  if (found) {
    if (found.qdb_translated_value === value && found.qdb_source_value === row.source) return 'unchanged';
    if (DRY_RUN) return 'update';
    const r = await fetch(`${API}/qdb_translations(${found.qdb_translationid})`, {
      method: 'PATCH', headers: H, body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error(`update ${key}: ${(await r.text()).slice(0, 200)}`);
    return 'update';
  }

  if (DRY_RUN) return 'create';
  const r = await fetch(`${API}/qdb_translations`, { method: 'POST', headers: H, body: JSON.stringify(payload) });
  if (!r.ok) throw new Error(`create ${key}: ${(await r.text()).slice(0, 200)}`);
  return 'create';
}

async function run() {
  const filePath = process.argv[2];
  if (!filePath || filePath.startsWith('--')) {
    throw new Error('Usage: translations-import.mjs <file.xlsx> [--dry-run]');
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(resolve(filePath));
  const sheet = workbook.getWorksheet('Translations');
  if (!sheet) throw new Error("Workbook has no 'Translations' sheet — is this the exported file?");

  const header = sheet.getRow(1).values.slice(1).map((v) => String(v ?? '').trim());
  const languages = header.slice(FIXED_COLUMNS.length).filter(Boolean);
  if (!languages.length) throw new Error('No language columns found after the fixed columns.');

  const H = headers(await acquireToken());
  console.log(`${DRY_RUN ? 'DRY RUN — ' : ''}Importing ${filePath}`);
  console.log(`Languages: ${languages.join(', ')}\n`);

  const rows = [];
  sheet.eachRow((excelRow, index) => {
    if (index === 1) return;
    const cells = excelRow.values;
    const row = {
      line: index,
      entity: String(cells[1] ?? '').trim(),
      recordId: String(cells[2] ?? '').trim(),
      field: String(cells[3] ?? '').trim(),
      source: String(cells[5] ?? '').trim(),
      values: {},
    };
    languages.forEach((code, i) => {
      const raw = cells[FIXED_COLUMNS.length + 1 + i];
      const text = raw && typeof raw === 'object' ? (raw.text ?? raw.result ?? '') : raw;
      row.values[code] = String(text ?? '').trim();
    });
    if (row.entity && row.recordId && row.field) rows.push(row);
  });

  const existing = await loadTranslations(H, [...new Set(rows.map((r) => r.recordId))]);

  // Verify every key still points at a real record before writing anything.
  const problems = [];
  const seen = new Map();
  for (const row of rows) {
    const cacheKey = `${row.entity}|${row.recordId}`;
    if (!seen.has(cacheKey)) {
      try {
        const meta = await get(H, `EntityDefinitions(LogicalName='${row.entity}')?$select=EntitySetName`);
        const check = await fetch(`${API}/${meta.EntitySetName}(${row.recordId})?$select=${row.field}`, { headers: H });
        seen.set(cacheKey, check.ok);
      } catch { seen.set(cacheKey, false); }
    }
    if (!seen.get(cacheKey)) problems.push(`row ${row.line}: ${row.entity}(${row.recordId}) does not resolve`);
  }
  if (problems.length) {
    console.error(`${problems.length} row(s) reference records that no longer exist:`);
    for (const p of problems.slice(0, 10)) console.error(`   ${p}`);
    throw new Error('Import aborted — no changes written. Re-export the form and redo the edits.');
  }

  const tally = { create: 0, update: 0, unchanged: 0, blank: 0 };
  for (const row of rows) {
    for (const code of languages) {
      const value = row.values[code];
      if (!value) { tally.blank++; continue; }   // blank never deletes
      tally[await upsert(H, existing, row, code, value)]++;
    }
  }

  console.log(`rows read      : ${rows.length}`);
  console.log(`created        : ${tally.create}`);
  console.log(`updated        : ${tally.update}`);
  console.log(`already current: ${tally.unchanged}`);
  console.log(`left untouched : ${tally.blank}  (blank cells)`);
  if (DRY_RUN) console.log('\nDry run — nothing was written. Re-run without --dry-run to apply.');
  else console.log('\nRepublish the form to regenerate its JSON in the new language.');
}

run().catch((e) => { console.error('\nIMPORT FAILED:', e.message); process.exit(1); });
