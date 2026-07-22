import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError, ZodTypeAny, z } from 'zod';
import {
  EvaluateRequestSchema,
  TestRequestSchema,
  ValidateRequestSchema,
  EvaluateRuleSetRequestSchema,
  type DecisionRuntime,
  type EvaluateOutcome,
  type EvaluateResponse,
  type ValidateResponse,
  type RuleSetResponse,
} from '../envelope.js';
import { RuntimeError } from '../dataverseRuntime.js';

interface Ctx {
  readonly id: string;
  readonly correlationId: string;
}

/**
 * The decision surface. Each route validates a canonical envelope, delegates to the runtime,
 * and maps the result back. No decision logic lives here (ADR-EDS-02).
 */
export function registerDecisionRoutes(app: FastifyInstance, runtime: DecisionRuntime): void {
  // Evaluate — durable (writes an execution log).
  app.post('/v1/decisions/evaluate', async (request, reply) => {
    const p = parse(EvaluateRequestSchema, request.body);
    const c = ctx(request.id, request.body);
    if (!p.ok) return badRequest(reply, c, p.error);
    try {
      const versionId = await resolveVersion(runtime, p.value.rule);
      const outcome = await runtime.evaluate({ versionId, input: p.value.input, includeTrace: p.value.options.includeTrace });
      return reply.code(200).send(decisionResponse(c, outcome, p.value.options.includeTrace));
    } catch (error) {
      return fail(reply, c, error);
    }
  });

  // Test — same decision, no durable execution-log write.
  app.post('/v1/decisions/test', async (request, reply) => {
    const p = parse(TestRequestSchema, request.body);
    const c = ctx(request.id, request.body);
    if (!p.ok) return badRequest(reply, c, p.error);
    try {
      const versionId = await resolveVersion(runtime, p.value.rule);
      const outcome = await runtime.test({ versionId, input: p.value.input, includeTrace: p.value.options.includeTrace });
      return reply.code(200).send(decisionResponse(c, outcome, p.value.options.includeTrace));
    } catch (error) {
      return fail(reply, c, error);
    }
  });

  // Validate — structural validation of a rule version.
  app.post('/v1/rules/validate', async (request, reply) => {
    const p = parse(ValidateRequestSchema, request.body);
    const c = ctx(request.id, request.body);
    if (!p.ok) return badRequest(reply, c, p.error);
    try {
      const versionId = await resolveVersion(runtime, p.value.rule);
      const outcome = await runtime.validate({ versionId });
      const response: ValidateResponse = { meta: { correlationId: c.correlationId, requestId: c.id }, valid: outcome.valid, diagnostics: outcome.diagnostics };
      return reply.code(200).send(response);
    } catch (error) {
      return fail(reply, c, error);
    }
  });

  // Evaluate a governed rule set by id.
  app.post('/v1/rule-sets/evaluate', async (request, reply) => {
    const p = parse(EvaluateRuleSetRequestSchema, request.body);
    const c = ctx(request.id, request.body);
    if (!p.ok) return badRequest(reply, c, p.error);
    try {
      const { result } = await runtime.evaluateRuleSet({ ruleSetId: p.value.ruleSetId, input: p.value.input });
      const response: RuleSetResponse = { meta: { correlationId: c.correlationId, requestId: c.id }, result };
      return reply.code(200).send(response);
    } catch (error) {
      return fail(reply, c, error);
    }
  });
}

// --- helpers ------------------------------------------------------------------

async function resolveVersion(runtime: DecisionRuntime, rule: { versionId?: string; id?: string; name?: string }): Promise<string> {
  return rule.versionId ?? (await runtime.resolvePublishedVersion(rule)).versionId;
}

function decisionResponse(c: Ctx, outcome: EvaluateOutcome, includeTrace: boolean): EvaluateResponse {
  return {
    meta: { correlationId: c.correlationId, requestId: c.id, executionId: outcome.executionId, elapsedMs: outcome.elapsedMs },
    matched: outcome.matched,
    outputs: outcome.outputs,
    diagnostics: outcome.diagnostics,
    ...(includeTrace ? { trace: outcome.trace } : {}),
  };
}

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ZodError };
function parse<S extends ZodTypeAny>(schema: S, body: unknown): ParseResult<z.infer<S>> {
  const r = schema.safeParse(body);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error };
}

function ctx(requestId: string, body: unknown): Ctx {
  return { id: requestId, correlationId: correlationOf(body, requestId) };
}

function correlationOf(body: unknown, requestId: string): string {
  if (body && typeof body === 'object' && 'meta' in body) {
    const meta = (body as { meta?: { correlationId?: unknown } }).meta;
    if (meta && typeof meta.correlationId === 'string') return meta.correlationId;
  }
  return requestId;
}

function badRequest(reply: FastifyReply, c: Ctx, error: ZodError): FastifyReply {
  return reply.code(400).send({
    meta: { correlationId: c.correlationId, requestId: c.id },
    error: { code: 'invalid_request', message: 'Request envelope failed validation.', details: error.issues },
  });
}

function fail(reply: FastifyReply, c: Ctx, error: unknown): FastifyReply {
  const code = error instanceof RuntimeError ? error.code : 'runtime_error';
  const status = code === 'rule_not_found' ? 404 : 502;
  return reply.code(status).send({
    meta: { correlationId: c.correlationId, requestId: c.id },
    error: { code, message: error instanceof Error ? error.message : 'Decision operation failed.' },
  });
}
