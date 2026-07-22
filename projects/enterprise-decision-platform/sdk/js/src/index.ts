/**
 * EDP Decision SDK — a thin, typed client for the Decision Gateway.
 *
 * Per ADR-EDS-09 the SDK is an *envelope builder only*: it assembles the canonical request,
 * calls `POST /v1/decisions:evaluate`, and returns the typed response. It contains no decision
 * logic and no Dataverse knowledge — that lives behind the gateway.
 */

export interface RuleRef {
  /** Evaluate a specific published version… */
  readonly versionId?: string;
  /** …or let the gateway resolve the latest published version by rule id… */
  readonly id?: string;
  /** …or by rule name. */
  readonly name?: string;
}

export interface EvaluateRequest {
  readonly rule: RuleRef;
  readonly input?: Record<string, unknown>;
  readonly includeTrace?: boolean;
  readonly correlationId?: string;
}

export interface EvaluateResult {
  readonly meta: {
    readonly correlationId: string;
    readonly requestId: string;
    readonly executionId: string | null;
    readonly elapsedMs: number | null;
  };
  readonly matched: boolean;
  readonly outputs: Record<string, unknown>;
  readonly trace?: unknown;
  readonly diagnostics?: unknown;
}

export interface EdpClientOptions {
  readonly baseUrl: string;
  readonly apiKey?: string;
  /** Injectable for tests / non-global-fetch runtimes. Defaults to global `fetch`. */
  readonly fetch?: typeof fetch;
}

export class EdpDecisionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'EdpDecisionError';
  }
}

export class EdpClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly doFetch: typeof fetch;

  constructor(options: EdpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    const f = options.fetch ?? globalThis.fetch;
    if (!f) throw new Error('No fetch implementation available; pass options.fetch.');
    this.doFetch = f;
  }

  /** Evaluate a decision. Throws {@link EdpDecisionError} on a non-2xx response. */
  async evaluate(request: EvaluateRequest): Promise<EvaluateResult> {
    const envelope = {
      ...(request.correlationId ? { meta: { correlationId: request.correlationId } } : {}),
      rule: request.rule,
      input: request.input ?? {},
      options: { includeTrace: request.includeTrace ?? false },
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;

    const res = await this.doFetch(`${this.baseUrl}/v1/decisions:evaluate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(envelope),
    });

    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (body as { error?: { code?: string; message?: string; details?: unknown } }).error;
      throw new EdpDecisionError(err?.code ?? 'gateway_error', err?.message ?? `Gateway returned ${res.status}.`, res.status, err?.details);
    }
    return body as EvaluateResult;
  }
}
