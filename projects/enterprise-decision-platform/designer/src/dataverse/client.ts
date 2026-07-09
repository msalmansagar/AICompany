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

async function req<T>(path: string, method = 'GET', body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0', ...(extraHeaders ?? {}) },
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

// ── Governed rule sets (qdb_edp_ruleset) ──────────────────────────────────────
// A rule set owns which rules run (members) and how their outcomes combine (policy),
// so callers of qdb_edp_ExecuteRuleSet can't redefine the decision.

const RULESETS = 'qdb_edp_rulesets';
export const SET_POLICIES = ['Collect', 'FirstMatch', 'Priority'] as const;
export type SetPolicy = (typeof SET_POLICIES)[number];

/** A member references a rule by id (runs its Published version) with a result key + order. */
export interface RuleSetMember { key: string; ruleId: string; order: number; }
export interface RuleSetRow { id: string; name: string; policy: string; memberCount: number; modifiedOn: string; }
export interface LoadedRuleSet { id: string; name: string; description: string; policy: SetPolicy; members: RuleSetMember[]; }

function parseMembers(json: string | undefined): any[] {
  try { const a = JSON.parse(json ?? '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}

// Members may reference a rule by a pinned ruleVersionId; the designer edits sets in terms
// of "run the Published version" (ruleId), so resolve any pinned members back to their rule.
async function resolveMembers(raw: any[]): Promise<RuleSetMember[]> {
  const pinned = raw.filter((m) => !m.ruleId && m.ruleVersionId);
  const byVersion = new Map<string, string>();
  if (pinned.length) {
    const filter = pinned.map((m) => `qdb_edp_ruleversionid eq ${m.ruleVersionId}`).join(' or ');
    const vr = await req<{ value: any[] }>(`/${VERSIONS}?$select=qdb_edp_ruleversionid,_qdb_edp_ruleid_value&$filter=${filter}`);
    for (const v of vr.value) byVersion.set(v.qdb_edp_ruleversionid, v._qdb_edp_ruleid_value);
  }
  return raw.map((m, i) => ({ key: m.key ?? `rule${i + 1}`, ruleId: m.ruleId ?? byVersion.get(m.ruleVersionId) ?? '', order: m.order ?? i + 1 }));
}

export async function listRuleSets(): Promise<RuleSetRow[]> {
  const data = await req<{ value: any[] }>(
    `/${RULESETS}?$select=qdb_edp_rulesetid,qdb_edp_rulesetname,qdb_edp_setpolicy,qdb_edp_membersjson,modifiedon&$orderby=qdb_edp_rulesetname asc&$top=250`
  );
  return data.value.map((r) => ({
    id: r.qdb_edp_rulesetid, name: r.qdb_edp_rulesetname ?? '(unnamed)',
    policy: r.qdb_edp_setpolicy || 'Collect', memberCount: parseMembers(r.qdb_edp_membersjson).length,
    modifiedOn: r.modifiedon ?? '',
  }));
}

export async function loadRuleSet(id: string): Promise<LoadedRuleSet> {
  const r = await req<any>(`/${RULESETS}(${id})?$select=qdb_edp_rulesetname,qdb_edp_description,qdb_edp_setpolicy,qdb_edp_membersjson`);
  return {
    id, name: r.qdb_edp_rulesetname ?? 'Rule set', description: r.qdb_edp_description ?? '',
    policy: (SET_POLICIES.includes(r.qdb_edp_setpolicy) ? r.qdb_edp_setpolicy : 'Collect') as SetPolicy,
    members: await resolveMembers(parseMembers(r.qdb_edp_membersjson)),
  };
}

export interface SaveRuleSetInput { id?: string; name: string; description?: string; policy: SetPolicy; members: RuleSetMember[]; }

export async function saveRuleSet(input: SaveRuleSetInput): Promise<string> {
  const body = {
    qdb_edp_rulesetname: input.name, qdb_edp_description: input.description ?? '',
    qdb_edp_setpolicy: input.policy, qdb_edp_membersjson: JSON.stringify(input.members),
  };
  if (input.id) { await req(`/${RULESETS}(${input.id})`, 'PATCH', body); return input.id; }
  const created = await req<any>(`/${RULESETS}`, 'POST', body, { Prefer: 'return=representation' });
  return created.qdb_edp_rulesetid;
}

export async function deleteRuleSet(id: string): Promise<void> {
  await req<void>(`/${RULESETS}(${id})`, 'DELETE');
}

export interface RuleSetMemberResult {
  key: string; ruleVersionId?: string; ruleId?: string;
  success: boolean; matched: boolean; outputs?: Record<string, unknown>; message?: string;
}
export interface RuleSetResult {
  ruleSetId: string | null; policy: string; count: number; matchedCount: number;
  results: RuleSetMemberResult[]; aggregate: { outputs: Record<string, unknown>; byRule: Record<string, unknown> };
}

/** Execute a governed set through the runtime (qdb_edp_ExecuteRuleSet). Cloud-backed. */
export async function executeRuleSet(setId: string, inputs: Record<string, unknown>): Promise<RuleSetResult> {
  const res = await req<{ ResultJson?: string }>(`/qdb_edp_ExecuteRuleSet`, 'POST', { RuleSetId: setId, InputsJson: JSON.stringify(inputs) });
  return JSON.parse(res.ResultJson ?? '{}');
}
