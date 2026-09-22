import {
  MisUnavailableError,
  buildPage,
  fingerprintQuery,
  makeContinuation,
  normalizeHousingLoanRow,
  readContinuation,
  type ArrearBreakdown,
  type ArrearChangeBatch,
  type ArrearDetailQuery,
  type IMisDelinquencyService,
  type MisCallContext,
  type MisDelinquencyRecord,
  type MisProvider,
  type MisResponse,
  type Page,
  type RawMisRow,
  liveResponse,
} from '@dcp/domain';

/** Faults a scenario can inject, so failure handling is exercised rather than assumed. */
export interface MockMisFaults {
  /** Fail every call with this kind. */
  unavailable?: 'Unreachable' | 'Timeout' | 'Unauthorised' | 'Malformed' | 'NotConfigured';
  /** Fail only when fetching the page at this zero-based index, then succeed on retry. */
  failOnPageIndex?: number;
  /** Return fewer rows than asked for, without ending the walk — a real source may do this. */
  shortPageSize?: number;
  /** Refuse `getArrearChanges`, as a source with no change feed would. */
  noChangeFeed?: boolean;
}

export interface MockMisOptions {
  sourceSystem: string;
  /** The financial as-of date of the seeded population, ISO-8601. */
  misAsOfDate: string;
  faults?: MockMisFaults;
  now?: () => string;
}

/**
 * A MIS provider seeded with raw rows shaped exactly like the evidenced Housing Loan export.
 *
 * It is **a test and demonstration provider, and nothing it returns is live MIS data.** It exists so
 * the pipeline, the paging contract and the failure paths can be exercised without a MIS contract —
 * `docs/MISContractEvidence.md` records that no MIS API is in evidence anywhere.
 *
 * Two design choices make it worth more than a stub:
 *
 *   • it holds **raw** rows and runs the real `normalizeHousingLoanRow` on every read, so the
 *     normalizer — including the coerced `1-30` bucket and the day-first dates — is exercised by
 *     every test that touches MIS, not only by its own unit tests;
 *   • it pages through the **same** opaque-continuation contract as Dataverse, so a caller cannot
 *     accidentally depend on one source's paging behaviour.
 *
 * What it does **not** do is imitate a QDB endpoint. Its transport is invented and labelled as such.
 */
export class MockMisDelinquencyService implements IMisDelinquencyService {
  readonly provider: MisProvider = 'Mock';
  private readonly now: () => string;
  private lastSuccessAt?: string;
  private attemptsByPage = new Map<number, number>();

