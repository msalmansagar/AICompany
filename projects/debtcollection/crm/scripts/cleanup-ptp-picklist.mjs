// One-off sandbox cleanup: the PTP lifecycle moved to statuscode, so the picklist column
// msst_dcpptprecord.msst_ptpstatus and the global option set msst_dcpptpstatus are removed.
// Run from crm/scripts so the client module resolves.
import { loadConfig, acquireToken, apiGet, apiPost, buildHeaders } from './lib/crm-client.mjs';

const SOLUTION = 'msst_debtcollection';
const cfg = loadConfig();
const token = await acquireToken(cfg);

async function apiDelete(path) {
  const res = await fetch(`${cfg.apiBase}${path}`, { method: 'DELETE', headers: buildHeaders(token, SOLUTION) });
  if (res.status === 404) return 'absent';
  if (!res.ok) throw new Error(`DELETE ${path} -> ${res.status}: ${await res.text()}`);
  return 'deleted';
}

const column = "/EntityDefinitions(LogicalName='msst_dcpptprecord')/Attributes(LogicalName='msst_ptpstatus')";
const existing = await apiGet(cfg, token, SOLUTION, `${column}?$select=LogicalName`);
console.log('column msst_ptpstatus:', existing ? await apiDelete(column) : 'absent');

const set = "/GlobalOptionSetDefinitions(Name='msst_dcpptpstatus')";
const existingSet = await apiGet(cfg, token, SOLUTION, `${set}?$select=Name`);
console.log('option set msst_dcpptpstatus:', existingSet ? await apiDelete(set) : 'absent');

await apiPost(cfg, token, SOLUTION, '/PublishAllXml', {});
console.log('published');
