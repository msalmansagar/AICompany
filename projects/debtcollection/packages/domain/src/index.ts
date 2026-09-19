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
  CrmPageQuery,
  CrmQuery,
  CrmCallContext,
  ICrmAdapter,
  IConcurrencyControlledWrites,
  RowVersion,
  VersionedRecord,
  IdempotentCreateResult,
} from './crm.js';

export { CrmConcurrencyError, isConcurrencyConflict } from './crm.js';

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
  ACTIVITY_TRANSITIONS,
  OPEN_ACTIVITY_STATUSES,
  isActivityTransitionAllowed,
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

export {
  RulesetProvenanceSchema,
  StrategySelectionSchema,
  ContactHoldDecisionSchema as ContactHoldEvaluationSchema,
  RuleEngineError,
} from './ruleEngine.js';
export type {
  RulesetProvenance,
  EligibilityInput,
  IEligibilityEvaluator,
  StrategyInput,
  StrategySelection,
  ContactHoldInput,
  ContactHoldEvaluation,
  IRuleEngine,
} from './ruleEngine.js';

export {
  StrategyCriteriaSchema,
  EffectivePeriodSchema,
  StrategyActionSchema,
  CollectionStrategySchema,
  StrategyConfigurationError,
  isEffective,
  isUsable,
  resolveApplicableStrategy,
  orderedActions,
} from './strategy.js';
export type { StrategyCriteria, EffectivePeriod, StrategyAction, CollectionStrategy } from './strategy.js';

export {
  AssignmentMethodSchema,
  AssignmentConfigurationSchema,
  AssignmentOutcomeSchema,
  AssignmentError,
  UnavailableSmartAssignment,
  resolveAssignmentConfiguration,
} from './assignment.js';
export type {
  AssignmentMethod,
  AssignmentConfiguration,
  AssignmentOutcome,
  AssignmentInput,
  IAssignmentEngine,
} from './assignment.js';

export {
  CaseNumberSourceKindSchema,
  composeProvisionalCaseNumber as composeProvisionalCaseNumberFor,
  caseNumberFor,
} from './caseNumbering.js';
export type { CaseNumberSourceKind } from './caseNumbering.js';

export { RuleEngineOperationsSchema } from './collectionSettings.js';
export type { RuleEngineOperations } from './collectionSettings.js';
export {
  PagingError,
  SortSchema,
  PageSizeBoundsSchema,
  resolvePageSize,
  fingerprintQuery,
  makeContinuation,
  readContinuation,
  buildPage,
  finalPage,
  type ContinuationToken,
  type Sort,
  type PageRequest,
  type Page,
  type PageSizeBounds,
} from './paging.js';
export {
  NormalizationProblemSchema,
  ConfirmedArrearBucketSchema,
  ARREAR_BUCKET_CODES,
  HOUSING_LOAN_COLUMNS,
  isEmptyRow,
  normalizeHousingLoanRow,
  readArrearBucket,
  readDayFirstDate,
  readNumber,
  readQcbDeceased,
  readText,
  type RawMisRow,
  type NormalizationContext,
  type NormalizationProblem,
  type NormalizationResult,
  type NormalizationFailure,
  type NormalizationSuccess,
} from './misNormalization.js';
export {
  MisProviderSchema,
  MisFreshnessSchema,
  MisUnavailableError,
  BucketAggregateSchema,
  isStale,
  liveResponse,
  cachedResponse,
  type MisProvider,
  type MisFreshness,
  type MisResponseMeta,
  type MisResponse,
  type ArrearDetailQuery,
  type BucketAggregate,
  type ArrearBreakdown,
  type ArrearChangeBatch,
  type MisCallContext,
  type IMisDelinquencyService,
} from './misService.js';
export {
  SyncModeSchema,
  SynchronizationError,
  ProcessingCheckpointSchema,
  startCheckpoint,
  advanceCheckpoint,
  assertResumable,
  describeSyncMode,
  requireSupportedMode,
  type SyncMode,
  type ProcessingCheckpoint,
  type ICheckpointStore,
} from './synchronization.js';

export {
  ActivityOutcomeConfigSchema,
  PROMISE_TYPE_CODES,
  deriveFollowUpDate,
  planCreateActivity,
  planUpdateActivity,
  planCompleteActivity,
  planActivityTransition,
  planFollowUp,
  planCreatePromise,
  planUpdatePromise,
  planPromiseTransition,
  describePromiseVerification,
} from './activityOperations.js';
export type {
  ActivityOutcomeConfig,
  FollowUpDerivation,
  OperationRefusal,
  OperationResult,
  ActivityWritePlan,
  CompleteActivityPlan,
  CreateActivityRequest,
  UpdateActivityRequest,
  CompleteActivityRequest,
  CreatePromiseRequest,
  UpdatePromiseRequest,
} from './activityOperations.js';
