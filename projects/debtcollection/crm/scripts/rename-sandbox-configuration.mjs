/**
 * rename-sandbox-configuration.mjs — removes internal delivery wording from the names officers read
 * in the cloud sandbox: "Call (P6-synthetic)" becomes "Call", "P7 synthetic — overdue reminder
 * (English)" becomes "Overdue reminder (English)".
 *
 *   node crm/scripts/rename-sandbox-configuration.mjs [--execute]
 *
 * Only rows whose code carries a sandbox marker (P6- / P7-) are touched, and only their qdb_name. The
 * code stays, because every script matches by code — renaming is safe for re-runs and clean-ups.
 * Refuses any organisation but the sandbox. Idempotent: a clean name is reported as KEEP.
 */
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const SANDBOX_HOST = 'org5869857f';
const isExecute = process.argv.includes('--execute');

const TABLES = [
  { set: 'qdb_collectionactivitytypes', id: 'qdb_collectionactivitytypeid', marker: 'P6-' },
  { set: 'qdb_activityoutcomes', id: 'qdb_activityoutcomeid', marker: 'P6-' },
  { set: 'qdb_communicationtemplates', id: 'qdb_communicationtemplateid', marker: 'P7-' },
];

/** The one name the generic rule cannot derive: its old wording was an instruction, not a name. */
const NAMES_BY_CODE = { 'P7-SMS-UNAPPROVED-EN': 'Unapproved draft (English)' };

export function cleanName(code, name) {
  if (NAMES_BY_CODE[code]) return NAMES_BY_CODE[code];
  const stripped = name.replace(/\s*\(P\d+-synthetic\)\s*$/i, '').replace(/^P\d+ synthetic\s*[—-]\s*/i, '');
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}

const cfg = loadConfig();
if (!cfg.orgUrl.includes(SANDBOX_HOST)) {
  console.error(`[STOP] ${cfg.orgUrl} is not the sandbox (${SANDBOX_HOST}). Nothing was read or written.`);
  process.exit(2);
}
const token = await acquireToken(cfg);
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };

async function call(method, path, body) {
  const response = await fetch(cfg.apiBase + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function renameTable(table) {
  const filter = encodeURIComponent(`startswith(qdb_code,'${table.marker}')`);
  const rows = (await call('GET', `/${table.set}?$select=${table.id},qdb_code,qdb_name&$filter=${filter}`)).value;
  console.log(`\n─── ${table.set} (${rows.length} rows marked ${table.marker}) ───`);
  let changed = 0;
  for (const row of rows) {
    const name = cleanName(row.qdb_code, row.qdb_name ?? '');
    if (name === row.qdb_name) { console.log(`  [KEEP]   ${row.qdb_code}: ${name}`); continue; }
    console.log(`  [RENAME] ${row.qdb_code}: "${row.qdb_name}" → "${name}"`);
    changed++;
    if (isExecute) await call('PATCH', `/${table.set}(${row[table.id]})`, { qdb_name: name });
  }
  return changed;
}

let total = 0;
for (const table of TABLES) total += await renameTable(table);
console.log(`\n${total} row(s) ${isExecute ? 'renamed' : 'would be renamed (dry run — pass --execute to write)'} on ${cfg.orgUrl}.`);
