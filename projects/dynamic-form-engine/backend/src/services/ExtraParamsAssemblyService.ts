// ExtraParamsAssemblyService — DFE-BTN-001 Theme C (conditions C-004, C-005, C-007).
//
// Resolves a FinalSubmit button's ExtraParam specification into a concrete
// envelope at submit time. The button specification is read from the PUBLISHED
// form definition (never trusted from the client — see ADR-BTN-005), and:
//   - 'static'         → the design-time constant verbatim;
//   - 'hiddenField'    → the current value of the referenced field;
//   - 'runtimeContext' → stamped AUTHORITATIVELY from server context, overriding
//                        any client-supplied value (C-004);
//   - 'computed'       → evaluated server-side via ExpressionEngineServer, which
//                        forbids eval and bounds work/time (C-005).
// The resolved envelope is size-capped before it leaves this service (C-007).

import type {
  ExtraParamSpec,
  ResolvedExtraParams,
  RuntimeContextKey,
  FormDefinition,
  ScopedButton,
} from '@qdb/shared';
import { ExpressionEngineServer, ExpressionError, ExpressionTimeoutError } from '@qdb/shared';
import type { ExpressionContext, ExpressionValue } from '@qdb/shared';
import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Maximum serialized size of the resolved envelope (C-007). Env-tunable for OQ-008. */
export const MAX_EXTRA_PARAMS_BYTES = Number(process.env['MAX_EXTRA_PARAMS_BYTES'] ?? 64 * 1024);

/** Context keys stamped authoritatively by the server; client values are discarded (C-004). */
const AUTHORITATIVE_RUNTIME_KEYS: ReadonlySet<RuntimeContextKey> = new Set<RuntimeContextKey>([
  'userId',
  'userDisplayName',
  'formId',
  'formCode',
  'formVersion',
  'submittedAt',
  'sessionId',
  'tenantSegment',
]);

/** Server-assembled runtime context. `locale` is the only client-assertable key. */
export interface SubmissionRuntimeContext {
  userId: string;
  userDisplayName: string;
  formId: string;
  formCode: string;
  formVersion: string;
  submittedAt: string;
  sessionId: string;
  tenantSegment: string;
  locale: string;
}

/** Bundled inputs threaded through per-spec resolution (keeps resolveOne to one param object). */
interface ResolutionContext {
  formData: Record<string, unknown>;
  runtimeContext: SubmissionRuntimeContext;
  expressionContext: ExpressionContext;
}

/** Thrown for a malformed/invalid spec or expression — surfaces as HTTP 400. */
export class ExtraParamsError extends AppError {
  constructor(message: string) {
    super(message, 400, 'EXTRA_PARAMS_INVALID');
  }
}

/** Thrown when the resolved envelope exceeds the size cap — surfaces as HTTP 422 (FR-043). */
export class ExtraParamsTooLargeError extends AppError {
  constructor(message: string) {
    super(message, 422, 'EXTRA_PARAMS_TOO_LARGE');
  }
}

export class ExtraParamsAssemblyService {
  /**
   * Resolves a button's extra-param specs into the envelope persisted with the
   * submission. Pure and deterministic given (specs, formData, context).
   */
  resolve(
    specs: ExtraParamSpec[],
    formData: Record<string, unknown>,
    runtimeContext: SubmissionRuntimeContext,
  ): ResolvedExtraParams {
    const resolved: ResolvedExtraParams = {};
    const ctx: ResolutionContext = {
      formData,
      runtimeContext,
      expressionContext: this.toExpressionContext(formData),
    };

    for (const spec of specs) {
      if (!spec.key) throw new ExtraParamsError('Extra-param spec is missing a key');
      resolved[spec.key] = this.resolveOne(spec, ctx);
    }

    this.assertWithinSizeLimit(resolved, runtimeContext);
    return resolved;
  }

