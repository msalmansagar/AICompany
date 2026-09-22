import {
  caseStatusFromCode,
  caseNumberFor,
  type CachedMisPosition,
  type CaseNumberSourceKind,
  type CaseResolutionType,
  type CaseStatus,
  type CaseSummary,
  type CollectionCase,
  type CrmCallContext,
  type CrmRecord,
  type FacilityIdentity,
  type ICrmAdapter,
} from '@dcp/domain';
import {
  ARREAR_BUCKET_VALUES,
  CASE,
  CASE_STATUS_CODES,
  CUSTOMER_ENTITY_SETS,
  CUSTOMER_TYPE_VALUES,
  ENTITY_SETS,
  NAVIGATION,
  ORGANIZATION_CODE_VALUES,
  RESOLUTION_TYPE_VALUES,
  bind,
  caseStateCodeOf,
} from './qdbBindings.js';

/** What the repository reads back for a case summary. */
const SUMMARY_COLUMNS = [
  CASE.id, CASE.caseNumber, CASE.facilityNumber, CASE.facilitySourceSystem, CASE.episodeNumber,
  CASE.statusCode, CASE.openDate, CASE.cureDate, CASE.closedDate,
  CASE.currentDpd, CASE.currentArrearBucket, CASE.currentLoanBalance, CASE.currentTotalArrears,
  CASE.installmentAmount, CASE.misAsOfDate, CASE.lastMisSyncOn,
];

/**
 * Persists Collection Cases through the CRM seam.
 *
 * The facility is identified by its MIS business identity — facility number plus source system —
 * and nothing here asks the organisation for a facility record. A case is created with that
 * identity and a customer master reference, and can be found again by that identity alone.
 */
export class CollectionCaseRepository {
  constructor(
    private readonly crm: ICrmAdapter,
    private readonly options: { defaultCustomerType?: 'Individual' | 'SME' | 'Corporate' } = {},
  ) {}

  /** The facility's open case (`statecode = 0`), or `null`. More than one is an invariant breach and is reported as such. */
  async findActiveByFacility(facility: FacilityIdentity, context: CrmCallContext = {}): Promise<CaseSummary | null> {
    const rows = await this.crm.retrieveMultiple(ENTITY_SETS.collectionCase, {
      select: SUMMARY_COLUMNS,
      filter: `${facilityFilter(facility)} and ${CASE.stateCode} eq 0`,
      top: 2,
    }, context);
    if (rows.length > 1) {
      throw new Error(`Invariant breached: ${rows.length} active cases exist for facility ${facility.sourceSystem}/${facility.facilityNumber}`);
    }
    return rows[0] ? toSummary(rows[0]) : null;
  }

  /** The most recently closed case for the facility, or `null`. */
  async findLatestClosedByFacility(facility: FacilityIdentity, context: CrmCallContext = {}): Promise<CaseSummary | null> {
    const rows = await this.crm.retrieveMultiple(ENTITY_SETS.collectionCase, {
      select: SUMMARY_COLUMNS,
      filter: `${facilityFilter(facility)} and ${CASE.stateCode} eq 1`,
      orderBy: { field: CASE.episodeNumber, descending: true },
      top: 1,
    }, context);
    return rows[0] ? toSummary(rows[0]) : null;
  }

  /** Creates the case. The default status is left to the plugin (DefaultStatusAssigner → New). */
  async create(collectionCase: CollectionCase, context: CrmCallContext = {}): Promise<string> {
    const values: CrmRecord = {
      ...(collectionCase.caseNumber ? { [CASE.caseNumber]: collectionCase.caseNumber } : {}),
      [CASE.customerBusinessId]: collectionCase.customerBusinessId,
      [CASE.facilityNumber]: collectionCase.facility.facilityNumber,
      [CASE.facilitySourceSystem]: collectionCase.facility.sourceSystem,
      [CASE.organizationCode]: ORGANIZATION_CODE_VALUES[collectionCase.organizationCode],
      [CASE.episodeNumber]: collectionCase.episodeNumber,
      [CASE.openDate]: collectionCase.openDate,
      ...bind(
        collectionCase.customer.entity === 'contact' ? NAVIGATION.caseCustomerContact : NAVIGATION.caseCustomerAccount,
        CUSTOMER_ENTITY_SETS[collectionCase.customer.entity],
        collectionCase.customer.id,
      ),
      ...(this.options.defaultCustomerType ? { [CASE.customerType]: CUSTOMER_TYPE_VALUES[this.options.defaultCustomerType] } : {}),
      ...(collectionCase.correlationId ? { [CASE.correlationId]: collectionCase.correlationId } : {}),
      ...(collectionCase.eligibilityRulesetVersion ? { [CASE.eligibilityRulesetVersion]: collectionCase.eligibilityRulesetVersion } : {}),
      ...(collectionCase.cachedPosition ? cachedPositionValues(collectionCase.cachedPosition) : {}),
    };
    return this.crm.create(ENTITY_SETS.collectionCase, values, context);
  }

