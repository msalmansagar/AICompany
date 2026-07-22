/**
 * EDP Decision SDK — a thin, typed client for the Decision Gateway.
 *
 * Per ADR-EDS-09 the SDK is an *envelope builder only*: it assembles the canonical request,
 * calls the gateway, and returns the typed response. No decision logic, no Dataverse knowledge.
 */

export interface RuleRef {
  /** Evaluate a specific published version… */
  readonly versionId?: string;
  /** …or let the gateway resolve the latest published version by rule id… */
  readonly id?: string;
  /** …or by rule name. */
  readonly name?: string;
}

export interface DecisionRequest {
  readonly rule: RuleRef;
  readonly input?: Record<string, unknown>;
  readonly includeTrace?: boolean;
  readonly correlationId?: string;
}

export interface ValidateRequest {
  readonly rule: RuleRef;
  readonly correlationId?: string;
}

export interface RuleSetRequest {
  readonly ruleSetId: string;
  readonly input?: Record<string, unknown>;
  readonly correlationId?: string;
}

export interface ResponseMeta {
  readonly correlationId: string;
  readonly requestId: string;
  readonly executionId?: string | null;
  readonly elapsedMs?: number | null;
}

export interface DecisionResult {
  readonly meta: ResponseMeta;
  readonly matched: boolean;
  readonly outputs: Record<string, unknown>;
  readonly trace?: unknown;
  readonly diagnostics?: unknown;
}

export interface ValidateResult {
  readonly meta: ResponseMeta;
  readonly valid: boolean;
  readonly diagnostics: unknown;
}

export interface RuleSetResult {
  readonly meta: ResponseMeta;
  /** The rule set's native aggregate payload (policy, matched count, per-member results). */
  readonly result: unknown;
}

export interface SchemaResult {
  readonly meta: ResponseMeta;
  readonly inputs: unknown;
  readonly outputs: unknown;
}

export interface ReadResult {
  readonly meta: ResponseMeta;
  readonly result: unknown;
}

export interface ExplainRequest {
  readonly executionLogId: string;
  readonly correlationId?: string;
}

/** @deprecated use {@link DecisionResult}. */
export type EvaluateResult = DecisionResult;
/** @deprecated use {@link DecisionRequest}. */
export type EvaluateRequest = DecisionRequest;

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

  /** Evaluate a decision (durable — writes an execution log). */
  evaluate(request: DecisionRequest): Promise<DecisionResult> {
    return this.post('/v1/decisions/evaluate', decisionEnvelope(request));
  }

  /** Test a decision (no durable write). */
  test(request: DecisionRequest): Promise<DecisionResult> {
    return this.post('/v1/decisions/test', decisionEnvelope(request));
  }

  /** Validate a rule's structure. */
  validate(request: ValidateRequest): Promise<ValidateResult> {
    return this.post('/v1/rules/validate', {
      ...meta(request.correlationId),
      rule: request.rule,
    });
  }

  /** Evaluate a governed rule set by id. */
  evaluateRuleSet(request: RuleSetRequest): Promise<RuleSetResult> {
    return this.post('/v1/rule-sets/evaluate', {
      ...meta(request.correlationId),
      ruleSetId: request.ruleSetId,
      input: request.input ?? {},
    });
  }

  /** Get a rule's input/output schema. */
  getSchema(request: ValidateRequest): Promise<SchemaResult> {
    return this.post('/v1/rules/schema', { ...meta(request.correlationId), rule: request.rule });
  }

  /** Get a rule's version history (rule addressed by id or name). */
  getHistory(request: ValidateRequest): Promise<ReadResult> {
    return this.post('/v1/rules/history', { ...meta(request.correlationId), rule: request.rule });
  }

  /** Explain a past decision by its execution-log id. */
  explain(request: ExplainRequest): Promise<ReadResult> {
    return this.post('/v1/decisions/explain', { ...meta(request.correlationId), executionLogId: request.executionLogId });
  }

  private async post<T>(path: string, envelope: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;

    const res = await this.doFetch(`${this.baseUrl}${path}`, { method: 'POST', headers, body: JSON.stringify(envelope) });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (body as { error?: { code?: string; message?: string; details?: unknown } }).error;
      throw new EdpDecisionError(err?.code ?? 'gateway_error', err?.message ?? `Gateway returned ${res.status}.`, res.status, err?.details);
    }
    return body as T;
  }
}

function meta(correlationId?: string): { meta?: { correlationId: string } } {
  return correlationId ? { meta: { correlationId } } : {};
}

function decisionEnvelope(request: DecisionRequest): unknown {
  return {
    ...meta(request.correlationId),
    rule: request.rule,
    input: request.input ?? {},
    options: { includeTrace: request.includeTrace ?? false },
  };
}
