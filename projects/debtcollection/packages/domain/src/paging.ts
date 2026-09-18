/**
 * Server-side paging, filtering and sorting — the one contract every large dataset uses.
 *
 * The platform decides how continuation works; this module decides nothing about it. That split is
 * deliberate and is grounded in what `org5869857f` actually did when asked
 * (`docs/evidence/Phase4_dataverse_paging_spike.txt`), not in documentation:
 *
 *   • **A page size is never optional.** Asked without `Prefer: odata.maxpagesize`, Dataverse returned
 *     all 1,295 rows in one response. There is no safe default, so `pageSize` is required and bounded.
 *   • **The continuation token is opaque.** Dataverse's is a `$skiptoken` carrying paging-cookie XML.
 *     It is never parsed, never rebuilt, and never assumed to encode an offset — a source is free to
 *     use a cursor, a change token or a paging cookie instead.
 *   • **A continuation belongs to the query that produced it.** Page size is *not* carried by
 *     Dataverse's link: following the same link without re-sending the header returned the remaining
 *     1,290 rows. So the token this module hands out carries a fingerprint of its query, and using it
 *     with different criteria is refused rather than silently returning the wrong rows.
 *   • **A page may be short.** Fewer rows than requested does not mean the end; only the absence of a
 *     continuation does.
 *
 * `$top` is not paging. The platform treats it as a bound on the whole result set and suppresses
 * continuation entirely, so it is offered as `limit` and kept separate.
 */

import { z } from 'zod';

// ── Continuation ─────────────────────────────────────────────────────────────

/**
 * An opaque continuation token as a caller sees it: a string, and nothing more.
 *
 * The brand exists so that a raw platform token or a hand-built string cannot be passed where a
 * continuation is expected. Callers — including the React workspace in Phase 5 — round-trip it
 * verbatim and never inspect it.
 */
export type ContinuationToken = string & { readonly __continuation: unique symbol };

/** What a continuation actually holds, on the server side only. */
interface ContinuationPayload {
  /** The source's own token, exactly as the source gave it. Never parsed. */
  readonly sourceToken: string;
  /** Identifies the query this continuation belongs to, so criteria drift is caught. */
  readonly queryFingerprint: string;
}

export class PagingError extends Error {
  constructor(message: string, readonly kind: 'InvalidContinuation' | 'CriteriaChanged' | 'PageSizeOutOfRange') {
    super(message);
    this.name = 'PagingError';
  }
}

// ── Request and result ───────────────────────────────────────────────────────

/**
 * One sort instruction. Multi-column sorting is a list, because a single column rarely orders ties —
 * and the spike showed ties genuinely span page boundaries on real data.
 *
 * `descending` is optional and ascending is the absence of it, matching `CrmQuery.orderBy`, so a
 * caller never has to write `descending: false` to mean the obvious thing.
 */
export interface Sort {
  field: string;
  descending?: boolean;
}

export const SortSchema = z.object({
  field: z.string().min(1),
  descending: z.boolean().optional(),
});

/**
 * What a caller asks for.
 *
 * `filter`, `sort` and `search` are part of the *request* on purpose: they are applied by the source,
 * never by pulling rows and narrowing them in memory or in the browser.
 */
export interface PageRequest {
  /** Rows the caller would like. The source may return fewer, and may enforce its own maximum. */
  pageSize: number;
  /** Opaque token from a previous page. Absent means "the first page". */
  continuation?: ContinuationToken;
  /** Source-applied filter. Shape is the source's; this contract passes it through. */
  filter?: string;
  /** Source-applied ordering, most significant first. */
  sort?: readonly Sort[];
  /** Source-applied free-text search, where the source supports one. */
  search?: string;
}

/** What comes back. */
export interface Page<T> {
  readonly items: readonly T[];
  /** Present when more rows exist. **Its absence is the only end-of-data signal.** */
  readonly continuation?: ContinuationToken;
  /** Convenience mirror of `continuation !== undefined`. */
  readonly hasMore: boolean;
  /** Total matching rows, only when the source can say cheaply. Never required, never inferred. */
  readonly totalCount?: number;
  /** The page size the source actually applied, which may be below what was asked for. */
  readonly appliedPageSize: number;
}

// ── Page size bounds ─────────────────────────────────────────────────────────

/**
 * Page-size limits for one source.
 *
 * These live in configuration rather than scattered through the application, and `max` exists because
 * a UI may *prefer* a page size while the source enforces the ceiling.
 */
export const PageSizeBoundsSchema = z.object({
  default: z.number().int().positive(),
  max: z.number().int().positive(),
}).refine(b => b.default <= b.max, { message: 'default page size cannot exceed max' });
export type PageSizeBounds = z.infer<typeof PageSizeBoundsSchema>;

/**
 * Clamps a requested page size into what the source allows.
 *
 * A caller asking for more than the maximum is given the maximum rather than an error — a page size is
 * a preference. A caller asking for zero or a negative is a defect, and is refused.
 */
