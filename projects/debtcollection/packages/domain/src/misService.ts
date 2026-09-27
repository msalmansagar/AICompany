/**
 * The MIS seam.
 *
 * MIS is authoritative for facility identity and the current delinquency position. CRM is
 * authoritative for the customer master. DCP owns the Collection lifecycle. This interface is the
 * only place the first of those three crosses into this platform.
 *
 * **There is no MIS API in evidence.** `docs/MISContractEvidence.md` records the search: no endpoint,
 * no schema, no auth, no paging mechanism, no change feed — the only MIS evidence that exists is two
 * spreadsheet exports. So everything here about *transport* is this platform's abstraction, and every
 * implementation against a real QDB endpoint must be checked against the contract when it arrives.
 *
 * Two consequences are built in rather than bolted on:
 *
 *   • **Paging is neutral.** `PageRequest` carries an opaque continuation, so a source that pages by
 *     cursor, by change token, by paging cookie or not at all can be adapted without the Collection
 *     domain changing. It is explicitly *not* assumed to behave like Dataverse.
 *   • **Freshness travels with the data.** Every response says whether it came from MIS just now or
 *     from DCP's own cache, and when. Cached financial information is never presented as live.
 */

import { z } from 'zod';
import type { MisDelinquencyRecord } from './misObservation.js';
import type { Page, PageRequest } from './paging.js';

// ── Provenance and freshness ─────────────────────────────────────────────────

/** Which implementation answered. A reader can always tell mock data from real data. */
export const MisProviderSchema = z.enum(['Mock', 'Api']);
export type MisProvider = z.infer<typeof MisProviderSchema>;

/**
 * Where the figures came from.
 *
 * `Live` means MIS answered this request. `Cached` means MIS did not, and DCP is serving its own
 * last-known position so an officer can keep working. The distinction is never inferred by a caller
 * and never omitted — Phase 5 renders it, and an operator must be able to see it.
 */
export const MisFreshnessSchema = z.enum(['Live', 'Cached']);
export type MisFreshness = z.infer<typeof MisFreshnessSchema>;

/**
 * The envelope every MIS answer carries.
 *
 * `misAsOfDate` is the financial as-of date MIS reports. `retrievedAt` is when *this platform*
 * obtained the figures. They are different questions and both matter: a live read of a month-old
 * position is still a month-old position.
 */
export interface MisResponseMeta {
  provider: MisProvider;
  freshness: MisFreshness;
  /** The financial as-of date of the figures themselves, ISO-8601. */
  misAsOfDate: string;
  /** When DCP obtained them, ISO-8601. */
  retrievedAt: string;
  /** Present only when `freshness` is `Cached`: why the live read did not happen. */
  staleReason?: string;
  /** Present only when `freshness` is `Cached`: when the cached figures were originally obtained. */
  cachedAt?: string;
  correlationId?: string;
}

export interface MisResponse<T> {
  readonly data: T;
  readonly meta: MisResponseMeta;
}

/** True when the figures are DCP's own cache rather than MIS. Callers must render this distinctly. */
export function isStale(meta: MisResponseMeta): boolean {
  return meta.freshness === 'Cached';
}

// ── Failures ─────────────────────────────────────────────────────────────────

export class MisUnavailableError extends Error {
  constructor(message: string, readonly kind: 'Unreachable' | 'Timeout' | 'Unauthorised' | 'Malformed' | 'NotConfigured') {
    super(message);
    this.name = 'MisUnavailableError';
  }
}

// ── Requests ─────────────────────────────────────────────────────────────────

/**
 * What a caller may narrow a delinquency search by.
 *
 * Every one of these is applied **by the source**. None of them is a hint for the application to
 * filter on after pulling rows: a dashboard must never download the book to show a page of it.
 */
export interface ArrearDetailQuery extends PageRequest {
  /** Restrict to one or more buckets, using the confirmed taxonomy. */
  buckets?: readonly string[];
  /** Inclusive DPD bounds. Bounds are a caller's question, never a Collection policy threshold. */
  dpdFrom?: number;
  dpdTo?: number;
  /** Restrict to one facility, where the source supports it. */
  facilityNumber?: string;
  /** Restrict to one customer, where the source supports it. */
  customerNumber?: string;
  nationalId?: string;
}

