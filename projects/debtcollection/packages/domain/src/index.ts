// @dcp/domain — canonical Collection domain contracts.
//
// Pure types and pure functions only: no I/O, no Dataverse, no platform knowledge. Collection
// services, the Rule Engine facades and React all depend on this package, which is what keeps one
// codebase serving HL and BFD on both Dynamics 365 CE 9.1 on-premises and Dataverse cloud.

export {
  CustomerTypeSchema,
  CollectionLanguageSchema,
  CollectionFlagsSchema,
  CustomerContactPointsSchema,
  CollectionCustomerSchema,
} from './customer.js';
export type {
  CustomerType,
  CollectionLanguage,
  CollectionFlags,
  CustomerContactPoints,
  CollectionCustomer,
} from './customer.js';

export {
  FacilitySourceSystemSchema,
  FacilityStatusSchema,
  CollectionFacilitySchema,
  hasResolvedCrmRecord,
} from './facility.js';
export type { FacilityStatus, CollectionFacility } from './facility.js';

export {
  EligibilityOutcomeSchema,
  EligibilityDecisionSchema,
  ContactHoldDecisionSchema,
  SnapshotPolicySchema,
  NON_CASE_OUTCOMES,
  createsOrUpdatesCase,
  shouldPersistSnapshot,
} from './eligibility.js';
export type {
  EligibilityOutcome,
  EligibilityDecision,
  ContactHoldDecision,
  SnapshotPolicy,
} from './eligibility.js';

export {
  LogSeveritySchema,
  LogOperationKindSchema,
  PayloadPolicySchema,
  CollectionLogEntrySchema,
  DEFAULT_PAYLOAD_POLICY,
  DCP_LOG_SOURCE_PREFIX,
  DIAGNOSTIC_BLOCK_START,
  buildLogSource,
  preparePayload,
  renderDiagnosticBlock,
} from './logging.js';
export type {
  LogSeverity,
  LogOperationKind,
  PayloadPolicy,
  CollectionLogEntry,
  ICollectionLogger,
} from './logging.js';

export type {
  CrmRecord,
  CrmReference,
  CrmQuery,
  CrmCallContext,
  ICrmAdapter,
} from './crm.js';

export {
  BusinessObjectSchema,
  AccessModeSchema,
  FieldMappingSchema,
  PlatformConfigurationSchema,
  PlatformConfigurationError,
  resolveField,
  resolveFields,
  requireFacilityEntity,
  readMappedValue,
} from './platformConfiguration.js';
export type {
  BusinessObject,
  AccessMode,
  FieldMapping,
  PlatformConfiguration,
  IPlatformConfigurationService,
} from './platformConfiguration.js';
export {
  OrganizationCodeSchema,
  PlatformTypeSchema,
} from './platformConfiguration.js';
export type { OrganizationCode, PlatformType } from './platformConfiguration.js';

export {
  CaseStatus,
  CASE_STATUS_CODES,
  CASE_TRANSITIONS,
  TERMINAL_CASE_STATUSES,
  UNIVERSAL_TARGETS,
  CONTACT_BEARING_STATUSES,
  isCaseTransitionAllowed,
  isTerminalCaseStatus,
  isActiveCaseStatus,
  caseStatusFromCode,
} from './caseLifecycle.js';

export {
  ActivityStatus,
  ACTIVITY_STATUS_CODES,
  ACTIVITY_STATE_CODES,
  PtpStatus,
  PTP_STATUS_CODES,
  PTP_TRANSITIONS,
  isActivityImmutable,
  isPtpTransitionAllowed,
  ptpStatusFromCode,
  activityStatusFromCode,
} from './activityLifecycle.js';

export {
  CustomerIdentitySchema,
  FacilityIdentitySchema,
  FacilityIdentityProblemSchema,
  FACILITY_NUMBER_MAX_LENGTH,
  ArrearBucketCodeSchema,
  MisDelinquencyRecordSchema,
  CachedMisPositionSchema,
  hasUsableCustomerIdentity,
  checkFacilityIdentity,
  isDelinquent,
  toCachedPosition,
  hasPositionChanged,
} from './misObservation.js';
export type {
  CustomerIdentity,
  FacilityIdentity,
  FacilityIdentityProblem,
  FacilityIdentityCheck,
  MisDelinquencyRecord,
  CachedMisPosition,
} from './misObservation.js';

export {
  CustomerMasterEntitySchema,
  ResolvedCustomerSchema,
  CustomerResolutionFailureSchema,
  decideCustomerResolution,
} from './customerResolution.js';
export type {
  CustomerMasterEntity,
  ResolvedCustomer,
  CustomerResolutionFailure,
  CustomerResolution,
  CustomerLookupResult,
  ICustomerResolver,
} from './customerResolution.js';

export {
  CaseStatusSchema,
  CaseResolutionTypeSchema,
  CaseCustomerRefSchema,
  CollectionCaseSchema,
  CaseSummarySchema,
  composeProvisionalCaseNumber,
} from './collectionCase.js';
export type { CaseResolutionType, CollectionCase, CaseSummary } from './collectionCase.js';

export { EpisodePolicySchema, decideEpisodeAction } from './episode.js';
export type { EpisodePolicy, EpisodeAction, EpisodeContext } from './episode.js';

export {
  DelinquencySnapshotSchema,
  SnapshotKeyPartSchema,
  SnapshotKeyCompositionSchema,
  SNAPSHOT_KEY_MAX_LENGTH,
  SnapshotKeyError,
  composeSnapshotKey,
  buildSnapshot,
} from './snapshot.js';
export type { DelinquencySnapshot, SnapshotKeyPart, SnapshotKeyComposition } from './snapshot.js';

export {
  ActivityStatusSchema,
  PtpStatusSchema,
  PromiseTypeSchema,
  RelatedRecordRefSchema,
  PromiseToPaySchema,
  CollectionActivitySchema,
  isPromiseToPay,
  openPromiseToPay,
} from './collectionActivity.js';
export type { RelatedRecordRef, PromiseToPay, CollectionActivity } from './collectionActivity.js';

export {
  CollectionSettingsSchema,
  CollectionSettingsError,
  readCollectionSettings,
  collectionSettingsOf,
  requireSetting,
} from './collectionSettings.js';
export type { CollectionSettings } from './collectionSettings.js';

export type { EligibilityInput, IEligibilityEvaluator } from './eligibility.js';