  private resolveOne(spec: ExtraParamSpec, ctx: ResolutionContext): string | number | boolean | null {
    switch (spec.source) {
      case 'static':
        return spec.staticValue ?? null;
      case 'hiddenField':
        return this.coerce(ctx.formData[spec.fieldSchemaName ?? '']);
      case 'runtimeContext':
        return this.resolveContext(spec.contextKey, ctx.runtimeContext);
      case 'computed':
        return this.evaluateComputed(spec.expression, ctx.expressionContext);
      default:
        throw new ExtraParamsError(`Unknown extra-param source '${String(spec.source)}'`);
    }
  }

  // C-004: context values come from the server-assembled context, NEVER the client.
  private resolveContext(
    key: RuntimeContextKey | undefined,
    context: SubmissionRuntimeContext,
  ): string {
    if (!key) throw new ExtraParamsError('runtimeContext spec is missing contextKey');
    return context[key];
  }

  // C-005 / FR-042 / NFR-006c: evaluated by the bounded, eval-free server engine.
  // A computed expression that fails to evaluate (syntax/reference error) or times
  // out is LOGGED and substituted with null — it MUST NOT reject the submission.
  private evaluateComputed(
    expression: string | undefined,
    expressionContext: ExpressionContext,
  ): string | number | boolean | null {
    if (!expression) {
      logger.warn('Computed extra-param spec has no expression — substituting null');
      return null;
    }
    try {
      return ExpressionEngineServer.evaluate(expression, expressionContext);
    } catch (error) {
      if (error instanceof ExpressionTimeoutError || error instanceof ExpressionError) {
        logger.warn({ reason: error.message }, 'Computed extra-param expression failed — substituting null');
        return null;
      }
      throw error;
    }
  }

  private assertWithinSizeLimit(
    resolved: ResolvedExtraParams,
    context: SubmissionRuntimeContext,
  ): void {
    const bytes = Buffer.byteLength(JSON.stringify(resolved), 'utf8');
    if (bytes > MAX_EXTRA_PARAMS_BYTES) {
      logger.warn(
        { bytes, cap: MAX_EXTRA_PARAMS_BYTES, formCode: context.formCode },
        'Resolved extra-params exceeded the size cap',
      );
      throw new ExtraParamsTooLargeError(
        `Resolved extra-params (${bytes} bytes) exceed the ${MAX_EXTRA_PARAMS_BYTES}-byte cap`,
      );
    }
  }

  private coerce(value: unknown): string | number | boolean | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    return JSON.stringify(value);
  }

  private toExpressionContext(formData: Record<string, unknown>): ExpressionContext {
    const context: ExpressionContext = {};
    for (const [key, value] of Object.entries(formData)) {
      context[key] = this.coerce(value) as ExpressionValue;
    }
    return context;
  }
}

/**
 * Finds a FinalSubmit ScopedButton by id anywhere in the published form
 * (tab-scoped or section-scoped). Returns null if not found or not a
 * finalSubmit button. The button spec is the authoritative source of
 * extra-params — the client only sends the button id (ADR-BTN-005).
 */
export function findFinalSubmitButton(
  form: FormDefinition,
  buttonId: string,
): ScopedButton | null {
  for (const tab of form.tabs ?? []) {
    const match = (tab.buttons ?? []).find((button) => button.id === buttonId);
    if (match) return isFinalSubmit(match) ? match : null;
    for (const section of tab.sections ?? []) {
      const sectionMatch = (section.buttons ?? []).find((button) => button.id === buttonId);
      if (sectionMatch) return isFinalSubmit(sectionMatch) ? sectionMatch : null;
    }
  }
  return null;
}

function isFinalSubmit(button: ScopedButton): boolean {
  return button.action.type === 'finalSubmit';
}

/** Narrows a finalSubmit button to its extra-param spec list. */
export function extraParamsOf(button: ScopedButton): ExtraParamSpec[] {
  return button.action.type === 'finalSubmit' ? button.action.extraParams : [];
}
