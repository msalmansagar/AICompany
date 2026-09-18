/**
 * load-arrear-report.mts
 * Loads the real Housing Loan Arrear Report into the sandbox, so the workspace shows the real
 * bucket distribution rather than a handful of invented rows.
 *
 * It reads the spreadsheet through the **production normalizer** — `readArrearBucket`,
 * `readDayFirstDate`, `readNumber` from `@dcp/domain` — rather than parsing the columns again here.
 * That is the point: the 1,670 rows whose `1-30` bucket the export coerced into a date are recovered
 * by the same code the MIS pipeline uses, against the same file, so the recovery is demonstrated
 * end to end instead of asserted in a unit test.
 *
 * **Identity is pseudonymised.** The report carries real customer names, Qatari ID numbers, account
 * numbers and mobile numbers for 3,778 people, and `org5869857f` is shared with other engagements.
 * The stated purpose — seeing the buckets — needs the financial figures and the bucket distribution,
 * which are loaded exactly as reported; it does not need the identities, which are replaced with
 * stable synthetic ones. Every amount, DPD, arrear date, product and deceased flag is the real value.
 *
 * Safety:
 *   • refuses to run against any organisation but the authorised sandbox;
 *   • every row carries the `ARR-` marker — distinct from `SMOKE-` and from the `DEMO-` scenario, so
 *     each set is removable without touching the others;
 *   • `--remove` takes it all out again through the guard-disable/restore/verify path;
 *   • no schema change. Data only.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/load-arrear-report.mts [--limit N] [--remove]
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { loadConfig, acquireToken, buildHeaders } from './lib/crm-client.mjs';
import { cleanSmokeData } from './clean-qdb-smoke-data.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';
import { readArrearBucket, readDayFirstDate, readNumber, readText } from '@dcp/domain';

const AUTHORISED_ORG = 'org5869857f';
const MARKER = 'ARR-';
const WORKBOOK = 'D:/QDB/Projects/Debt Collection Platform/HousingLoanArrearReport.xlsx';
const SHEET = 'Housing Loan Arrear Detailed';

/** Option values, all proven by the Phase 2–5 live smokes. */
const ORG_HL = 100000140;
const STATUS_NEW = 100000600;
const CUSTOMER_TYPE_INDIVIDUAL = 100000020;
const BUCKET_VALUE: Readonly<Record<string, number>> = {
  '1-30': 100000000, '31-60': 100000001, '61-90': 100000002, '91-180': 100000003, '181-270': 100000004,
  '271-360': 100000005, '361-500': 100000006, '501-1000': 100000007, '1001-2000': 100000008, '>2000': 100000009,
};

type Config = ReturnType<typeof loadConfig>;

// ── Reading the report ───────────────────────────────────────────────────────

interface ArrearRow {
  sequence: number;
  customerKey: string;
  pseudoQid: string;
  pseudoName: string;
  facilityNumber: string;
  productCode: string;
  productDescription: string;
  loanBalance?: number;
  totalArrears?: number;
  instalmentAmount?: number;
  lastArrearAmount?: number;
  arrearDays?: number;
  firstArrearDate?: string;
  bucket?: string;
  unknownBucket?: string;
  isDeceasedPerQcb: boolean;
  accountStatus?: string;
}

/**
 * A stable synthetic identity for a real customer number.
 *
 * Deterministic, so the same customer maps to the same synthetic person across reloads and their
 * facilities still group together in Customer 360 — which is the only property the demonstration
 * needs from identity.
 */
function pseudonymise(customerNumber: string, sequence: number) {
  const digest = createHash('sha256').update(`qdb-arrear-${customerNumber}`).digest('hex');
  const digits = BigInt(`0x${digest.slice(0, 12)}`).toString().padStart(9, '0').slice(0, 9);
  return {
    pseudoQid: `${MARKER}2${digits}`,
    pseudoName: `Arrear Customer ${String(sequence).padStart(4, '0')}`,
  };
}