/** A bucket aggregate as the breakdown report supplies it. */
export const BucketAggregateSchema = z.object({
  bucket: z.string().min(1),
  accountCount: z.number().int().nonnegative(),
  loanBalance: z.number(),
  totalArrears: z.number(),
});
export type BucketAggregate = z.infer<typeof BucketAggregateSchema>;

export interface ArrearBreakdown {
  asOf: string;
  buckets: readonly BucketAggregate[];
  totals: BucketAggregate;
}

/**
 * One batch of changes since a checkpoint.
 *
 * The checkpoint is **opaque**, exactly like a continuation, because what MIS can offer is unknown:
 * a timestamp, a change token, a run id or nothing at all. Treating it as opaque is what lets the
 * synchronisation design survive the answer.
 */
export interface ArrearChangeBatch {
  records: readonly MisDelinquencyRecord[];
  /** Pass back to resume. Absent means the source has no more changes to report. */
  nextCheckpoint?: string;
}

// ── The service ──────────────────────────────────────────────────────────────

export interface MisCallContext {
  correlationId?: string;
  /** Groups one synchronisation run. Normalization stamps it on every record. */
  integrationBatchId?: string;
}

/**
 * Everything DCP is allowed to ask MIS.
 *
 * Deliberately small. Each method returns normalized canonical records — an implementation does its
 * own normalization at its own boundary, so no raw payload escapes the provider.
 */
export interface IMisDelinquencyService {
  /** Which implementation this is, so a caller can label the data honestly. */
  readonly provider: MisProvider;

  /** One page of delinquency detail, narrowed and paged **by the source**. */
  getArrearDetails(
    query: ArrearDetailQuery,
    context?: MisCallContext,
  ): Promise<MisResponse<Page<MisDelinquencyRecord>>>;

  /** The current position of one facility, or null when MIS does not report it as delinquent. */
  getFacilityArrearPosition(
    facility: { facilityNumber: string; sourceSystem: string },
    context?: MisCallContext,
  ): Promise<MisResponse<MisDelinquencyRecord | null>>;

  /** Portfolio aggregates, for the dashboard — never computed by pulling every row. */
  getArrearBreakdown(context?: MisCallContext): Promise<MisResponse<ArrearBreakdown>>;

  /**
   * Changes since a checkpoint, for incremental synchronisation.
   *
   * Whether MIS can do this at all is **TBD — Actual MIS Contract Required**. An implementation that
   * cannot must refuse rather than quietly returning everything, which would turn an incremental run
   * into a full reload nobody asked for.
   */
  getArrearChanges(
    checkpoint: string | undefined,
    pageSize: number,
    context?: MisCallContext,
  ): Promise<MisResponse<ArrearChangeBatch>>;

  /** Whether MIS is answering, for the health surface and the fallback decision. */
  health(): Promise<{ provider: MisProvider; reachable: boolean; lastSuccessAt?: string; detail?: string }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a live envelope. */
export function liveResponse<T>(
  data: T,
  provider: MisProvider,
  misAsOfDate: string,
  retrievedAt: string,
  correlationId?: string,
): MisResponse<T> {
  return {
    data,
    meta: {
      provider, freshness: 'Live', misAsOfDate, retrievedAt,
      ...(correlationId !== undefined ? { correlationId } : {}),
    },
  };
}

/**
 * Builds a cached envelope.
 *
 * `staleReason` is required, not optional: "why am I looking at old numbers?" is the first question
 * an officer asks, and the platform should already know the answer.
 */
export function cachedResponse<T>(
  data: T,
  provider: MisProvider,
  misAsOfDate: string,
  retrievedAt: string,
  staleReason: string,
  cachedAt?: string,
  correlationId?: string,
): MisResponse<T> {
  return {
    data,
    meta: {
      provider, freshness: 'Cached', misAsOfDate, retrievedAt, staleReason,
      ...(cachedAt !== undefined ? { cachedAt } : {}),
      ...(correlationId !== undefined ? { correlationId } : {}),
    },
  };
}
