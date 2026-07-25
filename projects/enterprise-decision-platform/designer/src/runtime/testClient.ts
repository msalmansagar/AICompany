// Executes a rule through the REAL C# runtime. Dual-mode:
//  - In CRM (deployed web resource): calls the qdb_edp_EvaluateDecision Custom API.
//  - In local dev: calls the C# harness via the /runtime vite proxy.

export interface TraceStep { kind: string; description: string; result: boolean | null; }
export interface Diagnostic { code: string; message: string; severity: string; }
export interface EvaluateResult {
  success: boolean;
  matched: boolean;
  outputs: Record<string, unknown>;
  reasonCodes: string[];
  elapsedMs: number;
  trace: TraceStep[];
  diagnostics: Diagnostic[];
}

function crmApiBase(): string | null {
  const w = window as any;
  const ctx = w.Xrm?.Utility?.getGlobalContext?.() ?? w.parent?.Xrm?.Utility?.getGlobalContext?.();
  if (ctx?.getClientUrl) return ctx.getClientUrl() + '/api/data/v9.2';
  if (location.hostname.endsWith('.dynamics.com')) return '/api/data/v9.2';
  return null;
}

export async function evaluate(pcrm: unknown, inputs: Record<string, unknown>): Promise<EvaluateResult> {
  const crm = crmApiBase();
  return crm ? evaluateViaCustomApi(crm, pcrm, inputs) : evaluateViaHarness(pcrm, inputs);
}

async function evaluateViaCustomApi(base: string, pcrm: unknown, inputs: Record<string, unknown>): Promise<EvaluateResult> {
  const res = await fetch(`${base}/qdb_edp_EvaluateDecision`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'OData-Version': '4.0', 'OData-MaxVersion': '4.0' },
    body: JSON.stringify({ PcrmJson: JSON.stringify(pcrm), InputsJson: JSON.stringify(inputs) }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `Custom API HTTP ${res.status}`;
    try { msg = JSON.parse(text)?.error?.message ?? msg; } catch { /* keep */ }
    throw new Error(msg);
  }
  const d = JSON.parse(text);
  return {
    success: !!d.Success,
    matched: !!d.Matched,
    outputs: safeParse(d.OutputsJson, {}),
    reasonCodes: safeParse(d.ReasonCodesJson, []),
    elapsedMs: d.ElapsedMs ?? 0,
    trace: safeParse(d.TraceJson, []),
    diagnostics: safeParse(d.DiagnosticsJson, []),
  };
}

async function evaluateViaHarness(pcrm: unknown, inputs: Record<string, unknown>): Promise<EvaluateResult> {
  let res: Response;
  try {
    res = await fetch('/runtime/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pcrm: JSON.stringify(pcrm), inputs, nowUtc: null }),
    });
  } catch {
    throw new Error('Local runtime not reachable on :5099. Start it: cd runtime/tools/EDP.RuleRuntime.DevHarness && dotnet run');
  }
  // A 5xx from the /runtime proxy almost always means the harness is down (the vite
  // proxy returns 500 when it can't reach :5099) rather than a real evaluation error.
  if (res.status >= 500) {
    throw new Error('Local runtime not reachable on :5099 (Test runs against the C# harness). Start it: cd runtime/tools/EDP.RuleRuntime.DevHarness && dotnet run');
  }
  if (!res.ok) throw new Error(`Runtime returned HTTP ${res.status}`);
  return (await res.json()) as EvaluateResult;
}

function safeParse<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string' || !s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
