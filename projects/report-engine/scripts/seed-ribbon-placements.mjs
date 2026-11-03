// Seeds qdb_reportribbonplacement rows so the ribbon's "Reports" flyout has something to show.
//
// The flyout is populated at click time from this table, which is the point of the design: adding a
// report to a table is a data change, not a solution change. The ribbon itself is touched once per
// table. These rows are what prove that end to end on `account`.
//
// Idempotent: a placement is keyed by (report, entity, placement type) and reused if present.
//
// Usage: node seed-ribbon-placements.mjs <path-to-.env>
import { readFileSync } from 'node:fs';
import { connect } from './lib/dataverse.mjs';

/* One connection for the whole script: it reads the env file, authenticates by DV_AUTH_MODE
   (entra | adfs | windows) and asks the organisation which Web API version it serves. */
const dv = await connect(process.argv[2]);
const baseUrl = dv.baseUrl;
const API_PATH = `api/data/v${dv.apiVersion}`;


const TARGET_ENTITY = 'account';

// qdb_placementtype option-set values, verified against the org.
const PLACEMENT_TYPE = { entityForm: 100000000, entityGrid: 100000001 };

/* Reports that actually run against account today. A report is placed on the FORM when it is about
   one record's context, and on the GRID when it is about the table as a whole; these three are all
   account-scoped, so they are offered in both locations to exercise each ribbon surface. */
const REPORT_CODES = ['RPT-DEMO-ALL', 'RPT-EXEC-001', 'RPT-DRILL-001'];

const headers = (extra = {}) => ({ Accept: 'application/json', 'Content-Type': 'application/json',
  'OData-MaxVersion': '4.0', 'OData-Version': '4.0', ...extra
});

async function api(method, path, body) {
  const res = await dv.request(`${baseUrl}/${API_PATH}/${path}`, {
    method, headers: headers(), body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

async function findOne(entitySet, query) {
  const found = await api('GET', `${entitySet}?${query}&$top=1`);
  return (found.value || [])[0] || null;
}

/* The @odata.bind key is the relationship's navigation property, which is NOT reliably the same
   string as the lookup attribute — guessing it yields an opaque "undeclared property" error. Ask
   the metadata instead. */
async function reportLookupNavigationProperty() {
  const relationships = await api('GET',
    "EntityDefinitions(LogicalName='qdb_reportribbonplacement')/ManyToOneRelationships"
    + '?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName');
  const match = (relationships.value || []).find(r => r.ReferencingAttribute === 'qdb_reportdefinitionid');
  if (!match) throw new Error('no qdb_reportdefinitionid relationship on qdb_reportribbonplacement');
  return match.ReferencingEntityNavigationPropertyName;
}

async function findReport(code) {
  const report = await findOne('qdb_reportdefinitions',
    `$select=qdb_reportdefinitionid,qdb_name,qdb_reportcode&$filter=qdb_reportcode eq '${code}'`);
  if (!report) console.log(`  ! no report with code ${code} — skipped`);
  return report;
}

async function ensurePlacement(report, placementType, locationLabel, reportNavigationProperty) {
  const existing = await findOne('qdb_reportribbonplacements',
    `$select=qdb_reportribbonplacementid&$filter=_qdb_reportdefinitionid_value eq ${report.qdb_reportdefinitionid}`
    + ` and qdb_entitylogicalname eq '${TARGET_ENTITY}' and qdb_placementtype eq ${placementType}`);
  if (existing) {
    await api('PATCH', `qdb_reportribbonplacements(${existing.qdb_reportribbonplacementid})`,
      { qdb_name: report.qdb_name, qdb_isenabled: true });
    console.log(`  = ${locationLabel}: ${report.qdb_name}`);
    return;
  }
  await api('POST', 'qdb_reportribbonplacements', {
    qdb_name: report.qdb_name,
    qdb_entitylogicalname: TARGET_ENTITY,
    qdb_placementtype: placementType,
    qdb_isenabled: true,
    [`${reportNavigationProperty}@odata.bind`]: `/qdb_reportdefinitions(${report.qdb_reportdefinitionid})`
  });
  console.log(`  + ${locationLabel}: ${report.qdb_name}`);
}

console.log(`\n== Seed ribbon placements for "${TARGET_ENTITY}" → ${baseUrl} ==\n`);
const reportNavigationProperty = await reportLookupNavigationProperty();

for (const code of REPORT_CODES) {
  const report = await findReport(code);
  if (!report) continue;
  await ensurePlacement(report, PLACEMENT_TYPE.entityForm, 'form  ', reportNavigationProperty);
  await ensurePlacement(report, PLACEMENT_TYPE.entityGrid, 'grid  ', reportNavigationProperty);
}

const all = await api('GET',
  `qdb_reportribbonplacements?$select=qdb_name,qdb_placementtype&$filter=qdb_entitylogicalname eq '${TARGET_ENTITY}'`);
console.log(`\n✓ ${(all.value || []).length} placement(s) now on ${TARGET_ENTITY}\n`);
