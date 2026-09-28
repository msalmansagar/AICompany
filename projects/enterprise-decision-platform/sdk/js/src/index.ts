/**
 * EDP Decision SDK — a thin, typed client for the Decision Gateway.
 *
 * Per ADR-EDS-09 the SDK is an *envelope builder only*: it assembles the canonical request,
 * calls the gateway, and returns the typed response. No decision logic, no Dataverse knowledge.
 */

export { canonicalizePcrm, computeContentHash } from './contentHash.js';

// ── Rule key validation (IC-3: one definition, matches contract pattern) ──────

/** Pattern a RuleKey must match. Upper-case is never accepted; never normalise. */
export const RULE_KEY_PATTERN = /^[a-z0-9]+([._-][a-z0-9]+)*$/;
export const RULE_KEY_MIN_LENGTH = 3;
export const RULE_KEY_MAX_LENGTH = 100;
export const CORRELATION_ID_MAX_LENGTH = 100;

// ── Outcome literal union (FR-B2-06) ─────────────────────────────────────────

export type DecisionOutcome = 'MATCHED' | 'NO_MATCH' | 'INPUT_REJECTED' | 'ENGINE_ERROR';

/** All outcome literals, in contract order. Used for parity assertions (IC-3). */
export const DECISION_OUTCOMES: ReadonlyArray<DecisionOutcome> = [
  'MATCHED',
  'NO_MATCH',
  'INPUT_REJECTED',
  'ENGINE_ERROR',
];

// ── Provenance (FR-B4-02, ADR-20) ────────────────────────────────────────────

/** Parsed from the gateway's ProvenanceJson field on every EvaluateDecision response. */
export interface DecisionProvenance {
  readonly executionId: string;
  readonly ruleId: string | null;
  readonly ruleKey: string | null;
  readonly ruleVersionId: string | null;
  readonly versionNumber: number | null;
  readonly contentHash: string;
  readonly evaluatedOnUtc: string;
  readonly correlationId: string | null;
}

// ── Rule addressing ───────────────────────────────────────────────────────────

export interface RuleRef {
  /** Evaluate a specific published version… */
  readonly versionId?: string;
  /** …or let the gateway resolve the latest published version by rule id… */
  readonly id?: string;
  /** …or by rule name… */
  readonly name?: string;
  /** …or by rule key (FR-B3-10). Must match RULE_KEY_PATTERN exactly; upper-case is rejected. */
  readonly key?: string;
}

// ── Request / response types ──────────────────────────────────────────────────

export interface DecisionRequest {
  readonly rule: RuleRef;
  readonly input?: Record<string, unknown>;
  readonly includeTrace?: boolean;
  /** 1–100 characters; validated client-side before sending. */
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
  /** Present on EvaluateDecision responses (FR-B2-06). */
  readonly outcome?: DecisionOutcome;
  /** Parsed from ProvenanceJson; present on EvaluateDecision responses (FR-B4-02). */
  readonly provenance?: DecisionProvenance | null;
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

/** Fields present in the result of identity operations (GetPublishedVersion, GetRuleHistory, etc.). */
export interface RuleIdentityResult {
  readonly ruleKey?: string | null;
  readonly nameIsAmbiguous?: boolean;
  readonly matchCount?: number;
  readonly ruleVersionId?: string;
  readonly ruleId?: string | null;
  readonly versionNumber?: number;
}

/** A declared input field in the GetInputSchema result. */
export interface InputSchemaField {
  readonly name: string;
  readonly type: string;
  /** "bound" = the rule reads this from the CRM record; "declared" = caller supplies it. */
  readonly kind?: 'bound' | 'declared';
  readonly binding?: string | null;
  readonly required?: boolean;
  readonly nullable?: boolean;
}

export interface SchemaResult {
  readonly meta: ResponseMeta;
  /** Typed when the caller casts; may include kind/binding/required/nullable from FR-B1-06. */
  readonly inputs: InputSchemaField[] | unknown;
  readonly outputs: unknown;
  /** Present when the rule declares a strict input contract. */
  readonly schemaVersion?: string;
  readonly inputContract?: string;
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

// ── Client ────────────────────────────────────────────────────────────────────

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
  async evaluate(request: DecisionRequest): Promise<DecisionResult> {
    return this.post('/v1/decisions/evaluate', decisionEnvelope(request));
  }

