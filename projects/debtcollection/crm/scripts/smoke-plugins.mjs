// Live proving test for build step 1 (architecture §13): the registered plugins behave on the org.
// Creates a smoke customer and case, then checks: invalid transition rejected, valid transition
// accepted, stop-contact guard, case Delete blocked, audit rows written, snapshot immutable.
// Leaves the smoke records in place (they cannot be deleted by design); names carry a SMOKE tag.
import { loadConfig, acquireToken, apiGet, apiPost, buildHeaders } from './lib/crm-client.mjs';

const SOLUTION = 'msst_debtcollection';
const CASE = { New: 463270200, Assigned: 463270201, InProgress: 463270202, PendingCustomer: 463270203, Settled: 463270213, DeceasedReview: 463270212 };
const cfg = loadConfig();
const token = await acquireToken(cfg);
const tag = `SMOKE ${new Date().toISOString().slice(0, 16)}`;
const results = [];

function record(name, passed, detail) {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function send(method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, { method, headers: buildHeaders(token, SOLUTION), body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, text, id: (res.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1] };
}

const errorMessage = (text) => { try { return JSON.parse(text).error.message; } catch { return text; } };
const wait = (ms) => new Promise(r => setTimeout(r, ms));

const customer = await send('POST', '/msst_dcpcustomers', { msst_fullname: `${tag} customer`, msst_qid: `SMK${Date.now()}` });
record('customer created', customer.status === 204 && !!customer.id, customer.id ?? errorMessage(customer.text));

const created = await send('POST', '/msst_dcpcollectioncases', { msst_name: `${tag} case`, 'msst_customerid@odata.bind': `/msst_dcpcustomers(${customer.id})` });
record('case created', created.status === 204 && !!created.id, created.id ?? errorMessage(created.text));
const casePath = `/msst_dcpcollectioncases(${created.id})`;

const invalid = await send('PATCH', casePath, { statuscode: CASE.Settled });
record('invalid transition New -> Settled rejected', invalid.status === 400, errorMessage(invalid.text).slice(0, 120));

const valid = await send('PATCH', casePath, { statuscode: CASE.Assigned });
record('valid transition New -> Assigned accepted', valid.status === 204, valid.status === 204 ? '' : errorMessage(valid.text).slice(0, 120));

const progressed = await send('PATCH', casePath, { statuscode: CASE.InProgress });
record('valid transition Assigned -> In Progress accepted', progressed.status === 204, progressed.status === 204 ? '' : errorMessage(progressed.text).slice(0, 120));

const flag = await send('PATCH', `/msst_dcpcustomers(${customer.id})`, { msst_stopcontact: true });
record('stop-contact flag set', flag.status === 204, flag.status === 204 ? '' : errorMessage(flag.text).slice(0, 120));
const guarded = await send('PATCH', casePath, { statuscode: CASE.PendingCustomer });
record('stop-contact guard rejects In Progress -> Pending Customer Response', guarded.status === 400, errorMessage(guarded.text).slice(0, 140));
const carveOut = await send('PATCH', casePath, { statuscode: CASE.DeceasedReview });
record('stop-contact carve-out allows -> Deceased/Insurance Review', carveOut.status === 204, carveOut.status === 204 ? '' : errorMessage(carveOut.text).slice(0, 120));

const del = await send('DELETE', casePath);
record('case Delete blocked (sysadmin included)', del.status === 400, errorMessage(del.text).slice(0, 120));

await wait(20000);
const audit = await apiGet(cfg, token, SOLUTION, `/msst_dcpauditlogs?$select=msst_name,createdon&$filter=contains(msst_name,'${created.id}')`);
const auditCount = audit?.value?.length ?? 0;
record('audit rows written for the case (async, after 20 s)', auditCount >= 1, `${auditCount} rows`);
if (auditCount >= 1) {
  const rowPath = `/msst_dcpauditlogs(${(await apiGet(cfg, token, SOLUTION, `/msst_dcpauditlogs?$select=msst_dcpauditlogid&$filter=contains(msst_name,'${created.id}')&$top=1`)).value[0].msst_dcpauditlogid})`;
  const tamper = await send('PATCH', rowPath, { msst_name: 'tampered' });
  record('audit row immutable', tamper.status === 400, errorMessage(tamper.text).slice(0, 120));
}

const snap = await send('POST', '/msst_dcpdelinquencysnapshots', { msst_name: `${tag} snapshot` });
record('snapshot created', snap.status === 204 && !!snap.id, snap.id ?? errorMessage(snap.text));
if (snap.id) {
  const mutate = await send('PATCH', `/msst_dcpdelinquencysnapshots(${snap.id})`, { msst_name: 'tampered' });
  record('snapshot immutable', mutate.status === 400, errorMessage(mutate.text).slice(0, 120));
}

const failed = results.filter(r => !r.passed).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
