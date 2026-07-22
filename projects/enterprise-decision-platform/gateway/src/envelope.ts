import { z } from 'zod';

/**
 * Canonical Decision Envelope (ADR-EDS-04).
 *
 * The gateway speaks one request/response shape regardless of the underlying transport.
 * A rule is addressed by an explicit published version (`versionId`) or resolved from its
 * `id` / `name` (latest published). The gateway never executes rules — it maps this envelope
 * onto the Dataverse decision Custom API and maps the result back (ADR-EDS-02).
 */

export const RuleRefSchema = z
  .object({
    versionId: z.string().uuid().optional(),
    id: z.string().uuid().optional(),
    name: z.string().min(1).optional(),
  })
  .refine((r) => Boolean(r.versionId ?? r.id ?? r.name), {
    message: 'rule must specify one of: versionId, id, name',
  });

export const EvaluateRequestSchema = z.object({
  meta: z
    .object({
      correlationId: z.string().min(1).optional(),
      source: z.string().min(1).optional(),
    })
    .optional(),
  rule: RuleRefSchema,
  input: z.record(z.unknown()).default({}),
  options: z
    .object({
      includeTrace: z.boolean().default(false),
    })
    .default({ includeTrace: false }),
});

export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>;

export interface ResponseMeta {
  readonly correlationId: string;
  readonly requestId: string;
  readonly executionId: string | null;
  readonly elapsedMs: number | null;
}

export interface EvaluateResponse {
  readonly meta: ResponseMeta;
  readonly matched: boolean;
  readonly outputs: Record<string, unknown>;
  readonly trace?: unknown;
  readonly diagnostics?: unknown;
}

export interface ErrorResponse {
  readonly meta: Pick<ResponseMeta, 'correlationId' | 'requestId'>;
  readonly error: { readonly code: string; readonly message: string; readonly details?: unknown };
}

/**
 * The decision runtime the gateway proxies to. The real implementation calls the Dataverse
 * Custom API; tests supply a fake. Keeping this an interface is what makes the gateway
 * transport-only and testable without a live org.
 */
export interface DecisionRuntime {
  resolvePublishedVersion(ref: { id?: string; name?: string }): Promise<{ versionId: string }>;
  evaluate(args: {
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
  }>;
}
