import { loadConfig, acquireToken, apiGet } from './lib/crm-client.mjs';
const cfg = loadConfig(); const token = await acquireToken(cfg);
const demo = await apiGet(cfg, token, null, "/qdb_collectioncases?$select=qdb_casenumber,qdb_customerbusinessid,qdb_facilitynumber,qdb_facilitysourcesystem,statuscode,_qdb_customerid_value&$filter=startswith(qdb_casenumber,'DEMO-')&$orderby=qdb_casenumber");
for (const c of demo.value) console.log(c.qdb_casenumber, '|', c.qdb_customerbusinessid, '|', c.qdb_facilitysourcesystem, c.qdb_facilitynumber, '| status', c['statuscode@OData.Community.Display.V1.FormattedValue'], '| customer', c['_qdb_customerid_value@OData.Community.Display.V1.FormattedValue'], c['_qdb_customerid_value@Microsoft.Dynamics.CRM.lookuplogicalname']);
const multi = await apiGet(cfg, token, null, "/qdb_collectioncases?$select=qdb_customerbusinessid&$filter=statecode eq 0&$top=5000");
const counts = {}; for (const c of multi.value) counts[c.qdb_customerbusinessid] = (counts[c.qdb_customerbusinessid] ?? 0) + 1;
console.log('customers with >1 open case:', Object.entries(counts).filter(([, n]) => n > 1).slice(0, 8).map(([id, n]) => id + ' x' + n).join(', '));
