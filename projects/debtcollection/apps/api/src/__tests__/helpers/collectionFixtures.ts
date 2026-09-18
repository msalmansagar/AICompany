import type { CollectionLogEntry, ICollectionLogger, MisDelinquencyRecord, PlatformConfiguration } from '@dcp/domain';
import { FakeCrmAdapter } from './FakeCrmAdapter.js';
import {
  CollectionCaseRepository,
  CollectionActivityRepository,
  CustomerResolutionService,
  DelinquencySnapshotRepository,
  DelinquencySyncService,
  IdentityExceptionRepository,
  StubRuleEngine,
} from '../../services/collection/index.js';
import type { SyncDependencies } from '../../services/collection/index.js';
import type { CaseNumberSourceKind, EligibilityInput, EligibilityOutcome, EpisodePolicy, IRuleEngine } from '@dcp/domain';

/** A Housing Loan deployment: customers on contact, the national id on the OOB governmentid column. */
export const housingLoanConfiguration: PlatformConfiguration = {
  organizationCode: 'HL',
  platformType: 'Cloud',
  apiVersion: '9.2',
  customerEntity: 'contacts',
  customerBusinessIdField: 'governmentid',
  eligibilityRulesetCode: 'HL-COLLECTION-ELIGIBILITY',
  snapshotPolicy: 'AllReceived',
  mappings: [
    { businessObject: 'Customer', canonicalField: 'customerNumber', entity: 'contact', field: 'employeeid', isRequired: false, accessMode: 'Read' },
  ],
  featureFlags: { snapshotKeyComposition: ['sourceSystem', 'facilityNumber', 'snapshotDate'] },
};

export class MemoryLogger implements ICollectionLogger {
  readonly entries: CollectionLogEntry[] = [];
  async log(entry: CollectionLogEntry): Promise<void> { this.entries.push(entry); }
}

export function delinquentRecord(overrides: Partial<MisDelinquencyRecord> = {}): MisDelinquencyRecord {
  return {
    customer: { nationalId: '28912345678', customerNumber: 'C-1001' },
    facilityNumber: '123456789',
    sourceSystem: 'HL',
    dpd: 45,
    arrearBucket: '31-60',
    loanBalance: 800_000,
    totalArrears: 12_500,
    installmentAmount: 6_250,
    misAsOfDate: '2026-06-30',
    integrationBatchId: 'BATCH-2026-06-30',
    ...overrides,
  };
}

export interface Harness {
  crm: FakeCrmAdapter;
  logger: MemoryLogger;
  service: DelinquencySyncService;
  cases: CollectionCaseRepository;
  snapshots: DelinquencySnapshotRepository;
  activities: CollectionActivityRepository;
  contactId: string;
  now: { value: string };
}

/** Wires the real repositories and services over the in-memory organisation. */
export function buildHarness(options: {
  configuration?: PlatformConfiguration;
  decide?: (input: EligibilityInput) => EligibilityOutcome;
  episodePolicy?: EpisodePolicy;
  caseNumbering?: CaseNumberSourceKind;
  ruleEngine?: IRuleEngine;
  seedCustomer?: boolean;
} = {}): Harness {
  const configuration = options.configuration ?? housingLoanConfiguration;
  const crm = new FakeCrmAdapter();
  const logger = new MemoryLogger();
  const now = { value: '2026-07-01T02:00:00.000Z' };

  const contactId = options.seedCustomer === false
    ? ''
    : crm.seed('contacts', 'contactid', { governmentid: '28912345678', employeeid: 'C-1001', fullname: 'Test Customer' });

  const cases = new CollectionCaseRepository(crm);
  const snapshots = new DelinquencySnapshotRepository(crm, configuration.featureFlags!['snapshotKeyComposition'] as never);
  const activities = new CollectionActivityRepository(crm);
  const deps: SyncDependencies = {
    configuration,
    customers: new CustomerResolutionService(crm, configuration),
    ruleEngine: options.ruleEngine ?? new StubRuleEngine({ eligibility: options.decide ?? (() => 'EligibleCreateCase') }),
    cases,
    snapshots,
    exceptions: new IdentityExceptionRepository(crm),
    logger,
    episodePolicy: options.episodePolicy ?? {},
    caseNumbering: options.caseNumbering ?? 'Provisional',
    now: () => now.value,
  };
  return { crm, logger, service: new DelinquencySyncService(deps), cases, snapshots, activities, contactId, now };
}
