/**
 * B8 verification on a live org (FR-CSE-057 and the admin screens). Read-only: runs every
 * manifest view through the Web API, checks each chart, form and the app exist as declared,
 * and that Survey Analyst may export to Excel. Run after provision.mjs and provision-ui.mjs.
 *
 *   node --env-file=<dfe>/scripts/.env b8-ui-verify.mjs
 */
import { openSession } from './e2e-helpers.mjs';
import { VIEWS, CHARTS, FORMS, APP } from '../provisioning/ui-manifest.mjs';
import { stableGuid } from '../provisioning/lib/ui-payloads.mjs';

const entitySet = async (session, table) => (await session.client.send('GET', `EntityDefinitions(LogicalName='${table}')?$select=EntitySetName`)).json.EntitySetName;
const quote = (text) => text.replace(/'/g, "''");

async function verifyViews(session) {
  for (const view of VIEWS) {
    const [saved] = await session.rows(`savedqueries?$select=savedqueryid&$filter=name eq '${quote(view.name)}' and returnedtypecode eq '${view.table}'`);
    if (!saved) { session.check(`view "${view.name}" exists`, false); continue; }
    const outcome = await session.client.send('GET', `${await entitySet(session, view.table)}?savedQuery=${saved.savedqueryid}`).then(({ json }) => `${json.value.length} row(s)`, (error) => `FAILED ${error.message.slice(0, 120)}`);
    session.check(`view "${view.name}" runs`, !outcome.startsWith('FAILED'), outcome);
  }
}

async function verifyCharts(session) {
  for (const chart of CHARTS) {
    const found = await session.rows(`savedqueryvisualizations?$select=name&$filter=name eq '${quote(chart.name)}' and primaryentitytypecode eq '${chart.table}'`);
    session.check(`chart "${chart.name}" exists`, found.length === 1);
  }
}

async function verifyForms(session) {
  for (const form of FORMS) {
    const [main] = await session.rows(`systemforms?$select=formxml&$filter=objecttypecode eq '${form.table}' and type eq 2&$orderby=name asc`);
    const firstTabId = stableGuid(`${form.table}.${form.tabs[0].label}.tab`).toLowerCase();
    session.check(`${form.table} main form has the B8 layout`, Boolean(main?.formxml?.toLowerCase().includes(firstTabId)));
  }
}

async function verifyAppAndExport(session) {
  const [app] = await session.rows(`appmodules?$select=appmoduleid,name&$filter=uniquename eq '${APP.uniqueName}'`);
  session.check(`app "${APP.name}" exists`, Boolean(app));
  if (app) {
    const roles = await session.rows(`appmodules(${app.appmoduleid})/appmoduleroles_association?$select=name`);
    session.check('the app is given to Survey Admin and Survey Analyst', APP.roles.every((name) => roles.some((r) => r.name === name)), roles.map((r) => r.name).join(', '));
  }
  const [analyst] = await session.rows("roles?$select=roleid&$filter=name eq 'Survey Analyst' and _parentroleid_value eq null");
  const granted = (await session.client.send('GET', `RetrieveRolePrivilegesRole(RoleId=${analyst.roleid})`)).json.RolePrivileges;
  const [exportPrivilege] = await session.rows("privileges?$select=privilegeid&$filter=name eq 'prvExportToExcel'");
  session.check('Survey Analyst may export to Excel', granted.some((g) => g.PrivilegeId === exportPrivilege.privilegeid));
}

async function run() {
  const session = await openSession();
  console.log(`B8 verify — ${session.client.orgUrl}`);
  await verifyViews(session);
  await verifyCharts(session);
  await verifyForms(session);
  await verifyAppAndExport(session);
  console.log(session.allPassed() ? '\nALL PASS' : '\nSOME CHECKS FAILED');
  process.exit(session.allPassed() ? 0 : 1);
}

run().catch((error) => { console.error(`✗ ${error.message}`); process.exit(1); });
