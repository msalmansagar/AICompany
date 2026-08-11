// Seeds RPT-DEMO-ALL: one report that exercises joins, a layout, a formula, transformations and
// conditional formatting together, so the whole engine can be checked in a single run.
// Idempotent — deletes and rebuilds itself. Pass --remove to delete it and stop.
import { readFileSync } from 'node:fs';

const CODE = 'RPT-DEMO-ALL';
const NAME = 'Demo — everything at once';

function loadEnv(path) {
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv(process.argv[2]);
const baseUrl = env.DV_DATAVERSE_URL.replace(/\/$/, '');
const body = new URLSearchParams({ grant_type:'client_credentials', client_id:env.DV_CLIENT_ID,
  client_secret:env.DV_CLIENT_SECRET, scope:`${baseUrl}/.default` });
const token = (await (await fetch(`https://login.microsoftonline.com/${env.DV_TENANT_ID}/oauth2/v2.0/token`,
  { method:'POST', body })).json()).access_token;
const H = { Authorization:`Bearer ${token}`, Accept:'application/json', 'Content-Type':'application/json' };

const get = async p => (await (await fetch(`${baseUrl}/api/data/v9.2/${p}`, { headers:H })).json());
const post = async (set, data) => {
  const r = await fetch(`${baseUrl}/api/data/v9.2/${set}`, { method:'POST', headers:H, body:JSON.stringify(data) });
  if (!r.ok) throw new Error(`${set}: ${r.status} ${(await r.text()).slice(0,260)}`);
  return /\(([0-9a-f-]{36})\)/i.exec(r.headers.get('OData-EntityId'))[1];
};
const del = (set, id) => fetch(`${baseUrl}/api/data/v9.2/${set}(${id})`, { method:'DELETE', headers:H });

// --- remove any previous run, children first -------------------------------------------------
const existing = await get(`qdb_reportdefinitions?$filter=qdb_reportcode eq '${CODE}'&$select=qdb_reportdefinitionid`);
for (const def of existing.value ?? []) {
  const id = def.qdb_reportdefinitionid;
  for (const src of (await get(`qdb_reportdatasources?$filter=_qdb_reportdefinitionid_value eq ${id}&$select=qdb_reportdatasourceid`)).value ?? []) {
    for (const map of (await get(`qdb_reportentitymappings?$filter=_qdb_reportdatasourceid_value eq ${src.qdb_reportdatasourceid}&$select=qdb_reportentitymappingid`)).value ?? []) {
      for (const col of (await get(`qdb_reportcolumns?$filter=_qdb_reportentitymappingid_value eq ${map.qdb_reportentitymappingid}&$select=qdb_reportcolumnid`)).value ?? [])
        await del('qdb_reportcolumns', col.qdb_reportcolumnid);
      await del('qdb_reportentitymappings', map.qdb_reportentitymappingid);
    }
    await del('qdb_reportdatasources', src.qdb_reportdatasourceid);
  }
  for (const [set, key] of [['qdb_reportformulas','qdb_reportformulaid'], ['qdb_reporttransformations','qdb_reporttransformationid'],
                            ['qdb_reportlayouts','qdb_reportlayoutid'], ['qdb_reportfilters','qdb_reportfilterid']])
    for (const row of (await get(`${set}?$filter=_qdb_reportdefinitionid_value eq ${id}&$select=${key}`)).value ?? [])
      await del(set, row[key]);
  await del('qdb_reportdefinitions', id);
  console.log(`removed the previous ${CODE}`);
}
if (process.argv.includes('--remove')) { console.log('done — nothing seeded'); process.exit(0); }

// --- rebuild -----------------------------------------------------------------------------------
const reportId = await post('qdb_reportdefinitions', {
  qdb_name: NAME, qdb_reportcode: CODE, qdb_mainentitylogicalname: 'account', qdb_rowlimit: 100,
  qdb_description: 'Joins account to contact, groups by status, adds a computed column, renames and masks, and highlights rows.'
});
const srcId = await post('qdb_reportdatasources', { qdb_name:'Primary source', qdb_isprimary:true, qdb_sourcealias:'t',
  qdb_executionorder:1, 'Qdb_reportdefinitionid@odata.bind':`/qdb_reportdefinitions(${reportId})` });

const rootMap = await post('qdb_reportentitymappings', { qdb_name:'account', qdb_entitylogicalname:'account',
  qdb_entityalias:'t', qdb_depth:0, 'Qdb_reportdatasourceid@odata.bind':`/qdb_reportdatasources(${srcId})` });
for (const [i, a] of ['name','accountnumber','statecode'].entries())
  await post('qdb_reportcolumns', { qdb_name:a, qdb_columnlogicalname:a, qdb_outputalias:a, qdb_sortorder:i+1,
    qdb_isvisible:true, 'Qdb_reportentitymappingid@odata.bind':`/qdb_reportentitymappings(${rootMap})` });

// The join — contact.parentcustomerid → account.accountid
const joinMap = await post('qdb_reportentitymappings', { qdb_name:'contact', qdb_entitylogicalname:'contact',
  qdb_entityalias:'j1', qdb_depth:1, qdb_jointype:100000000,
  qdb_joinexpressionjson: JSON.stringify({ from:'parentcustomerid', to:'accountid' }),
  'Qdb_reportdatasourceid@odata.bind':`/qdb_reportdatasources(${srcId})` });
for (const [i, a] of ['fullname','emailaddress1'].entries())
  await post('qdb_reportcolumns', { qdb_name:a, qdb_columnlogicalname:a, qdb_outputalias:a, qdb_sortorder:i+4,
    qdb_isvisible:true, 'Qdb_reportentitymappingid@odata.bind':`/qdb_reportentitymappings(${joinMap})` });

await post('qdb_reportformulas', { qdb_name:'hasEmail', qdb_formulaalias:'hasEmail',
  qdb_expression:"if(emailaddress1 != '', 'yes', 'no')", qdb_evaluationorder:1, qdb_isconditional:false,
  'Qdb_reportdefinitionid@odata.bind':`/qdb_reportdefinitions(${reportId})` });

for (const [order, type, config] of [
  [1, 100000000, { renames: { fullname:'Contact', emailaddress1:'Email', accountnumber:'Account no.' } }],
  [2, 100000016, { columns:['accountnumber'], keepLast:3 }],
  [3, 100000017, { default:'—' }]
]) await post('qdb_reporttransformations', { qdb_name:'step'+order, qdb_transformtype:type,
      qdb_configjson: JSON.stringify(config), qdb_steporder:order, qdb_enabled:true,
      'Qdb_reportdefinitionid@odata.bind':`/qdb_reportdefinitions(${reportId})` });

await post('qdb_reportlayouts', { qdb_name:'Layout', qdb_themecolor:'#0078d4',
  qdb_layoutjson: JSON.stringify({
    type:'Grouped Report', grandTotal:true, groupBy:'statecode',
    conditionalFormatting: [
      { column:'hasEmail', condition:"value == 'no'", style:'Amber highlight' },
      { column:'fullname', condition:"emailaddress1 != ''", style:'Bold' }
    ]
  }), 'Qdb_reportdefinitionid@odata.bind':`/qdb_reportdefinitions(${reportId})` });

console.log(`seeded ${CODE} — ${NAME}`);
console.log(`  joins: account ⋈ contact | layout: Grouped Report | formula: hasEmail`);
console.log(`  transforms: rename + mask + null-handling | 2 conditional-formatting rules`);
console.log(`  report id: ${reportId}`);
