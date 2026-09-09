// Adds the companion block the Loan Origination Lineage report promised: the SQL's
// COUNT(...) OVER (PARTITION BY facility) has no FetchXML equivalent, so the count becomes its
// own dataset — an authored AGGREGATE query grouped by facility, shown as a bar chart beside the
// listing. Unscoped on purpose: the lineage lists every loan, so the counts are org-wide, exactly
// what the window function computed. A facility with no tickets does not appear — grouping only
// groups what exists, and inventing a zero row would be the fabricated-value defect again.
//
// Idempotent by source alias. Usage: node add-lineage-disbursement-block.mjs <path-to-.env>
import { connect } from './lib/dataverse.mjs';

const REPORT_NAME = 'Loan Origination Lineage';
const ALIAS = 'dpf';
const COMPOSITION_STANDALONE = 100000001;
const SOURCE_TYPE_FETCHXML = 100000001;

const AGGREGATE_FETCHXML =
  "<fetch aggregate='true'><entity name='qdb_payment_authorization_ticket'>"
  + "<attribute name='qdb_payment_authorization_ticketid' aggregate='count' alias='disbursements'/>"
  + "<attribute name='qdb_limit_no' groupby='true' alias='facility'/>"
  + '</entity></fetch>';

const dv = await connect(process.argv[2]);

/** Creates the record and returns its id from the OData-EntityId header — the one place a create's
    id always lives; a deployment that returns a body too is not relied on for it. */
async function createId(set, body) {
  const res = await dv.request(`${dv.baseUrl}/api/data/v${dv.apiVersion}/${set}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`create ${set} ${res.status}: ${await res.text()}`);
  const header = ((res.headers.get('OData-EntityId') || '').match(/\(([0-9a-fA-F-]{36})\)/) || [])[1];
  if (!header) throw new Error(`created in ${set} but the response carried no OData-EntityId`);
  return header;
}

// A doubled quote is OData's own escape; URI-encoding a QUOTED literal is the wrong tool.
const report = (await dv.fetchJson(
  `qdb_reportdefinitions?$select=qdb_reportdefinitionid&$filter=qdb_name eq '${REPORT_NAME.replace(/'/g, "''")}'`)).value[0];
if (!report) throw new Error(`report "${REPORT_NAME}" not found`);
const reportId = report.qdb_reportdefinitionid;

const sources = (await dv.fetchJson(
  `qdb_reportdatasources?$select=qdb_sourcealias,qdb_executionorder&$filter=_qdb_reportdefinitionid_value eq ${reportId}`)).value;
if (sources.some(source => source.qdb_sourcealias === ALIAS)) {
  console.log(`· block "${ALIAS}" already exists on ${REPORT_NAME} — nothing to do`);
  process.exit(0);
}

const order = Math.max(0, ...sources.map(source => source.qdb_executionorder || 0)) + 1;
const sourceId = await createId('qdb_reportdatasources', {
  qdb_name: 'Disbursements per facility',
  qdb_isprimary: false,
  qdb_executionorder: order,
  qdb_sourcealias: ALIAS,
  qdb_compositionmode: COMPOSITION_STANDALONE,
  qdb_sourcetype: SOURCE_TYPE_FETCHXML,
  qdb_querypayload: AGGREGATE_FETCHXML,
  qdb_isenabled: true,
  'Qdb_reportdefinitionid@odata.bind': `/qdb_reportdefinitions(${reportId})`
});
const mappingId = await createId('qdb_reportentitymappings', {
  qdb_name: 'qdb_payment_authorization_ticket',
  qdb_entitylogicalname: 'qdb_payment_authorization_ticket',
  qdb_entityalias: ALIAS,
  qdb_depth: 0,
  'Qdb_reportdatasourceid@odata.bind': `/qdb_reportdatasources(${sourceId})`
});
const columns = [
  { display: 'Facility', logical: 'facility', order: 1 },
  { display: 'Disbursements', logical: 'disbursements', order: 2 }
];
for (const column of columns) {
  await createId('qdb_reportcolumns', {
    qdb_name: column.display,
    qdb_columnlogicalname: column.logical,
    qdb_outputalias: column.logical,
    qdb_sortorder: column.order,
    qdb_isvisible: true,
    'Qdb_reportentitymappingid@odata.bind': `/qdb_reportentitymappings(${mappingId})`
  });
}
console.log(`  ✓ created block "${ALIAS}" (order ${order}) with its aggregate query and columns`);

// The band: a half-width bar chart beside the listing, chrome-barred like a dashboard panel.
const layoutRow = (await dv.fetchJson(
  `qdb_reportlayouts?$select=qdb_reportlayoutid,qdb_layoutjson&$filter=_qdb_reportdefinitionid_value eq ${reportId}`)).value[0];
if (!layoutRow) throw new Error('the report has no layout row to carry the band');
const layout = JSON.parse(layoutRow.qdb_layoutjson || '{}');
layout.datasetLayout = layout.datasetLayout || {};
layout.datasetLayout[ALIAS] = {
  title: 'Disbursements per facility', width: 'half', icon: 'chart',
  displayAs: 'bars', valueColumn: 'disbursements', labelColumn: 'facility'
};
await dv.fetchJson(`qdb_reportlayouts(${layoutRow.qdb_reportlayoutid})`, {
  method: 'PATCH',
  body: JSON.stringify({ qdb_layoutjson: JSON.stringify(layout) })
});
console.log('  ✓ band authored: half-width bar chart, facility × disbursements');