export function resolvePageSize(requested: number | undefined, bounds: PageSizeBounds): number {
  if (requested === undefined) return bounds.default;
  if (!Number.isInteger(requested) || requested < 1) {
    throw new PagingError(`Page size must be a positive integer; received ${requested}`, 'PageSizeOutOfRange');
  }
  return Math.min(requested, bounds.max);
}

// ── Query identity ───────────────────────────────────────────────────────────

/**
 * A stable fingerprint of everything that shapes a result set.
 *
 * It covers **every property of the request except `pageSize` and `continuation`**, and that breadth
 * is deliberate rather than tidy. An earlier version named only `filter`, `sort` and `search`, which
 * silently failed to notice a changed `dpdFrom` on a MIS query: the continuation was accepted and
 * paging carried on into a population the caller was no longer asking about. Enumerating the request
 * means a source can add its own narrowing — buckets, a DPD range, a facility number — and get the
 * protection automatically instead of remembering to ask for it.
 *
 * The two exclusions are the two things that legitimately change mid-walk. Page size is one: the
 * spike showed Dataverse accepts a different `maxpagesize` on a later page. The continuation is the
 * other, obviously.
 *
 * Keys are sorted, and an absent property and an explicitly-undefined one fingerprint identically,
 * so `{ filter: 'x' }` and `{ filter: 'x', search: undefined }` are the same question.
 */
export function fingerprintQuery(request: object): string {
  const entries = request as Record<string, unknown>;
  const shaping: Record<string, unknown> = {};
  for (const key of Object.keys(entries).sort()) {
    if (key === 'pageSize' || key === 'continuation') continue;
    const value = entries[key];
    // An absent criterion and an empty one are the same question: `sort: []` narrows nothing, and a
    // caller who writes it should not be refused a continuation issued without it.
    if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
    shaping[key] = Array.isArray(value) ? value.map(normalizeForFingerprint) : normalizeForFingerprint(value);
  }
  return JSON.stringify(shaping);
}

/** Objects inside a request — a sort instruction, say — need their own key order pinned. */
function normalizeForFingerprint(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const entry = value as Record<string, unknown>;
  const stable: Record<string, unknown> = {};
  for (const key of Object.keys(entry).sort()) {
    if (entry[key] !== undefined) stable[key] = entry[key];
  }
  return stable;
}

// ── Encoding ─────────────────────────────────────────────────────────────────

const encode = (value: string): string => Buffer.from(value, 'utf8').toString('base64url');
const decode = (value: string): string => Buffer.from(value, 'base64url').toString('utf8');

/** Wraps a source's own token, together with the query it belongs to, into one opaque string. */
export function makeContinuation(sourceToken: string, queryFingerprint: string): ContinuationToken {
  const payload: ContinuationPayload = { sourceToken, queryFingerprint };
  return encode(JSON.stringify(payload)) as ContinuationToken;
}

/**
 * Unwraps a continuation and checks it still belongs to the query being asked.
 *
 * Both failure modes are named refusals rather than a silent restart at page one: silently restarting
 * is how a caller ends up paging forever, or appending the same rows twice to a scrolled list.
 */
export function readContinuation(token: ContinuationToken, expectedFingerprint: string): string {
  let payload: ContinuationPayload;
  try {
    const parsed: unknown = JSON.parse(decode(token));
    if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object');
    const candidate = parsed as Partial<ContinuationPayload>;
    if (typeof candidate.sourceToken !== 'string' || typeof candidate.queryFingerprint !== 'string') {
      throw new Error('missing fields');
    }
    payload = { sourceToken: candidate.sourceToken, queryFingerprint: candidate.queryFingerprint };
  } catch {
    throw new PagingError(
      'The continuation token could not be read. It was not produced by this service, or it has been altered.',
      'InvalidContinuation');
  }

  if (payload.queryFingerprint !== expectedFingerprint) {
    throw new PagingError(
      'The continuation token belongs to a different query. The filter, sort or search changed, so paging must restart ' +
      'from the first page rather than continue into a result set that no longer matches.',
      'CriteriaChanged');
  }
  return payload.sourceToken;
}

/** Builds a page result, keeping `hasMore` and `continuation` impossible to disagree. */
export function buildPage<T>(
  items: readonly T[],
  appliedPageSize: number,
  continuation?: ContinuationToken,
  totalCount?: number,
): Page<T> {
  return {
    items,
    hasMore: continuation !== undefined,
    appliedPageSize,
    ...(continuation !== undefined ? { continuation } : {}),
    ...(totalCount !== undefined ? { totalCount } : {}),
  };
}

/** The last page of a walk: items, and nothing to follow. */
export function finalPage<T>(items: readonly T[], appliedPageSize: number, totalCount?: number): Page<T> {
  return buildPage(items, appliedPageSize, undefined, totalCount);
}
