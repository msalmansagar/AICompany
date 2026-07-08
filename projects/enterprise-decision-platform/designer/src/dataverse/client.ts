import type { DecisionGraphType } from '@gorules/jdm-editor';

// Dataverse Web API client — all calls go through the local /dataverse dev proxy
// (which injects the bearer token). Targets the qdb_edp_ tables in BusinessRuleEngine.

const RULES = 'qdb_edp_rules';
const VERSIONS = 'qdb_edp_ruleversions';

// Dual-mode base URL: inside CRM use the org Web API (same-origin session auth);
// in local dev use the /dataverse proxy (which injects a service-principal token).
function apiBase(): string {
  const w = window as any;
  const ctx = w.Xrm?.Utility?.getGlobalContext?.() ?? w.parent?.Xrm?.Utility?.getGlobalContext?.();
  if (ctx?.getClientUrl) return ctx.getClientUrl() + '/api/data/v9.2';
  // Hosted as a web resource (same-origin, session-authenticated) but no Xrm in scope.
  if (location.hostname.endsWith('.dynamics.com')) return '/api/data/v9.2';
  return '/dataverse'; // local dev proxy
}

async function req<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
  return json as T;
}

export interface RuleSummary { ruleId: string; name: string; }

export async function listRules(): Promise<RuleSummary[]> {
  const data = await req<{ value: any[] }>(`/${RULES}?$select=qdb_edp_rulename&$top=50&$orderby=createdon desc`);
  return data.value.map((r) => ({ ruleId: r.qdb_edp_ruleid, name: r.qdb_edp_rulename ?? '(unnamed)' }));
}

const LIFECYCLE: Record<number, string> = {
  100000000: 'Draft', 100000001: 'In Review', 100000002: 'Approved', 100000003: 'Published', 100000004: 'Retired',
};
export function lifecycleLabel(value: number | null | undefined): string {
  return value != null && LIFECYCLE[value] ? LIFECYCLE[value] : 'Draft';
}

export interface RuleRow {
  ruleId: string; name: string; entity: string; status: string;
  versionNumber: number; versionId: string; modifiedOn: string;
}

