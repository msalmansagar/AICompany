// Reads execution logs from qdb_edp_ruleexecutionlog (populated live by every rule run).
// Dual-mode: CRM Web API or the local /dataverse dev proxy.

function apiBase(): string {
  const w = window as any;
  const ctx = w.Xrm?.Utility?.getGlobalContext?.() ?? w.parent?.Xrm?.Utility?.getGlobalContext?.();
  if (ctx?.getClientUrl) return ctx.getClientUrl() + '/api/data/v9.2';
  if (location.hostname.endsWith('.dynamics.com')) return '/api/data/v9.2';
  return '/dataverse';
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase()}${encodeURI(path)}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json as T;
}

export interface LogRow {
  id: string;
  name: string;
  outcome: string;
  resolvedVersion: string;
  wouldResolve: string;
  durationMs: number;
  actor: string;
  executedOn: string;
}

const SELECT = [
  'qdb_edp_ruleexecutionlogid', 'qdb_edp_ruleexecutionlogname', 'qdb_edp_outcome',
  'qdb_edp_resolvedversion', 'qdb_edp_wouldresolveversion', 'qdb_edp_durationms',
  'qdb_edp_actor', 'qdb_edp_executedon',
].join(',');

export async function queryLogs(opts: { outcome?: string; top?: number } = {}): Promise<LogRow[]> {
  let path = `/qdb_edp_ruleexecutionlogs?$select=${SELECT}&$orderby=createdon desc&$top=${opts.top ?? 50}`;
  if (opts.outcome && opts.outcome !== 'all') path += `&$filter=qdb_edp_outcome eq '${opts.outcome}'`;
  const d = await get<{ value: any[] }>(path);
  return d.value.map((r) => ({
    id: r.qdb_edp_ruleexecutionlogid,
    name: r.qdb_edp_ruleexecutionlogname ?? '',
    outcome: r.qdb_edp_outcome ?? '',
    resolvedVersion: r.qdb_edp_resolvedversion ?? '',
    wouldResolve: r.qdb_edp_wouldresolveversion ?? '',
    durationMs: r.qdb_edp_durationms ?? 0,
    actor: r.qdb_edp_actor ?? '',
    executedOn: r['qdb_edp_executedon@OData.Community.Display.V1.FormattedValue'] ?? r.qdb_edp_executedon ?? '',
  }));
}

export function toCsv(rows: LogRow[]): string {
  const head = 'outcome,resolvedVersion,wouldResolve,durationMs,actor,executedOn';
  const body = rows.map((r) => [r.outcome, r.resolvedVersion, r.wouldResolve, r.durationMs, r.actor, r.executedOn]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  return head + '\n' + body;
}