function readReport(limit?: number): { rows: ArrearRow[]; asOf: string; skipped: number } {
  const workbook = XLSX.read(readFileSync(WORKBOOK), { cellDates: true });
  const sheet = workbook.Sheets[SHEET];
  if (!sheet) throw new Error(`The workbook has no sheet named "${SHEET}"`);
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true });

  const title = String(grid[0]?.[0] ?? '');
  const asOf = /(\d{2}\/\d{2}\/\d{4})/.exec(title)?.[1] ?? 'unknown';
  const header = (grid[1] ?? []).map(value => String(value).trim());
  const at = (name: string) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`The report has no "${name}" column; it has: ${header.join(', ')}`);
    return index;
  };

  const columns = {
    customerNumber: at('Customer Number'), accountNumber: at('Account Number'),
    loanTypeCode: at('Loan Type Code'), loanTypeDescription: at('Loan Type Description'),
    qcbDeceased: at('QCB Deceased Status'), loanBalance: at('Loan Balance'),
    accountStatus: at('Account Status'), firstArrearDate: at('First Arrear Date'),
    arrearDays: at('Arrear Days'), totalArrears: at('Total Arrears'),
    instalment: at('Installment Amount'), lastArrear: at('Last Arrear Amount'),
    bucket: at('Arrear Buckets'),
  };

  const customerSequence = new Map<string, number>();
  const rows: ArrearRow[] = [];
  let skipped = 0;

  for (const raw of grid.slice(2)) {
    const customerNumber = readText(raw[columns.customerNumber]);
    const accountNumber = readText(raw[columns.accountNumber]);
    if (!customerNumber || !accountNumber) { skipped++; continue; }

    if (!customerSequence.has(customerNumber)) customerSequence.set(customerNumber, customerSequence.size + 1);
    const sequence = customerSequence.get(customerNumber)!;
    const { pseudoQid, pseudoName } = pseudonymise(customerNumber, sequence);

    // The production normalizer, on the production file. This is where the 1,670 coerced rows are
    // recovered — or, if the recovery ever regresses, where the loss becomes visible and counted.
    const bucket = readArrearBucket(raw[columns.bucket]);
    const firstArrear = readDayFirstDate(raw[columns.firstArrearDate]);

    rows.push({
      sequence: rows.length + 1,
      customerKey: customerNumber,
      pseudoQid, pseudoName,
      facilityNumber: `${MARKER}HL-${String(rows.length + 1).padStart(5, '0')}`,
      productCode: readText(raw[columns.loanTypeCode]) ?? 'HL',
      productDescription: readText(raw[columns.loanTypeDescription]) ?? 'Housing Loan',
      ...optional('loanBalance', readNumber(raw[columns.loanBalance])),
      ...optional('totalArrears', readNumber(raw[columns.totalArrears])),
      ...optional('instalmentAmount', readNumber(raw[columns.instalment])),
      ...optional('lastArrearAmount', readNumber(raw[columns.lastArrear])),
      ...optional('arrearDays', readNumber(raw[columns.arrearDays])),
      ...optional('firstArrearDate', firstArrear.iso),
      ...optional('bucket', bucket.bucket),
      ...optional('unknownBucket', bucket.unknown),
      isDeceasedPerQcb: String(raw[columns.qcbDeceased] ?? '').toUpperCase() === 'DEAD',
      ...optional('accountStatus', readText(raw[columns.accountStatus])),
    });
    if (limit !== undefined && rows.length >= limit) break;
  }
  return { rows, asOf, skipped };
}

function optional<T>(key: string, value: T | undefined): Record<string, T> {
  return value === undefined ? {} : { [key]: value };
}

// ── Writing, in batches ──────────────────────────────────────────────────────

interface BatchRequest { set: string; body: Record<string, unknown> }

/**
 * Sends creates as an OData `$batch`, in changesets.
 *
 * Every create still fires its plugins — `ActiveCaseGuard` queries on each case — so batching saves
 * the HTTP round trip rather than the server work. It is the difference between minutes and an hour
 * for twelve thousand rows.
 */
