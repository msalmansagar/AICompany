// Seeds a small loan-origination chain into the org's imported QDB schema, so the four-stage
// lineage report (loan → termsheet → new loan creation → disbursements) has rows to show:
//
//   2 loans (CIF → existing accounts) → 3 termsheets → 3 NLCs, each on its own qdb_facility;
//   facility 1 gets three disbursement tickets, facility 2 gets one, facility 3 gets none —
//   so the outer join's blank and the per-facility count variance are both visible.
//
// Every record is named DEMO-… and safe to delete. Idempotent by name: an existing DEMO record
// of the same name is reused rather than duplicated.
//
// Usage: node seed-loan-chain-demo.mjs <path-to-.env>
import { connect } from './lib/dataverse.mjs';

const dv = await connect(process.argv[2]);
const API = `${dv.baseUrl}/api/data/v${dv.apiVersion}`;
const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };

async function firstByName(entitySet, nameAttribute, name) {
  const filter = encodeURIComponent(`${nameAttribute} eq '${name.replace(/'/g, "''")}'`);
  const res = await dv.request(`${API}/${entitySet}?$select=${nameAttribute}&$filter=${filter}&$top=1`, { headers });
  const body = await res.json();
  if (!res.ok) throw new Error(`lookup ${entitySet} ${res.status}: ${JSON.stringify(body.error)}`);
  return body.value[0] || null;
}

/** Creates the record unless a same-named one exists; returns its id either way (OData-EntityId — a create body is empty). */
async function ensure(entitySet, idAttribute, nameAttribute, payload) {
  const existing = await firstByName(entitySet, nameAttribute, payload[nameAttribute]);
  if (existing) {
    console.log(`  · exists ${payload[nameAttribute]}`);
    return existing[idAttribute];
  }
  const res = await dv.request(`${API}/${entitySet}`, { method: 'POST', headers, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`create ${entitySet} ${res.status}: ${await res.text()}`);
  const id = (res.headers.get('OData-EntityId') || '').match(/\(([0-9a-fA-F-]{36})\)/)[1];
  console.log(`  ✓ created ${payload[nameAttribute]}`);
  return id;
}

console.log('\n== Seed: loan → termsheet → NLC → disbursement chain ==\n');

const accounts = (await (await dv.request(`${API}/accounts?$select=accountid,name&$top=2&$orderby=name`, { headers })).json()).value;
if (accounts.length < 2) throw new Error('need two accounts to act as CIFs');

const approved = await ensure('qdb_workflow_statuses', 'qdb_workflow_statusid', 'qdb_name', { qdb_name: 'Approved' });
const issued = await ensure('qdb_workflow_statuses', 'qdb_workflow_statusid', 'qdb_name', { qdb_name: 'Issued' });

const facilities = [];
for (let index = 1; index <= 3; index++) {
  facilities.push(await ensure('qdb_facilities', 'qdb_facilityid', 'qdb_facilityname',
    { qdb_facilityname: `DEMO-FAC-000${index}` }));
}

const loans = [];
for (const [index, account] of accounts.entries()) {
  loans.push(await ensure('qdb_loan_applications', 'qdb_loan_applicationid', 'qdb_name', {
    qdb_name: `DEMO-LN-000${index + 1}`,
    qdb_customer_name: account.name,
    qdb_id_number: `2884${index + 1}0123`,
    'qdb_CIF_No@odata.bind': `/accounts(${account.accountid})`
  }));
}

const termsheetPlan = [
  { name: 'DEMO-TS-0001', loan: loans[0], status: approved },
  { name: 'DEMO-TS-0002', loan: loans[0], status: issued },
  { name: 'DEMO-TS-0003', loan: loans[1], status: approved }
];
const termsheets = [];
for (const sheet of termsheetPlan) {
  termsheets.push(await ensure('qdb_customer_term_sheets', 'qdb_customer_term_sheetid', 'qdb_name', {
    qdb_name: sheet.name,
    'qdb_Loan_Application_Ref@odata.bind': `/qdb_loan_applications(${sheet.loan})`,
    'qdb_Status@odata.bind': `/qdb_workflow_statuses(${sheet.status})`
  }));
}

const creations = [];
for (const [index, termsheet] of termsheets.entries()) {
  creations.push(await ensure('qdb_new_loan_creations', 'qdb_new_loan_creationid', 'qdb_name', {
    qdb_name: `DEMO-NLC-000${index + 1}`,
    'qdb_term_sheet_ref_no@odata.bind': `/qdb_customer_term_sheets(${termsheet})`,
    'qdb_Facility_No@odata.bind': `/qdb_facilities(${facilities[index]})`
  }));
}

// Facility 1 → three tickets, facility 2 → one, facility 3 → none.
const ticketPlan = [[0, 3], [1, 1]];
let ticketNumber = 0;
for (const [facilityIndex, count] of ticketPlan) {
  for (let n = 0; n < count; n++) {
    ticketNumber++;
    await ensure('qdb_payment_authorization_tickets', 'qdb_payment_authorization_ticketid', 'qdb_name', {
      qdb_name: `DEMO-DR-000${ticketNumber}`,
      'qdb_Limit_No@odata.bind': `/qdb_facilities(${facilities[facilityIndex]})`
    });
  }
}

console.log('\nDone: 2 loans, 3 termsheets, 3 NLCs on 3 facilities, 4 disbursement tickets (3/1/0).\n');
