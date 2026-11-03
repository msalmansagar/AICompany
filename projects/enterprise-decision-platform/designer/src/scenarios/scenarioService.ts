// Test Scenario Library — persists named test scenarios (inputs + expected outputs)
// to qdb_edp_ruletest, per rule. Foundation for regression testing.

import { apiBase } from '../dataverse/apiBase';
async function req<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${encodeURI(path)}`, {
    method, credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json as T;
}

const TESTS = 'qdb_edp_ruletests';

export interface Scenario {
  id: string;
  name: string;
  inputs: Record<string, unknown>;
  expected: Record<string, unknown>;
  lastResult: string; // 'pass' | 'fail' | ''
}

export async function saveScenario(ruleId: string, name: string, inputs: Record<string, unknown>, expected: Record<string, unknown>): Promise<string> {
  const body = {
    qdb_edp_ruletestname: name,
    qdb_edp_testcasesjson: JSON.stringify({ inputs, expected }),
    'qdb_edp_ruleid@odata.bind': `/qdb_edp_rules(${ruleId})`,
  };
  const r = await req<any>(`/${TESTS}`, 'POST', body);
  return r.qdb_edp_ruletestid;
}

export async function listScenarios(ruleId: string): Promise<Scenario[]> {
  const data = await req<{ value: any[] }>(
    `/${TESTS}?$filter=_qdb_edp_ruleid_value eq ${ruleId}&$select=qdb_edp_ruletestid,qdb_edp_ruletestname,qdb_edp_testcasesjson,qdb_edp_lastresult&$orderby=createdon desc`
  );
  return data.value.map((r) => {
    let inputs = {}, expected = {};
    try { const p = JSON.parse(r.qdb_edp_testcasesjson || '{}'); inputs = p.inputs ?? {}; expected = p.expected ?? {}; } catch { /* ignore */ }
    return { id: r.qdb_edp_ruletestid, name: r.qdb_edp_ruletestname ?? '', inputs, expected, lastResult: r.qdb_edp_lastresult ?? '' };
  });
}

export async function updateResult(scenarioId: string, result: 'pass' | 'fail'): Promise<void> {
  await req(`/${TESTS}(${scenarioId})`, 'PATCH', { qdb_edp_lastresult: result });
}

/** Deep-equal-ish compare of actual vs expected outputs (order-insensitive on keys). */
export function outputsMatch(expected: Record<string, unknown>, actual: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(expected ?? {}), ...Object.keys(actual ?? {})]);
  for (const k of keys) {
    if (String((expected ?? {})[k] ?? '') !== String((actual ?? {})[k] ?? '')) return false;
  }
  return true;
}
