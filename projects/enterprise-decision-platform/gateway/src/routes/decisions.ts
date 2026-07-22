import type { FastifyInstance } from 'fastify';
import { EvaluateRequestSchema, type DecisionRuntime, type EvaluateResponse } from '../envelope.js';
import { RuntimeError } from '../dataverseRuntime.js';

/**
 * POST /v1/decisions:evaluate — the one decision endpoint. Validates the canonical envelope,
 * resolves the rule to a published version if needed, calls the runtime, and maps the result
 * back into a response envelope. No decision logic lives here.
 */
export function registerDecisionRoutes(app: FastifyInstance, runtime: DecisionRuntime): void {
  app.post('/v1/decisions:evaluate', async (request, reply) => {
    const parsed = EvaluateRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        meta: { correlationId: correlationOf(request), requestId: request.id },
        error: { code: 'invalid_request', message: 'Request envelope failed validation.', details: parsed.error.issues },
      });
    }

    const req = parsed.data;
    const correlationId = req.meta?.correlationId ?? request.id;

    try {
      const versionId = req.rule.versionId ?? (await runtime.resolvePublishedVersion(req.rule)).versionId;
      const result = await runtime.evaluate({
        versionId,
        input: req.input,
        includeTrace: req.options.includeTrace,
      });

      const response: EvaluateResponse = {
        meta: { correlationId, requestId: request.id, executionId: result.executionId, elapsedMs: result.elapsedMs },
        matched: result.matched,
        outputs: result.outputs,
        diagnostics: result.diagnostics,
        ...(req.options.includeTrace ? { trace: result.trace } : {}),
      };
      return reply.code(200).send(response);
    } catch (error) {
      const code = error instanceof RuntimeError ? error.code : 'runtime_error';
      const status = code === 'rule_not_found' ? 404 : 502;
      return reply.code(status).send({
        meta: { correlationId, requestId: request.id },
        error: { code, message: error instanceof Error ? error.message : 'Decision evaluation failed.' },
      });
    }
  });
}

function correlationOf(request: { body?: unknown; id: string }): string {
  const body = request.body;
  if (body && typeof body === 'object' && 'meta' in body) {
    const meta = (body as { meta?: { correlationId?: unknown } }).meta;
    if (meta && typeof meta.correlationId === 'string') return meta.correlationId;
  }
  return request.id;
}