async function sendBatch(cfg: Config, token: string, requests: readonly BatchRequest[]): Promise<string[]> {
  const batchId = `batch_${Math.random().toString(36).slice(2)}`;
  const changesetId = `changeset_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [`--${batchId}`, `Content-Type: multipart/mixed; boundary=${changesetId}`, ''];

  requests.forEach((request, index) => {
    lines.push(
      `--${changesetId}`,
      'Content-Type: application/http',
      'Content-Transfer-Encoding: binary',
      `Content-ID: ${index + 1}`,
      '',
      `POST ${cfg.apiBase}/${request.set} HTTP/1.1`,
      'Content-Type: application/json;type=entry',
      '',
      JSON.stringify(request.body),
      '',
    );
  });
  lines.push(`--${changesetId}--`, `--${batchId}--`, '');

  const headers = buildHeaders(token, SOLUTION_NAME) as Record<string, string>;
  headers['Content-Type'] = `multipart/mixed; boundary=${batchId}`;
  const response = await fetch(`${cfg.apiBase}/$batch`, { method: 'POST', headers, body: lines.join('\r\n') });
  const text = await response.text();
  if (!response.ok) throw new Error(`$batch ${response.status}: ${text.slice(0, 400)}`);

  // A changeset is atomic: one failure fails them all, and the body names it.
  if (/"error"/.test(text)) {
    const message = /"message"\s*:\s*"([^"]{0,300})"/.exec(text)?.[1] ?? text.slice(0, 300);
    throw new Error(`a create in the batch was refused: ${message}`);
  }
  return [...text.matchAll(/OData-EntityId:\s*\S*\(([^)]+)\)/gi)].map(match => match[1]!);
}

const BATCH_SIZE = 100;

async function createAll(
  cfg: Config, token: string, label: string, requests: readonly BatchRequest[],
): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; offset < requests.length; offset += BATCH_SIZE) {
    const slice = requests.slice(offset, offset + BATCH_SIZE);
    ids.push(...await sendBatch(cfg, token, slice));
    const done = Math.min(offset + BATCH_SIZE, requests.length);
    process.stdout.write(`\r  ${label}: ${done}/${requests.length}`);
  }
  process.stdout.write('\n');
  return ids;
}

// ── The load ─────────────────────────────────────────────────────────────────

async function load(cfg: Config, token: string, limit?: number) {
  console.log('\n─── Reading the report ───');
  const { rows, asOf, skipped } = readReport(limit);
  console.log(`  ${WORKBOOK.split('/').pop()} — as of ${asOf}`);
  console.log(`  ${rows.length} facility rows${skipped > 0 ? `, ${skipped} skipped for a missing key` : ''}`);

  const recovered = rows.filter(r => r.bucket === '1-30').length;
  const unknown = rows.filter(r => r.unknownBucket !== undefined);
  console.log('\n─── Bucket distribution, after the production normalizer ───');
  // A row with no bucket at all and a row with a bucket outside the taxonomy are different states,
  // and collapsing them would hide which one the report actually contains.
  const describe = (row: ArrearRow) =>
    row.bucket ?? (row.unknownBucket !== undefined ? `outside the taxonomy (${row.unknownBucket})` : 'not reported');
  const distribution = new Map<string, number>();
  for (const row of rows) distribution.set(describe(row), (distribution.get(describe(row)) ?? 0) + 1);
  for (const [bucket, count] of [...distribution].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(5)}  ${bucket}`);
  }
  console.log(`\n  ${recovered} rows recovered to 1-30 from a date the export coerced (KI-55).`);
  if (unknown.length > 0) console.log(`  ${unknown.length} rows carry a bucket outside the taxonomy and are loaded without one.`);

  // ── Customers ──────────────────────────────────────────────────────────────
  console.log('\n─── Writing ───');
  const byCustomer = new Map<string, ArrearRow>();
  for (const row of rows) if (!byCustomer.has(row.customerKey)) byCustomer.set(row.customerKey, row);

  const contactIds = await createAll(cfg, token, 'contacts', [...byCustomer.values()].map(row => ({
    set: 'contacts',
    body: {
      // `pseudoName` already reads "Arrear Customer 0001", so the given name is the first word of it
      // rather than another "Arrear" — the first load rendered "Arrear Arrear Customer 0001".
      firstname: 'Arrear', lastname: `${row.pseudoName.replace(/^Arrear /, '')} (synthetic)`,
      governmentid: row.pseudoQid,
    },
  })));
  const contactByCustomer = new Map<string, string>();
  [...byCustomer.keys()].forEach((key, index) => {
    const id = contactIds[index];
    if (id) contactByCustomer.set(key, id);
  });

  // ── Cases ──────────────────────────────────────────────────────────────────
  const caseIds = await createAll(cfg, token, 'cases', rows.map(row => ({
    set: 'qdb_collectioncases',
    body: {
      qdb_casenumber: `${MARKER}HL-${String(row.sequence).padStart(5, '0')}`,
      qdb_facilitynumber: row.facilityNumber,
      qdb_facilitysourcesystem: 'HL',
      qdb_customerbusinessid: row.pseudoQid,
      qdb_organizationcode: ORG_HL,
      qdb_customertype: CUSTOMER_TYPE_INDIVIDUAL,
      qdb_producttypecode: row.productCode,
      qdb_productdescription: row.productDescription,
      qdb_episodenumber: 1,
      ...(row.firstArrearDate ? { qdb_opendate: `${row.firstArrearDate}T00:00:00Z` } : {}),
      ...optional('qdb_currentdpd', row.arrearDays),
      ...(row.bucket ? { qdb_currentarrearbucket: BUCKET_VALUE[row.bucket] } : {}),
      ...optional('qdb_currenttotalarrears', row.totalArrears),
      ...optional('qdb_currentloanbalance', row.loanBalance),
      ...optional('qdb_installmentamount', row.instalmentAmount),
      qdb_misasofdate: '2026-06-30',
      qdb_lastmissyncon: new Date().toISOString(),
      qdb_correlationid: `${MARKER}ARREAR-2026-06-30`,
      statuscode: STATUS_NEW,
      ...(contactByCustomer.has(row.customerKey)
        ? { 'qdb_customerid_contact@odata.bind': `/contacts(${contactByCustomer.get(row.customerKey)})` }
        : {}),
    },
  })));

  // ── Snapshots ──────────────────────────────────────────────────────────────
  await createAll(cfg, token, 'snapshots', rows.map((row, index) => ({
    set: 'qdb_delinquencysnapshots',
    body: {
      qdb_name: `${MARKER}SNAP-${String(row.sequence).padStart(5, '0')}`,
      qdb_snapshotkey: `${MARKER}${row.facilityNumber}-2026-06-30`,
      qdb_customerbusinessid: row.pseudoQid,
      qdb_facilitynumber: row.facilityNumber,
      qdb_facilitysourcesystem: 'HL',
      qdb_snapshotdate: '2026-06-30T00:00:00Z',
      qdb_receivedon: new Date().toISOString(),
      qdb_missourcetimestamp: '2026-06-30T00:00:00Z',
      ...optional('qdb_dpd', row.arrearDays),
      ...(row.bucket ? { qdb_arrearbucket: BUCKET_VALUE[row.bucket] } : {}),
      ...optional('qdb_totalarrears', row.totalArrears),
      ...optional('qdb_loanbalance', row.loanBalance),
      ...optional('qdb_installmentamount', row.instalmentAmount),
      ...optional('qdb_lastarrearamount', row.lastArrearAmount),
      // `qdb_firstarreardate` is the one DateOnly column on the snapshot — every other date here is
      // DateAndTime/UserLocal. A timestamp is rejected outright: "Cannot convert the literal
      // '2026-06-30T00:00:00Z' to the expected type 'Edm.Date'". Read from metadata, not assumed.
      ...(row.firstArrearDate ? { qdb_firstarreardate: row.firstArrearDate } : {}),
      qdb_producttypecode: row.productCode,
      ...optional('qdb_accountstatuscode', row.accountStatus),
      qdb_isdeceasedperqcb: row.isDeceasedPerQcb,
      qdb_integrationbatchid: `${MARKER}2026-06-30`,
      ...(caseIds[index] ? { 'qdb_collectioncaseid@odata.bind': `/qdb_collectioncases(${caseIds[index]})` } : {}),
    },
  })));

  console.log('\n─── Loaded ───');
  console.log(`  ${contactIds.length} contacts (synthetic identity)`);
  console.log(`  ${caseIds.length} collection cases`);
  console.log(`  ${rows.length} delinquency snapshots`);
  console.log(`  ${rows.filter(r => r.isDeceasedPerQcb).length} of them flagged deceased per QCB`);
  console.log(`\n  Remove with:  node ... load-arrear-report.mts --remove`);
}

async function main() {
  const remove = process.argv.includes('--remove');
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : undefined;

  console.log(`=== Housing Loan Arrear Report — ${remove ? 'REMOVE' : 'LOAD'} ===\n`);
  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
  console.log(`  Marker: ${MARKER} (distinct from SMOKE- and DEMO-)`);

  const token = await acquireToken(cfg);
  if (remove) {
    await cleanSmokeData({ cfg, token, confirmed: true, marker: MARKER });
    console.log('\nThe arrear report data is gone. No schema was touched at any point.');
    return;
  }
  await load(cfg, token, Number.isFinite(limit) ? limit : undefined);
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
