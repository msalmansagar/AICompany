import type { GatewayConfig } from './config.js';
import type { DecisionRuntime } from './envelope.js';

/**
 * DecisionRuntime backed by the Dataverse decision Custom API (ADR-EDS-02: transport-only).
 * The gateway authenticates to Dataverse with its own service-principal credentials and
 * calls the native C# runtime that already runs in the sandbox — it never evaluates rules
 * itself. Rule resolution uses `qdb_edp_GetPublishedVersion`; evaluation uses
 * `qdb_edp_EvaluateDecision`.
 */
export class DataverseRuntime implements DecisionRuntime {
  private readonly api: string;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly cfg: GatewayConfig['dataverse']) {
    this.api = `${cfg.url}/api/data/v9.2`;
  }

  async resolvePublishedVersion(ref: { id?: string; name?: string }): Promise<{ versionId: string }> {
    const key = ref.id ? 'RuleId' : 'RuleName';
    const value = ref.id ?? ref.name ?? '';
    const url = `${this.api}/qdb_edp_GetPublishedVersion(${key}=@p)?@p=%27${encodeURIComponent(value)}%27`;
    const body = await this.get(url);
    const result = parseResultJson(body);
    const versionId = firstString(result, ['ruleVersionId', 'RuleVersionId', 'versionId', 'id']);
    if (!versionId) throw new RuntimeError('rule_not_found', `No published version for ${key} '${value}'.`);
    return { versionId };
  }

  async evaluate(args: {
    versionId: string;
    input: Record<string, unknown>;
    includeTrace: boolean;
  }): Promise<{
    matched: boolean;
    outputs: Record<string, unknown>;
    trace: unknown;
    diagnostics: unknown;
    elapsedMs: number | null;
    executionId: string | null;
  }> {
    const body = await this.post(`${this.api}/qdb_edp_EvaluateDecision`, {
      RuleVersionId: args.versionId,
      InputsJson: JSON.stringify(args.input),
    });
    return {
      matched: Boolean(body.Matched),
      outputs: safeJson(body.OutputsJson) ?? {},
      trace: args.includeTrace ? safeJson(body.TraceJson) ?? null : undefined,
      diagnostics: safeJson(body.DiagnosticsJson) ?? null,
      elapsedMs: typeof body.ElapsedMs === 'number' ? body.ElapsedMs : null,
      executionId: typeof body.ExecutionId === 'string' ? body.ExecutionId : null,
    };
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 60_000) return this.token.value;
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      scope: `${this.cfg.url}/.default`,
    });
    const res = await fetch(`https://login.microsoftonline.com/${this.cfg.tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    if (!res.ok) throw new RuntimeError('auth_failed', `Token request failed (${res.status}).`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: now + json.expires_in * 1000 };
    return this.token.value;
  }

  private async headers(): Promise<Record<string, string>> {
    return {
      Authorization: `Bearer ${await this.accessToken()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    };
  }

  private async get(url: string): Promise<Record<string, unknown>> {
    const res = await fetch(url, { headers: await this.headers() });
    if (!res.ok) throw new RuntimeError('dataverse_error', `Dataverse GET failed (${res.status}).`);
    return (await res.json()) as Record<string, unknown>;
  }

  private async post(url: string, payload: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(url, { method: 'POST', headers: await this.headers(), body: JSON.stringify(payload) });
    if (!res.ok) throw new RuntimeError('dataverse_error', `Dataverse POST failed (${res.status}).`);
    return (await res.json()) as Record<string, unknown>;
  }
}

export class RuntimeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'RuntimeError';
  }
}

function safeJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseResultJson(body: Record<string, unknown>): Record<string, unknown> {
  return safeJson(body.ResultJson) ?? body;
}

function firstString(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}