  constructor(
    private readonly rawRows: readonly RawMisRow[],
    private readonly options: MockMisOptions,
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** @inheritdoc */
  async getArrearDetails(
    query: ArrearDetailQuery,
    context: MisCallContext = {},
  ): Promise<MisResponse<Page<MisDelinquencyRecord>>> {
    this.refuseIfUnavailable();

    const fingerprint = fingerprintQuery(query);
    const offset = query.continuation ? Number(readContinuation(query.continuation, fingerprint)) : 0;
    const pageIndex = Math.floor(offset / Math.max(query.pageSize, 1));
    this.failOncePerScenario(pageIndex);

    const matching = this.rawRows.filter(row => this.matches(row, query));
    const size = Math.min(this.options.faults?.shortPageSize ?? query.pageSize, query.pageSize);
    const slice = matching.slice(offset, offset + size);
    const nextOffset = offset + slice.length;
    const hasMore = nextOffset < matching.length;

    const records: MisDelinquencyRecord[] = [];
    for (const raw of slice) {
      const result = normalizeHousingLoanRow(raw, {
        sourceSystem: this.options.sourceSystem,
        misAsOfDate: this.options.misAsOfDate,
        integrationBatchId: context.integrationBatchId ?? 'mock-batch',
        ...(context.correlationId !== undefined ? { correlationId: context.correlationId } : {}),
      });
      // A row the normalizer refuses is not returned as a record. The caller sees a short page, which
      // the contract already allows, and the refusal surfaces in the sync run's own isolation path.
      if (result.ok) records.push(result.record);
    }

    this.lastSuccessAt = this.now();
    return liveResponse(
      buildPage(records, query.pageSize, hasMore ? makeContinuation(String(nextOffset), fingerprint) : undefined, matching.length),
      this.provider, this.options.misAsOfDate, this.lastSuccessAt, context.correlationId);
  }

  /** @inheritdoc */
  async getFacilityArrearPosition(
    facility: { facilityNumber: string; sourceSystem: string },
    context: MisCallContext = {},
  ): Promise<MisResponse<MisDelinquencyRecord | null>> {
    const page = await this.getArrearDetails(
      { pageSize: 1, facilityNumber: facility.facilityNumber }, context);
    return { data: page.data.items[0] ?? null, meta: page.meta };
  }

  /** @inheritdoc */
  async getArrearBreakdown(context: MisCallContext = {}): Promise<MisResponse<ArrearBreakdown>> {
    this.refuseIfUnavailable();
    const byBucket = new Map<string, { accountCount: number; loanBalance: number; totalArrears: number }>();
    let totals = { accountCount: 0, loanBalance: 0, totalArrears: 0 };

    for (const raw of this.rawRows) {
      const result = normalizeHousingLoanRow(raw, {
        sourceSystem: this.options.sourceSystem,
        misAsOfDate: this.options.misAsOfDate,
        integrationBatchId: context.integrationBatchId ?? 'mock-batch',
      });
      if (!result.ok) continue;
      const bucket = result.record.arrearBucket ?? '(none)';
      const entry = byBucket.get(bucket) ?? { accountCount: 0, loanBalance: 0, totalArrears: 0 };
      entry.accountCount += 1;
      entry.loanBalance += result.record.loanBalance;
      entry.totalArrears += result.record.totalArrears;
      byBucket.set(bucket, entry);
      totals = {
        accountCount: totals.accountCount + 1,
        loanBalance: totals.loanBalance + result.record.loanBalance,
        totalArrears: totals.totalArrears + result.record.totalArrears,
      };
    }

    this.lastSuccessAt = this.now();
    return liveResponse({
      asOf: this.options.misAsOfDate,
      buckets: [...byBucket.entries()].map(([bucket, v]) => ({ bucket, ...v })),
      totals: { bucket: 'ALL', ...totals },
    }, this.provider, this.options.misAsOfDate, this.lastSuccessAt, context.correlationId);
  }

  /**
   * @inheritdoc
   *
   * The mock can replay its whole population as a "change batch", which is useful for exercising
   * checkpoint and restart. It is **not** evidence that MIS offers a change feed: whether it does is
   * TBD, and `faults.noChangeFeed` models the source that does not.
   */
  async getArrearChanges(
    checkpoint: string | undefined,
    pageSize: number,
    context: MisCallContext = {},
  ): Promise<MisResponse<ArrearChangeBatch>> {
    this.refuseIfUnavailable();
    if (this.options.faults?.noChangeFeed) {
      throw new MisUnavailableError(
        'This MIS source exposes no changed-since feed. A full run must be requested explicitly rather ' +
        'than an incremental one silently reloading the whole population.',
        'NotConfigured');
    }

    const offset = checkpoint ? Number(checkpoint) : 0;
    if (!Number.isInteger(offset) || offset < 0) {
      throw new MisUnavailableError(`Checkpoint '${String(checkpoint)}' was not issued by this source`, 'Malformed');
    }
    // Read the rows directly. An earlier version called `getArrearDetails` purely to borrow its
    // response envelope, which made a capability probe perform a data read — it consumed an injected
    // fault and would cost a real request against a real source. The change feed's cursor is its own
    // and has nothing to do with the page continuation.
    const matching = this.rawRows.slice(offset, offset + pageSize);
    const records: MisDelinquencyRecord[] = [];
    for (const raw of matching) {
      const result = normalizeHousingLoanRow(raw, {
        sourceSystem: this.options.sourceSystem,
        misAsOfDate: this.options.misAsOfDate,
        integrationBatchId: context.integrationBatchId ?? 'mock-batch',
      });
      if (result.ok) records.push(result.record);
    }
    const nextOffset = offset + matching.length;
    this.lastSuccessAt = this.now();
    return liveResponse(
      {
        records,
        ...(nextOffset < this.rawRows.length ? { nextCheckpoint: String(nextOffset) } : {}),
      },
      this.provider, this.options.misAsOfDate, this.lastSuccessAt, context.correlationId);
  }

  /** @inheritdoc */
  async health(): Promise<{ provider: MisProvider; reachable: boolean; lastSuccessAt?: string; detail?: string }> {
    const reachable = this.options.faults?.unavailable === undefined;
    return {
      provider: this.provider,
      reachable,
      ...(this.lastSuccessAt !== undefined ? { lastSuccessAt: this.lastSuccessAt } : {}),
      detail: 'Mock provider — not live MIS data',
    };
  }

  private refuseIfUnavailable(): void {
    const kind = this.options.faults?.unavailable;
    if (kind) throw new MisUnavailableError(`Mock MIS is configured to fail with '${kind}'`, kind);
  }

  /** Fails the first attempt at one page, so retry and restart can be exercised. */
  private failOncePerScenario(pageIndex: number): void {
    const target = this.options.faults?.failOnPageIndex;
    if (target === undefined || pageIndex !== target) return;
    const attempts = (this.attemptsByPage.get(pageIndex) ?? 0) + 1;
    this.attemptsByPage.set(pageIndex, attempts);
    if (attempts === 1) {
      throw new MisUnavailableError(`Mock MIS transient failure on page ${pageIndex}`, 'Timeout');
    }
  }

  /** Source-side narrowing. The mock applies it here so no caller learns to filter in memory. */
  private matches(row: RawMisRow, query: ArrearDetailQuery): boolean {
    const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
    if (query.facilityNumber && text(row['Account Number']) !== query.facilityNumber) return false;
    if (query.customerNumber && text(row['Customer Number']) !== query.customerNumber) return false;
    if (query.nationalId && text(row['ID Number']) !== query.nationalId) return false;
    if (query.dpdFrom !== undefined && Number(row['Arrear Days']) < query.dpdFrom) return false;
    if (query.dpdTo !== undefined && Number(row['Arrear Days']) > query.dpdTo) return false;
    if (query.search) {
      const needle = query.search.toLowerCase();
      const hay = Object.values(row).map(v => text(v).toLowerCase()).join(' ');
      if (!hay.includes(needle)) return false;
    }
    return true;
  }
}
