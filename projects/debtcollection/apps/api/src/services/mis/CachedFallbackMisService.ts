import {
  MisUnavailableError,
  buildLogSource,
  cachedResponse,
  finalPage,
  type ArrearBreakdown,
  type ArrearChangeBatch,
  type ArrearDetailQuery,
  type ICollectionLogger,
  type IMisDelinquencyService,
  type MisCallContext,
  type MisDelinquencyRecord,
  type MisProvider,
  type MisResponse,
  type Page,
} from '@dcp/domain';

const SOURCE = buildLogSource('MisFallback');

/** What DCP already knows, for use only when MIS cannot answer. */
export interface MisFallbackCache {
  /**
   * The last position DCP recorded for a facility, with when it was recorded.
   * Returning `null` means DCP has nothing cached — which is an answer, not a failure.
   */
  readFacilityPosition(
    facility: { facilityNumber: string; sourceSystem: string },
    context?: MisCallContext,
  ): Promise<{ record: MisDelinquencyRecord; cachedAt: string } | null>;
}

/**
 * Live MIS where possible; DCP's own last-known position where not — and never the two confused.
 *
 * The rule this class exists to keep is short: **cached financial information is never presented as
 * current live MIS.** A fallback answer carries `freshness: 'Cached'`, the time the figures were
 * originally obtained, and the reason the live read did not happen, so Phase 5 can render it
 * distinctly and an officer can see at a glance that they are looking at yesterday's number.
 *
 * Three deliberate limits:
 *
 *   • **Only an availability failure falls back.** A malformed response or an authorisation failure
 *     is a defect, not a reason to serve stale data quietly; those propagate.
 *   • **Nothing is invented.** If DCP has no cached position, the original MIS failure is raised.
 *     An empty page would read as "this customer owes nothing", which is the worst possible lie.
 *   • **Synchronisation never falls back.** `getArrearChanges` writes to the Collection lifecycle;
 *     driving that from stale figures would record events that MIS never reported. It propagates.
 */
export class CachedFallbackMisService implements IMisDelinquencyService {
  constructor(
    private readonly live: IMisDelinquencyService,
    private readonly cache: MisFallbackCache,
    private readonly logger: ICollectionLogger,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  get provider(): MisProvider {
    return this.live.provider;
  }

  /** @inheritdoc */
  async getArrearDetails(
    query: ArrearDetailQuery,
    context: MisCallContext = {},
  ): Promise<MisResponse<Page<MisDelinquencyRecord>>> {
    try {
      return await this.live.getArrearDetails(query, context);
    } catch (error) {
      const failure = this.availabilityFailureOrRethrow(error);

      // A list can only be served from cache when it names one facility. A cached *portfolio* would
      // be a different population from the live one, silently.
      if (!query.facilityNumber) {
        await this.logFallbackRefused('getArrearDetails', failure, context,
          'the query is not for a single facility, so no cached equivalent exists');
        throw failure;
      }
      const cached = await this.cache.readFacilityPosition(
        { facilityNumber: query.facilityNumber, sourceSystem: '' }, context);
      if (!cached) {
        await this.logFallbackRefused('getArrearDetails', failure, context, 'DCP holds no cached position');
        throw failure;
      }
      await this.logFallbackServed('getArrearDetails', failure, context);
      return cachedResponse(
        finalPage([cached.record], query.pageSize, 1),
        this.provider, cached.record.misAsOfDate, this.now(),
        this.reasonFor(failure), cached.cachedAt, context.correlationId);
    }
  }

  /** @inheritdoc */
  async getFacilityArrearPosition(
    facility: { facilityNumber: string; sourceSystem: string },
    context: MisCallContext = {},
  ): Promise<MisResponse<MisDelinquencyRecord | null>> {
    try {
      return await this.live.getFacilityArrearPosition(facility, context);
    } catch (error) {
      const failure = this.availabilityFailureOrRethrow(error);
      const cached = await this.cache.readFacilityPosition(facility, context);
      if (!cached) {
        await this.logFallbackRefused('getFacilityArrearPosition', failure, context, 'DCP holds no cached position');
        throw failure;
      }
      await this.logFallbackServed('getFacilityArrearPosition', failure, context);
      return cachedResponse(
        cached.record, this.provider, cached.record.misAsOfDate, this.now(),
        this.reasonFor(failure), cached.cachedAt, context.correlationId);
    }
  }

  /**
   * @inheritdoc
   *
   * Aggregates have no cached equivalent: DCP's own records are the accounts it has cases for, not
   * the portfolio. Serving those as a breakdown would understate the book.
   */
  async getArrearBreakdown(context: MisCallContext = {}): Promise<MisResponse<ArrearBreakdown>> {
    return this.live.getArrearBreakdown(context);
  }

  /** @inheritdoc — never falls back; see the class note. */
  async getArrearChanges(
    checkpoint: string | undefined,
    pageSize: number,
    context: MisCallContext = {},
  ): Promise<MisResponse<ArrearChangeBatch>> {
    return this.live.getArrearChanges(checkpoint, pageSize, context);
  }

  /** @inheritdoc */
  async health(): ReturnType<IMisDelinquencyService['health']> {
    return this.live.health();
  }

  /** Only an availability failure justifies stale data. Anything else is a defect and propagates. */
  private availabilityFailureOrRethrow(error: unknown): MisUnavailableError {
    if (!(error instanceof MisUnavailableError)) throw error;
    if (error.kind === 'Malformed' || error.kind === 'Unauthorised') throw error;
    return error;
  }

  private reasonFor(failure: MisUnavailableError): string {
    return `MIS was unavailable (${failure.kind}): ${failure.message}`;
  }

  private async logFallbackServed(operation: string, failure: MisUnavailableError, context: MisCallContext): Promise<void> {
    await this.logger.log({
      source: SOURCE,
      operation,
      operationKind: 'MisLiveQuery',
      severity: 'Warn',
      succeeded: true,
      errorCode: 'mis_cached_fallback',
      errorMessage: `Served DCP's cached position because ${this.reasonFor(failure)}`,
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    });
  }

  private async logFallbackRefused(
    operation: string, failure: MisUnavailableError, context: MisCallContext, why: string,
  ): Promise<void> {
    await this.logger.log({
      source: SOURCE,
      operation,
      operationKind: 'MisLiveQuery',
      severity: 'Error',
      succeeded: false,
      errorCode: 'mis_unavailable',
      errorMessage: `${this.reasonFor(failure)} — and no cached answer was served because ${why}`,
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    });
  }
}
