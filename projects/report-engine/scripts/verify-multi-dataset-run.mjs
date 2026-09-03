/* Runs a report through qdb_RunReport in the organisation and checks what actually came back.
 *
 * 🔴 A refusal arrives as HTTP 200 with errorCode/errorMessage in the BODY, not as an HTTP error.
 * Checking the status code alone reports a refusal as a pass — that mistake has been made on this
 * project before, so this script reads the body first and the status second.
 *
 * Usage: node verify-multi-dataset-run.mjs <path-to-.env> [--report "<name>"]
 */
import { connect } from './lib/dataverse.mjs';

const DEFAULT_REPORT = 'Demo — everything at once';

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : null;
}

async function findReport(dv, name) {
  const escaped = encodeURIComponent(name.replace(/'/g, "''"));
  const found = await dv.fetchJson(
    `qdb_reportdefinitions?$select=qdb_reportdefinitionid,qdb_name&$filter=qdb_name eq '${escaped}'`);
  if (!found.value.length) throw new Error(`No report named "${name}".`);
  return found.value[0];
}

/* Format must be one of run/pdf/xlsx/docx/csv/png — "json" throws "Unsupported report format". */
async function runReport(dv, reportId) {
  const response = await dv.request(dv.api('qdb_RunReport'), {
    method: 'POST',
    body: JSON.stringify({ reportId, format: 'run', parametersJson: '{}' })
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (payload.error) throw new Error(payload.error.message || payload.error.code);
  if (payload.errorCode) throw new Error(`${payload.errorCode}: ${payload.errorMessage}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (typeof payload.resultJson !== 'string') throw new Error('No resultJson came back.');

  return JSON.parse(payload.resultJson);
}

function describe(result) {
  if (!Array.isArray(result.datasets)) {
    console.log('  shape: SINGLE dataset (the historical wire format)');
    console.log(`    ${result.rowCount} row(s), ${(result.columns || []).length} column(s)`);
    return false;
  }

  console.log(`  shape: dataset COLLECTION — ${result.datasets.length} dataset(s)`);
  for (const dataset of result.datasets) {
    const columns = (dataset.columns || []).map(c => c.alias).join(', ');
    console.log(`    [${dataset.role}] ${dataset.name} — ${dataset.rowCount} row(s), ${dataset.elapsedMs} ms, ${dataset.status}`);
    console.log(`        columns: ${columns || '(none)'}`);
    if (dataset.error) console.log(`        error: ${dataset.error}`);
  }

  return true;
}

async function main() {
  const dv = await connect(process.argv[2]);
  const report = await findReport(dv, argValue('--report') || DEFAULT_REPORT);
  console.log(`Running "${report.qdb_name}" on ${dv.baseUrl}\n`);

  const result = await runReport(dv, report.qdb_reportdefinitionid);
  const isMulti = describe(result);

  const failed = (result.datasets || []).filter(d => d.status === 'failed');
  if (failed.length) {
    console.log(`\n${failed.length} dataset(s) FAILED — the report still returned, which is the design.`);
    process.exit(1);
  }

  console.log(isMulti
    ? '\nMulti-dataset execution confirmed against the organisation.'
    : '\nThis report declares one dataset, so the historical shape is correct for it.');
}

main().catch(error => {
  console.error(`\nFailed: ${error.message}`);
  process.exit(1);
});