  /** Test a decision (no durable write). */
  async test(request: DecisionRequest): Promise<DecisionResult> {
    return this.post('/v1/decisions/test', decisionEnvelope(request));
  }

  /** Validate a rule's structure. */
  async validate(request: ValidateRequest): Promise<ValidateResult> {
    return this.post('/v1/rules/validate', {
      ...meta(request.correlationId),
      rule: ruleRefEnvelope(request.rule),
    });
  }

  /** Evaluate a governed rule set by id. */
  async evaluateRuleSet(request: RuleSetRequest): Promise<RuleSetResult> {
    return this.post('/v1/rule-sets/evaluate', {
      ...meta(request.correlationId),
      ruleSetId: request.ruleSetId,
      input: request.input ?? {},
    });
  }

  /** Get a rule's input/output schema. */
  async getSchema(request: ValidateRequest): Promise<SchemaResult> {
    return this.post('/v1/rules/schema', {
      ...meta(request.correlationId),
      rule: ruleRefEnvelope(request.rule),
    });
  }

  /** Get a rule's version history (rule addressed by id, name, or key). */
  async getHistory(request: ValidateRequest): Promise<ReadResult> {
    return this.post('/v1/rules/history', {
      ...meta(request.correlationId),
      rule: ruleRefEnvelope(request.rule),
    });
  }

  /** Explain a past decision by its execution-log id. */
  async explain(request: ExplainRequest): Promise<ReadResult> {
    return this.post('/v1/decisions/explain', {
      ...meta(request.correlationId),
      executionLogId: request.executionLogId,
    });
  }

  private async post<T>(path: string, envelope: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;

    const res = await this.doFetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(envelope),
    });
    const body: unknown = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = (body as { error?: { code?: string; message?: string; details?: unknown } }).error;
      throw new EdpDecisionError(
        err?.code ?? 'gateway_error',
        err?.message ?? `Gateway returned ${res.status}.`,
        res.status,
        err?.details,
      );
    }
    return body as T;
  }
}

// ── Envelope helpers ──────────────────────────────────────────────────────────

function meta(correlationId?: string): { meta?: { correlationId: string } } {
  return correlationId ? { meta: { correlationId } } : {};
}

/** Build the rule-ref object to send, passing key as-is after client-side validation. */
function ruleRefEnvelope(rule: RuleRef): Record<string, string | undefined> {
  if (rule.key !== undefined) validateRuleKey(rule.key);
  return {
    ...(rule.versionId !== undefined ? { versionId: rule.versionId } : {}),
    ...(rule.id !== undefined ? { id: rule.id } : {}),
    ...(rule.name !== undefined ? { name: rule.name } : {}),
    ...(rule.key !== undefined ? { key: rule.key } : {}),
  };
}

function decisionEnvelope(request: DecisionRequest): unknown {
  if (request.correlationId !== undefined) validateCorrelationId(request.correlationId);
  return {
    ...meta(request.correlationId),
    rule: ruleRefEnvelope(request.rule),
    input: request.input ?? {},
    options: { includeTrace: request.includeTrace ?? false },
  };
}

// ── Client-side validation ────────────────────────────────────────────────────

function validateRuleKey(key: string): void {
  if (key.length < RULE_KEY_MIN_LENGTH || key.length > RULE_KEY_MAX_LENGTH || !RULE_KEY_PATTERN.test(key))
    throw new EdpDecisionError(
      'invalid_rule_key',
      `RuleKey '${key}' must be ${RULE_KEY_MIN_LENGTH}–${RULE_KEY_MAX_LENGTH} lower-case alphanumeric characters (separators: . _ -).`,
      0,
    );
}

function validateCorrelationId(correlationId: string): void {
  if (correlationId.length === 0 || correlationId.length > CORRELATION_ID_MAX_LENGTH)
    throw new EdpDecisionError(
      'invalid_correlation_id',
      `correlationId must be 1–${CORRELATION_ID_MAX_LENGTH} characters.`,
      0,
    );
}