/** All rules with their latest version's status, entity, and version — for the Rules home grid. */
export async function listRulesDetailed(): Promise<RuleRow[]> {
  const data = await req<{ value: any[] }>(
    `/${VERSIONS}?$select=qdb_edp_ruleversionid,qdb_edp_versionnumber,qdb_edp_lifecyclestate,qdb_edp_pcrmjson,_qdb_edp_ruleid_value,modifiedon` +
      `&$expand=qdb_edp_ruleid($select=qdb_edp_rulename)&$orderby=qdb_edp_versionnumber desc&$top=250`
  );
  const latest = new Map<string, any>();
  for (const v of data.value) {
    const rid = v._qdb_edp_ruleid_value;
    if (!rid || latest.has(rid)) continue; // desc order → first seen per rule is its highest version
    latest.set(rid, v);
  }
  return [...latest.values()]
    .map((v) => {
      let entity = '';
      try { entity = JSON.parse(v.qdb_edp_pcrmjson ?? '{}').targetEntity ?? ''; } catch { /* ignore */ }
      return {
        ruleId: v._qdb_edp_ruleid_value as string,
        name: v.qdb_edp_ruleid?.qdb_edp_rulename ?? '(unnamed)',
        entity,
        status: lifecycleLabel(v.qdb_edp_lifecyclestate),
        versionNumber: v.qdb_edp_versionnumber ?? 1,
        versionId: v.qdb_edp_ruleversionid as string,
        modifiedOn: v.modifiedon ?? '',
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Copy a rule (latest version's content) into a new "… (copy)" Draft. */
export async function duplicateRule(ruleId: string): Promise<SaveResult> {
  const src = await req<any>(`/${RULES}(${ruleId})?$select=qdb_edp_rulename`);
  const data = await req<{ value: any[] }>(
    `/${VERSIONS}?$filter=_qdb_edp_ruleid_value eq ${ruleId}` +
      `&$select=qdb_edp_jdmsourcejson,qdb_edp_pcrmjson&$orderby=qdb_edp_versionnumber desc&$top=1`
  );
  const v = data.value[0];
  const newName = `${src.qdb_edp_rulename ?? 'Rule'} (copy)`;
  const rule = await req<any>(`/${RULES}`, 'POST', { qdb_edp_rulename: newName });
  const ruleId2: string = rule.qdb_edp_ruleid;
  const body: any = {
    qdb_edp_ruleversionname: `${newName} v1`, qdb_edp_versionnumber: 1,
    qdb_edp_jdmsourcejson: v?.qdb_edp_jdmsourcejson ?? '{}', qdb_edp_pcrmjson: v?.qdb_edp_pcrmjson ?? '{}',
    'qdb_edp_ruleid@odata.bind': `/${RULES}(${ruleId2})`,
  };
  let version: any;
  try { version = await req<any>(`/${VERSIONS}`, 'POST', body); }
  catch { delete body['qdb_edp_ruleid@odata.bind']; version = await req<any>(`/${VERSIONS}`, 'POST', body); }
  return { ruleId: ruleId2, versionId: version.qdb_edp_ruleversionid };
}

/** Delete a rule and its versions (caller gates on non-Published status). */
export async function deleteRule(ruleId: string): Promise<void> {
  const versions = await req<{ value: any[] }>(
    `/${VERSIONS}?$filter=_qdb_edp_ruleid_value eq ${ruleId}&$select=qdb_edp_ruleversionid`
  );
  for (const v of versions.value) await req<void>(`/${VERSIONS}(${v.qdb_edp_ruleversionid})`, 'DELETE');
  await req<void>(`/${RULES}(${ruleId})`, 'DELETE');
}

export interface SaveResult { ruleId: string; versionId: string; }

export async function saveRule(input: { name: string; jdmGraph: unknown; pcrm: unknown }): Promise<SaveResult> {
  const rule = await req<any>(`/${RULES}`, 'POST', { qdb_edp_rulename: input.name });
  const ruleId: string = rule.qdb_edp_ruleid;

  const versionBody: any = {
    qdb_edp_ruleversionname: `${input.name} v1`,
    qdb_edp_versionnumber: 1,
    qdb_edp_jdmsourcejson: JSON.stringify(input.jdmGraph),
    qdb_edp_pcrmjson: JSON.stringify(input.pcrm),
    'qdb_edp_ruleid@odata.bind': `/${RULES}(${ruleId})`,
  };

  let version: any;
  try {
    version = await req<any>(`/${VERSIONS}`, 'POST', versionBody);
  } catch {
    // Fall back if the single-valued nav property name differs — still lands the version record.
    delete versionBody['qdb_edp_ruleid@odata.bind'];
    version = await req<any>(`/${VERSIONS}`, 'POST', versionBody);
  }

  return { ruleId, versionId: version.qdb_edp_ruleversionid };
}

export interface LoadedVersion {
  jdmGraph: DecisionGraphType | null;
  targetEntity: string;
  ruleName: string;
  versionNumber: number;
  versionId: string | null;
  lifecycleState: string;
}

export async function loadLatestVersion(ruleId: string): Promise<LoadedVersion | null> {
  const rule = await req<any>(`/${RULES}(${ruleId})?$select=qdb_edp_rulename`);
  const data = await req<{ value: any[] }>(
    `/${VERSIONS}?$filter=_qdb_edp_ruleid_value eq ${ruleId}` +
      `&$select=qdb_edp_ruleversionid,qdb_edp_jdmsourcejson,qdb_edp_pcrmjson,qdb_edp_versionnumber,qdb_edp_lifecyclestate&$orderby=qdb_edp_versionnumber desc&$top=1`
  );
  const v = data.value[0];
  // The target entity lives inside the PCRM — restore it so field pickers can load.
  let targetEntity = '';
  try { targetEntity = v?.qdb_edp_pcrmjson ? (JSON.parse(v.qdb_edp_pcrmjson).targetEntity ?? '') : ''; } catch { /* ignore */ }
  return {
    jdmGraph: v?.qdb_edp_jdmsourcejson ? (JSON.parse(v.qdb_edp_jdmsourcejson) as DecisionGraphType) : null,
    targetEntity,
    ruleName: rule.qdb_edp_rulename ?? 'Rule',
    versionNumber: v?.qdb_edp_versionnumber ?? 0,
    versionId: v?.qdb_edp_ruleversionid ?? null,
    lifecycleState: lifecycleLabel(v?.qdb_edp_lifecyclestate),
  };
}

export interface ValidationResult {
  isValid: boolean;
  errorCount: number;
  warningCount: number;
  diagnostics: { code: string; message: string; severity: string; location?: string | null }[];
}

/** Validate a PCRM payload against the platform runtime (qdb_edp_ValidateRule). */
export async function validateRule(pcrm: unknown): Promise<ValidationResult> {
  const res = await req<{ ResultJson?: string }>(`/qdb_edp_ValidateRule`, 'POST', { PcrmJson: JSON.stringify(pcrm) });
  return JSON.parse(res.ResultJson ?? '{"isValid":false,"errorCount":0,"warningCount":0,"diagnostics":[]}');
}

/** Current lifecycle state label of a version (for the governance bar). */
export async function getVersionState(versionId: string): Promise<string> {
  const v = await req<any>(`/${VERSIONS}(${versionId})?$select=qdb_edp_lifecyclestate`);
  return lifecycleLabel(v.qdb_edp_lifecyclestate);
}
