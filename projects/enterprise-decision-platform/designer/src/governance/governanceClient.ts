// Calls the qdb_edp_RuleGovernanceAction Custom API (maker-checker lifecycle).
// CRM-only: governance runs server-side; in local dev it reports it needs CRM.

import { crmApiBase } from '../dataverse/apiBase';

export type GovernanceAction = 'Submit' | 'Approve' | 'Reject' | 'Publish' | 'Unpublish' | 'Retire';

export interface GovernanceResult { success: boolean; newState: string; message: string; }

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
