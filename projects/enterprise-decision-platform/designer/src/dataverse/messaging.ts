// Cloud vs on-prem message invocation.
//
// On Dataverse (cloud), read-only operations are Custom API **Functions** — invoked with the
// OData function-call GET syntax: `Name(P=@p)?@p='v'`. Dynamics 365 CE **on-premises** predates
// Custom API, so the same operations are deployed as Custom (Process) **Actions**, invoked with a
// plain POST and a params body. Both return the same `{ ResultJson }` envelope.
//
// Action-type messages (ValidateRule, RunScenarios, ExecuteRuleSet, EvaluateDecision,
// RuleGovernanceAction) are already POSTed and need no branching — they are Actions in both worlds.

export type MessageMode = 'customapi' | 'action';

/** Build-time flag: set VITE_EDP_ONPREM=true to target Dynamics 365 on-premises (Actions, not Functions). */
export function messageMode(): MessageMode {
  const env = (import.meta as any)?.env;
  return env?.VITE_EDP_ONPREM === 'true' || env?.VITE_EDP_ONPREM === true ? 'action' : 'customapi';
}

export interface MessageRequest {
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, string>;
}

/**
 * Build the request for a read-only operation. Pure — no I/O — so it's directly unit-testable.
 * cloud  → OData Function GET  `/Name(P=@p)?@p='v'`
 * onprem → Action POST         `/Name` with `{ P: 'v' }`
 * All string params are single-quoted + percent-encoded in the GET form (matching the cloud
 * function-call convention).
 */
export function functionRequest(mode: MessageMode, name: string, params: Record<string, string>): MessageRequest {
  if (mode === 'action') return { method: 'POST', path: `/${name}`, body: params };

  const keys = Object.keys(params);
  if (keys.length === 0) return { method: 'GET', path: `/${name}()` };

  const signature = keys.map((k) => `${k}=@${k}`).join(',');
  // Percent-encode the value and wrap it in literal %27 (single quotes) — encodeURIComponent
  // does not escape the apostrophe, so the quotes must be added explicitly (matches the cloud form).
  const query = keys.map((k) => `@${k}=%27${encodeURIComponent(params[k])}%27`).join('&');
  return { method: 'GET', path: `/${name}(${signature})?${query}` };
}