  /** Refreshes the cached MIS position. Cache only — MIS stays the source of truth. */
  async updateCachedPosition(caseId: string, position: CachedMisPosition, context: CrmCallContext = {}): Promise<void> {
    await this.crm.update({ entity: ENTITY_SETS.collectionCase, id: caseId }, cachedPositionValues(position), context);
  }

  /** Moves the case to a status. The plugin validates the transition; a refused move surfaces as an error. */
  async transition(caseId: string, to: CaseStatus, context: CrmCallContext = {}): Promise<void> {
    await this.crm.update({ entity: ENTITY_SETS.collectionCase, id: caseId }, {
      [CASE.statusCode]: CASE_STATUS_CODES[to],
      [CASE.stateCode]: caseStateCodeOf(to),
    }, context);
  }

  /** Records the cure date and resolution when MIS reports the facility no longer delinquent. */
  async markCure(caseId: string, cureDate: string, resolution: CaseResolutionType, context: CrmCallContext = {}): Promise<void> {
    await this.crm.update({ entity: ENTITY_SETS.collectionCase, id: caseId }, {
      [CASE.cureDate]: cureDate,
      [CASE.resolutionType]: RESOLUTION_TYPE_VALUES[resolution],
    }, context);
  }

  /** Records the closure date alongside the Closed transition. */
  async markClosed(caseId: string, closedDate: string, context: CrmCallContext = {}): Promise<void> {
    await this.crm.update({ entity: ENTITY_SETS.collectionCase, id: caseId }, { [CASE.closedDate]: closedDate }, context);
  }

  /**
   * The case number to write, as a fragment to spread into the create payload.
   *
   * With `PlatformConfigured` numbering the fragment is empty: the column is omitted entirely so the
   * QDB mechanism fills it. Writing an empty string instead would collide on the
   * `qdb_casenumber_uk` alternate key the moment a second case was created (KI-49).
   */
  caseNumberFor(kind: CaseNumberSourceKind, facility: FacilityIdentity, episodeNumber: number): { caseNumber?: string } {
    const number = caseNumberFor(kind, facility, episodeNumber);
    return number === undefined ? {} : { caseNumber: number };
  }
}

function facilityFilter(facility: FacilityIdentity): string {
  return `${CASE.facilityNumber} eq '${escapeODataLiteral(facility.facilityNumber)}' and ${CASE.facilitySourceSystem} eq '${escapeODataLiteral(facility.sourceSystem)}'`;
}

function escapeODataLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function cachedPositionValues(position: CachedMisPosition): CrmRecord {
  const bucketValue = position.arrearBucket !== undefined ? ARREAR_BUCKET_VALUES[position.arrearBucket] : undefined;
  return {
    [CASE.currentDpd]: position.dpd,
    ...(bucketValue !== undefined ? { [CASE.currentArrearBucket]: bucketValue } : {}),
    [CASE.currentLoanBalance]: position.loanBalance,
    [CASE.currentTotalArrears]: position.totalArrears,
    ...(position.installmentAmount !== undefined ? { [CASE.installmentAmount]: position.installmentAmount } : {}),
    [CASE.misAsOfDate]: position.misAsOfDate,
    [CASE.lastMisSyncOn]: position.syncedOn,
  };
}

function toSummary(row: CrmRecord): CaseSummary {
  const status = caseStatusFromCode(Number(row[CASE.statusCode]));
  if (!status) throw new Error(`Case ${String(row[CASE.id])} carries an unknown statuscode ${String(row[CASE.statusCode])}`);
  const dpd = row[CASE.currentDpd];
  const cached: CachedMisPosition | undefined = typeof dpd === 'number'
    ? {
      dpd,
      ...(bucketLabel(row[CASE.currentArrearBucket]) !== undefined ? { arrearBucket: bucketLabel(row[CASE.currentArrearBucket])! } : {}),
      loanBalance: Number(row[CASE.currentLoanBalance] ?? 0),
      totalArrears: Number(row[CASE.currentTotalArrears] ?? 0),
      ...(typeof row[CASE.installmentAmount] === 'number' ? { installmentAmount: row[CASE.installmentAmount] as number } : {}),
      misAsOfDate: String(row[CASE.misAsOfDate] ?? ''),
      syncedOn: String(row[CASE.lastMisSyncOn] ?? ''),
    }
    : undefined;
  return {
    id: String(row[CASE.id]),
    caseNumber: String(row[CASE.caseNumber] ?? ''),
    facility: { facilityNumber: String(row[CASE.facilityNumber]), sourceSystem: String(row[CASE.facilitySourceSystem]) },
    episodeNumber: Number(row[CASE.episodeNumber] ?? 1),
    status,
    openDate: String(row[CASE.openDate] ?? ''),
    ...(cached ? { cachedPosition: cached } : {}),
    ...(row[CASE.cureDate] ? { cureDate: String(row[CASE.cureDate]) } : {}),
    ...(row[CASE.closedDate] ? { closedDate: String(row[CASE.closedDate]) } : {}),
  };
}

function bucketLabel(value: unknown): string | undefined {
  if (typeof value !== 'number') return undefined;
  return Object.keys(ARREAR_BUCKET_VALUES).find(label => ARREAR_BUCKET_VALUES[label] === value);
}
