// Provisions the "Report User" security role — the minimum privileges needed to run a report.
//
// Without it the engine is administrator-only: the plugin executes as the calling user, so a user
// whose roles cannot read qdb_reportdefinition gets a privilege error rather than data. That is the
// engine behaving correctly, but it means nobody but an admin can run anything.
//
// Grants READ ONLY, at organisation depth, on the Report Engine configuration tables. It deliberately
// does NOT grant access to the data reports read — that stays governed by the user's existing roles,
// which is what keeps row-level security meaningful.
//
// Idempotent: reuses the role if it exists and re-applies the privilege set.
//
// Usage: node provision-report-user-role.mjs <path-to-.env> [systemuserid-to-assign]
import { readFileSync } from 'node:fs';
import { connect } from './lib/dataverse.mjs';

/* One connection for the whole script: it reads the env file, authenticates by DV_AUTH_MODE
   (entra | adfs | windows) and asks the organisation which Web API version it serves. */
const dv = await connect(process.argv[2]);
const baseUrl = dv.baseUrl;
const API_PATH = `api/data/v${dv.apiVersion}`;


const ROLE_NAME = 'Report User';
const SOLUTION = 'qdb_reportengine';

// Every table the definition loader reads. Missing one surfaces only when a report uses that feature.
const CONFIG_TABLES = [
  'qdb_reportdefinition', 'qdb_reportdatasource', 'qdb_reportentitymapping', 'qdb_reportcolumn',
  'qdb_reportfilter', 'qdb_reportparameter', 'qdb_reportformula', 'qdb_reporttransformation',
  'qdb_reportrelationship', 'qdb_reportlayout'
];

// Sent as the enum NAME, not its ordinal — the Web API rejects a numeric PrivilegeDepth.
// "Global" because report configuration is shared reference data, not owned per user or business unit.
const ORGANISATION_DEPTH = 'Global';

const headers = (extra = {}) => ({ Accept: 'application/json', 'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra
});

async function api(method, path, body, extraHeaders = {}) {
  const res = await dv.request(`${baseUrl}/${API_PATH}/${path}`, {
    method, headers: headers(extraHeaders), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function post(path, body, extraHeaders = {}) {
  const res = await dv.request(`${baseUrl}/${API_PATH}/${path}`, {
    method: 'POST', headers: headers(extraHeaders), body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} ${res.status}: ${await res.text()}`);
  const match = /\(([0-9a-f-]{36})\)/i.exec(res.headers.get('OData-EntityId') ?? '');
  return match?.[1] ?? null;
}

const findId = async (set, filter, idField) =>
  (await api('GET', `${set}?$filter=${encodeURIComponent(filter)}&$select=${idField}`)).value?.[0]?.[idField] ?? null;

/** The role must live in the root business unit so it can be assigned to any user. */
async function rootBusinessUnitId() {
  const units = await api('GET', 'businessunits?$filter=parentbusinessunitid eq null&$select=businessunitid');
  return units.value[0].businessunitid;
}

async function ensureRole() {
  const existing = await findId('roles', `name eq '${ROLE_NAME}'`, 'roleid');
  if (existing) {
    console.log(`  = role "${ROLE_NAME}" exists`);
    return existing;
  }

  const id = await post('roles', {
    name: ROLE_NAME,
    description: 'Run Report Engine reports. Read-only on report configuration; access to the '
      + 'underlying data stays governed by the user\'s other roles.',
    'businessunitid@odata.bind': `/businessunits(${await rootBusinessUnitId()})`
  }, { 'MSCRM.SolutionUniqueName': SOLUTION });
  console.log(`  + role "${ROLE_NAME}" created ${id}`);
  return id;
}

/** Resolves the prvRead… privilege for each config table; reports any that do not exist. */
async function readPrivileges() {
  const privileges = [];
  for (const table of CONFIG_TABLES) {
    const name = `prvRead${table}`;
    const id = await findId('privileges', `name eq '${name}'`, 'privilegeid');
    if (!id) {
      console.warn(`  ! privilege ${name} not found — skipped`);
      continue;
    }
    privileges.push({ PrivilegeId: id, Depth: ORGANISATION_DEPTH });
  }
  return privileges;
}

async function assignToUser(roleId, userId) {
  const existing = await api('GET',
    `systemusers(${userId})/systemuserroles_association?$filter=roleid eq ${roleId}&$select=roleid`);
  if (existing.value?.length) {
    console.log('  = role already assigned to that user');
    return;
  }

  await api('POST', `systemusers(${userId})/systemuserroles_association/$ref`,
    { '@odata.id': `${baseUrl}/${API_PATH}/roles(${roleId})` });
  console.log(`  + role assigned to user ${userId}`);
}

async function main() {
  const [envPath, assignUserId] = process.argv.slice(2);
  if (!envPath) throw new Error('Usage: node provision-report-user-role.mjs <path-to-.env> [systemuserid]');

  console.log(`Provisioning "${ROLE_NAME}" on ${baseUrl}`);
  const roleId = await ensureRole();

  const privileges = await readPrivileges();
  await api('POST', `roles(${roleId})/Microsoft.Dynamics.CRM.AddPrivilegesRole`, { Privileges: privileges });
  console.log(`  + ${privileges.length} read privileges applied at organisation depth`);

  if (assignUserId) await assignToUser(roleId, assignUserId);

  console.log('\nDone. The user still needs read access to the DATA a report targets, from their own roles.');
}

main().catch(error => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
