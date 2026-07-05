// Calls the qdb_edp_RuleGovernanceAction Custom API (maker-checker lifecycle).
// CRM-only: governance runs server-side; in local dev it reports it needs CRM.

export type GovernanceAction = 'Submit' | 'Approve' | 'Reject' | 'Publish' | 'Retire';

export interface GovernanceResult { success: boolean; newState: string; message: string; }

function crmApiBase(): string | null {
  const w = window as any;
  const ctx = w.Xrm?.Utility?.getGlobalContext?.() ?? w.parent?.Xrm?.Utility?.getGlobalContext?.();
  if (ctx?.getClientUrl) return ctx.getClientUrl() + '/api/data/v9.2';
  if (location.hostname.endsWith('.dynamics.com')) return '/api/data/v9.2';
  return null;
}

export async function performAction(versionId: string, action: GovernanceAction, comments = ''): Promise<GovernanceResult> {
  const base = crmApiBase();
  if (!base) throw new Error('Governance actions run in CRM only (save/open a rule in the deployed designer).');

  const res = await fetch(`${base}/qdb_edp_RuleGovernanceAction`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
    body: JSON.stringify({ RuleVersionId: versionId, Action: action, Comments: comments }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  const d = JSON.parse(text);
  return { success: !!d.Success, newState: d.NewState ?? '', message: d.Message ?? '' };
}
