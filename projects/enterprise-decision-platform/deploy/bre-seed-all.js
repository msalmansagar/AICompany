'use strict';
// Seed a record using ALL GoRules node types (Request/Expression/DecisionTable/Switch/Function/Response).
const fs = require('fs'), https = require('https');
const env = (() => { const o = {}; for (const l of fs.readFileSync((process.env.EDP_ENV_PATH || 'D:/AI Projects/AICompany/projects/dynamic-form-engine/backend/.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) o[m[1]] = m[2].trim(); } return o; })();
const ORG = (env.DATAVERSE_URL || 'https://org5869857f.crm4.dynamics.com').replace(/\/$/, ''), HOST = new URL(ORG).host, API = '/api/data/v9.2';
function raw(method, path, token, body) { return new Promise((res, rej) => { const data = body == null ? null : JSON.stringify(body); const h = { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', Prefer: 'return=representation' }; if (token) h.Authorization = `Bearer ${token}`; if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = Buffer.byteLength(data); } const req = https.request({ host: HOST, path, method, headers: h }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b })); }); req.on('error', rej); if (data) req.write(data); req.end(); }); }
async function token() { const form = `client_id=${env.AZURE_CLIENT_ID}&client_secret=${encodeURIComponent(env.AZURE_CLIENT_SECRET)}&grant_type=client_credentials&scope=${encodeURIComponent(ORG + '/.default')}`; const r = await new Promise((res, rej) => { const req = https.request({ host: 'login.microsoftonline.com', path: `/${env.AZURE_TENANT_ID}/oauth2/v2.0/token`, method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(form) } }, x => { let b = ''; x.on('data', c => b += c); x.on('end', () => res({ status: x.statusCode, body: b })); }); req.on('error', rej); req.write(form); req.end(); }); return JSON.parse(r.body).access_token; }

const NAME = 'All Node Types — Sample';
const jdm = JSON.parse(fs.readFileSync('D:/AI Projects/AICompany/projects/enterprise-decision-platform/designer/all-nodes-graph.json', 'utf8'));

// PCRM = the decision-table portion (what the runtime executes; expression/switch/function shown on canvas only in this MVP).
const pcrm = {
  schemaVersion: '1.0', ruleId: 'all-node-types-sample', name: NAME, targetEntity: 'qdb_loanapplication',
  inputs: [
    { name: 'adjustedAmount', type: 'Decimal', binding: 'adjustedAmount' },
    { name: 'riskRating', type: 'Text', binding: 'riskRating' },
  ],
  outputs: [{ name: 'approvalLevel', type: 'Text' }, { name: 'manualReview', type: 'Boolean' }],
  logic: {
    type: 'decisionTable', hitPolicy: 'First',
    tableInputs: [{ field: 'adjustedAmount' }, { field: 'riskRating' }],
    outputColumns: ['approvalLevel', 'manualReview'],
    rows: [
      { priority: 4, cells: [{ operator: 'GreaterThan', value: 500000 }, { operator: 'Equals', value: 'High' }], outputs: { approvalLevel: 'CEO', manualReview: true } },
      { priority: 3, cells: [{ operator: 'GreaterThan', value: 500000 }, { operator: 'Equals', value: 'Low' }], outputs: { approvalLevel: 'CFO', manualReview: false } },
      { priority: 2, cells: [{ operator: 'Between', value: 100000, value2: 500000 }, { any: true }], outputs: { approvalLevel: 'Manager', manualReview: false } },
      { priority: 1, cells: [{ operator: 'LessThan', value: 100000 }, { any: true }], outputs: { approvalLevel: 'Officer', manualReview: false } },
    ],
  },
};

(async () => {
  const t = await token();
  const rel = await raw('GET', `${API}/RelationshipDefinitions(SchemaName='qdb_edp_rule_ruleversion_ruleid')/Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata?$select=ReferencingEntityNavigationPropertyName`, t);
  const navProp = JSON.parse(rel.body).ReferencingEntityNavigationPropertyName;

  const existing = await raw('GET', `${API}/qdb_edp_rules?$filter=${encodeURIComponent(`qdb_edp_rulename eq '${NAME.replace(/'/g, "''")}'`)}&$select=qdb_edp_ruleid`, t);
  let ruleId = (JSON.parse(existing.body).value || [])[0]?.qdb_edp_ruleid;
  if (ruleId) { console.log('reusing rule:', ruleId); }
  else {
    const rule = await raw('POST', `${API}/qdb_edp_rules`, t, { qdb_edp_rulename: NAME });
    if (rule.status >= 300) throw new Error('rule create ' + rule.status + ' ' + rule.body.slice(0, 300));
    ruleId = JSON.parse(rule.body).qdb_edp_ruleid; console.log('rule created:', ruleId);
  }

  const versionBody = {
    qdb_edp_ruleversionname: NAME + ' v1', qdb_edp_versionnumber: 1,
    qdb_edp_jdmsourcejson: JSON.stringify(jdm), qdb_edp_pcrmjson: JSON.stringify(pcrm),
  };
  versionBody[`${navProp}@odata.bind`] = `/qdb_edp_rules(${ruleId})`;
  const version = await raw('POST', `${API}/qdb_edp_ruleversions`, t, versionBody);
  if (version.status >= 300) throw new Error('version create ' + version.status + ' ' + version.body.slice(0, 400));
  console.log('version created:', JSON.parse(version.body).qdb_edp_ruleversionid);
  console.log('DONE — open designer, Open… "All Node Types — Sample".');
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
