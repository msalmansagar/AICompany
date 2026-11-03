/**
 * verify-dcp-approval-status.mjs — READ-ONLY, independent check of the shared-choice migration
 * (docs/SharedChoiceAssessment.md). Shares no code with migrate-dcp-approval-status.mjs on purpose.
 * Writes docs/evidence/migrations/2026-10-04-post-migration-verification.json and exits 1 on any failure.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, acquireToken } from './lib/crm-client.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const EVIDENCE = resolve(HERE, '../../docs/evidence/migrations');
const BACKUP = JSON.parse(readFileSync(resolve(EVIDENCE, '2026-10-04-approval-status-backup.json'), 'utf8'));
const SOLUTION = 'qdb_debtcollection';
const QDB_CHOICE_BASELINE = {
  qdb_approval_status: [[0, 'Return'], [1, 'Approve']],
  qdb_risk_level: [[751090000, 'Low'], [751090001, 'Medium'], [751090002, 'High']],
  qdb_priority: [[751090000, null]],
};
const QDB_CHOICE_OTHER_COLUMNS = {
  qdb_approval_status: ['qdb_strategy_development_task.qdb_approval_status', 'qdb_tasdeer_task.qdb_approval_status'],
  qdb_risk_level: ['qdb_loan_application_credit_risk.qdb_risk_level'],
  qdb_priority: ['qdb_customerfollowup.qdb_priority', 'qdb_status_history.qdb_work_item_priority'],
};
const RETIRED = [['qdb_collectioncase', 'qdb_risklevel'], ['qdb_collectioncase', 'qdb_priority'], ['qdb_collectionstrategy', 'qdb_risklevel'], ['qdb_assignmentconfiguration', 'qdb_risklevel']];
const REBOUND = [['qdb_collectionactivity', 'None'], ['qdb_communicationtemplate', 'ApplicationRequired']];
const NUMERIC_PRIORITY = ['qdb_collectionstrategy', 'qdb_assignmentconfiguration'];

const cfg = loadConfig();
const token = await acquireToken(cfg);
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Prefer: 'odata.include-annotations="*"' };
async function read(path) {
  const response = await fetch(cfg.apiBase + path, { headers });
  const text = await response.text();
  return { status: response.status, body: text && response.ok ? JSON.parse(text) : text };
}
const checks = [];
const record = (name, passed, detail) => { checks.push({ name, passed, detail }); console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`); };
const attributeUrl = (table, column) => `/EntityDefinitions(LogicalName='${table}')/Attributes(LogicalName='${column}')`;

async function columnNamesBoundTo(choiceId) {
  const dependents = (await read(`/RetrieveDependentComponents(ObjectId=${choiceId},ComponentType=9)`)).body.value ?? [];
  const names = [];
  for (const d of dependents.filter(x => x.dependentcomponenttype === 2)) {
    const owner = (await read(`/EntityDefinitions?$select=LogicalName&$expand=Attributes($select=LogicalName;$filter=MetadataId eq ${d.dependentcomponentobjectid})`)).body.value;
    owner.forEach(e => (e.Attributes ?? []).forEach(a => names.push(`${e.LogicalName}.${a.LogicalName}`)));
  }
  return names.sort();
}

async function solutionsContaining(objectId, componentType) {
  const rows = (await read(`/solutioncomponents?$select=objectid&$filter=objectid eq ${objectId} and componenttype eq ${componentType}&$expand=solutionid($select=uniquename)`)).body.value ?? [];
  return rows.map(r => r.solutionid?.uniquename).sort();
}

async function verifyDcpChoice() {
  const choice = (await read(`/GlobalOptionSetDefinitions(Name='qdb_dcp_approval_status')`)).body;
  const options = choice.Options?.map(o => [o.Value, o.Label?.UserLocalizedLabel?.Label]);
  record('DCP choice exists with exactly 0 Return / 1 Approve', JSON.stringify(options) === '[[0,"Return"],[1,"Approve"]]', options);
  record('DCP choice display name', choice.DisplayName?.UserLocalizedLabel?.Label === 'DCP Approval Status', choice.DisplayName?.UserLocalizedLabel?.Label);
  record('DCP choice is global and unmanaged', choice.IsGlobal === true && choice.IsManaged === false, { isGlobal: choice.IsGlobal, isManaged: choice.IsManaged });
  const solutions = await solutionsContaining(choice.MetadataId, 9);
  record(`DCP choice belongs to ${SOLUTION}`, solutions.includes(SOLUTION), solutions);
  const bound = await columnNamesBoundTo(choice.MetadataId);
  record('DCP choice is used by exactly the two Approval Status columns', JSON.stringify(bound) === JSON.stringify(['qdb_collectionactivity.qdb_approvalstatus', 'qdb_communicationtemplate.qdb_approvalstatus']), bound);
}

async function verifyReboundColumns() {
  for (const [table, requiredLevel] of REBOUND) {
    const a = (await read(`${attributeUrl(table, 'qdb_approvalstatus')}/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$select=SchemaName,RequiredLevel,DisplayName&$expand=GlobalOptionSet($select=Name)`)).body;
    const actual = { schemaName: a.SchemaName, choice: a.GlobalOptionSet?.Name, requiredLevel: a.RequiredLevel?.Value, displayName: a.DisplayName?.UserLocalizedLabel?.Label };
    record(`${table}.qdb_approvalstatus rebound, name and settings unchanged`, actual.schemaName === 'qdb_approvalstatus' && actual.choice === 'qdb_dcp_approval_status' && actual.requiredLevel === requiredLevel && actual.displayName === 'Approval Status', actual);
  }
}

async function verifyQdbChoicesUntouched() {
  for (const [name, baseline] of Object.entries(QDB_CHOICE_BASELINE)) {
    const choice = (await read(`/GlobalOptionSetDefinitions(Name='${name}')`)).body;
    const values = choice.Options?.map(o => o.Value);
    record(`QDB ${name} option values unchanged`, JSON.stringify(values) === JSON.stringify(baseline.map(b => b[0])), values);
    const labelsKnown = baseline.filter(b => b[1] !== null);
    record(`QDB ${name} labels unchanged`, labelsKnown.every(([v, l]) => choice.Options.find(o => o.Value === v)?.Label?.UserLocalizedLabel?.Label === l), choice.Options?.map(o => o.Label?.UserLocalizedLabel?.Label));
    const bound = await columnNamesBoundTo(choice.MetadataId);
    record(`QDB ${name} still used by its other modules and no longer by DCP`, JSON.stringify(bound) === JSON.stringify([...QDB_CHOICE_OTHER_COLUMNS[name]].sort()), bound);
    const solutions = await solutionsContaining(choice.MetadataId, 9);
    record(`QDB ${name} not in ${SOLUTION}`, !solutions.includes(SOLUTION), solutions);
  }
}

async function verifyRetirementAndPriority() {
  for (const [table, column] of RETIRED) record(`${table}.${column} retired`, (await read(attributeUrl(table, column))).status === 404);
  for (const table of NUMERIC_PRIORITY) {
    const a = (await read(`${attributeUrl(table, 'qdb_priority')}?$select=AttributeType,RequiredLevel`)).body;
    record(`${table}.qdb_priority numeric and unchanged`, a.AttributeType === 'Integer' && a.RequiredLevel?.Value === 'ApplicationRequired', { type: a.AttributeType, required: a.RequiredLevel?.Value });
  }
}

async function verifyData() {
  const templates = (await read(`/qdb_communicationtemplates?$select=qdb_code,qdb_approvalstatus,qdb_approvalrequired,statecode`)).body.value;
  const backedUp = BACKUP.records.filter(r => r.table === 'qdb_communicationtemplate');
  const afterApproved = templates.filter(t => t.qdb_approvalstatus !== null && t.qdb_approvalstatus !== undefined);
  record('template rows unchanged in number', templates.length === 5, templates.length);
  record('4 templates hold a value before and after', backedUp.length === 4 && afterApproved.length === 4, { before: backedUp.length, after: afterApproved.length });
  for (const b of backedUp) {
    const now = templates.find(t => t.qdb_communicationtemplateid === b.id);
    record(`${b.businessId} = 1 (Approve) before and after`, b.value === 1 && now?.qdb_approvalstatus === 1 && now?.['qdb_approvalstatus@OData.Community.Display.V1.FormattedValue'] === 'Approve', { before: b.value, after: now?.qdb_approvalstatus, label: now?.['qdb_approvalstatus@OData.Community.Display.V1.FormattedValue'] });
  }
  const unapproved = templates.find(t => t.qdb_code === 'P7-SMS-UNAPPROVED-EN');
  record('P7-SMS-UNAPPROVED-EN still has no approval (blocked by design)', unapproved && (unapproved.qdb_approvalstatus ?? null) === null, unapproved?.qdb_approvalstatus ?? null);
  const activities = (await read(`/qdb_collectionactivities?$select=activityid&$filter=qdb_approvalstatus ne null&$count=true`)).body;
  record('collection activities with an approval value: 0 before and after', (activities['@odata.count'] ?? activities.value.length) === 0, activities['@odata.count']);
  return { templates };
}

async function verifyFormsAndViews() {
  for (const table of ['qdb_collectioncase', 'qdb_collectionactivity', 'qdb_collectionstrategy', 'qdb_assignmentconfiguration', 'qdb_communicationtemplate']) {
    const forms = (await read(`/systemforms?$select=name,formxml&$filter=objecttypecode eq '${table}' and type eq 2`)).body.value;
    const views = (await read(`/savedqueries?$select=name,fetchxml,layoutxml&$filter=returnedtypecode eq '${table}' and querytype eq 0`)).body.value;
    const staleForms = forms.filter(f => RETIRED.some(([t, c]) => t === table && f.formxml.includes(`"${c}"`))).map(f => f.name);
    const staleViews = views.filter(v => RETIRED.some(([t, c]) => t === table && (`${v.fetchxml}${v.layoutxml}`).includes(`"${c}"`))).map(v => v.name);
    record(`${table} forms/views reference no retired column`, staleForms.length + staleViews.length === 0, { forms: forms.map(f => f.name), staleForms, staleViews });
    if (REBOUND.some(([t]) => t === table)) record(`${table} Information form shows Approval Status again`, forms.some(f => f.formxml.includes('datafieldname="qdb_approvalstatus"')));
  }
}

async function verifySolutionDependencies() {
  const missing = (await read(`/RetrieveMissingDependencies(SolutionUniqueName='${SOLUTION}')`)).body.value ?? [];
  const sharedChoiceIds = [];
  for (const name of Object.keys(QDB_CHOICE_BASELINE)) sharedChoiceIds.push((await read(`/GlobalOptionSetDefinitions(Name='${name}')?$select=MetadataId`)).body.MetadataId);
  const onShared = missing.filter(m => sharedChoiceIds.includes(m.requiredcomponentobjectid));
  record(`${SOLUTION} has no missing dependency on QDB's shared choices`, onShared.length === 0, { totalMissing: missing.length, onSharedChoices: onShared.length });
  return { missingDependencies: missing.map(m => ({ requiredType: m.requiredcomponenttype, requiredId: m.requiredcomponentobjectid, dependentType: m.dependentcomponenttype, dependentId: m.dependentcomponentobjectid })) };
}

await verifyDcpChoice();
await verifyReboundColumns();
await verifyQdbChoicesUntouched();
await verifyRetirementAndPriority();
const data = await verifyData();
await verifyFormsAndViews();
const dependencies = await verifySolutionDependencies();
const failed = checks.filter(c => !c.passed);
mkdirSync(EVIDENCE, { recursive: true });
writeFileSync(resolve(EVIDENCE, '2026-10-04-post-migration-verification.json'), JSON.stringify({ verifiedAt: new Date().toISOString(), organisation: cfg.orgUrl, passed: checks.length - failed.length, failed: failed.length, checks, templatesAfter: data.templates, ...dependencies }, null, 2));
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length ? 1 : 0);
