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
  concludability,
  NO_OUTCOMES_CONFIGURED,
  type ConcludeAvailability,
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

export {
  CommunicationChannel,
  CHANNEL_ENTITY,
  CommunicationRequestSchema,
  evaluateEligibility,
  planCommunication,
} from './communication.js';
export type {
  CommunicationRecipient,
  CommunicationRequest,
  CommunicationWritePlan,
  EligibilityRefusal,
  CommunicationEligibilityOutcome,
  EligibilityContext,
  ContactHoldVerdict,
  ContactHoldPolicy,
} from './communication.js';
export { COMMUNICATION_NAMESPACE, communicationId, singleSendId, uuidV5 } from './communicationIdentity.js';

export { historyComplete, mergeHistory } from './communicationHistory.js';
export type { HistoryBuffer, HistoryEntry, MergedHistory } from './communicationHistory.js';

export {
  APPROVAL_STATUS_CODES,
  TEMPLATE_CHANNEL_CODES,
  TEMPLATE_LANGUAGE_CODES,
  composePermissions,
  parsePlaceholders,
  renderTemplate,
  selectableTemplates,
  templateAvailability,
} from './communicationTemplate.js';
export type {
  CommunicationTemplate,
  ComposePermissions,
  RenderOutcome,
  TemplateAvailability,
  TemplateChannel,
  TemplateLanguage,
} from './communicationTemplate.js';

export {
  freezePopulation,
  thawPopulation,
  validateManifestCapacity,
  serialiseNonSuccesses,
  parseNonSuccesses,
  deriveProgress,
  reconcile,
  planBatch,
  nativeActivityIdFor,
} from './bulkCommunication.js';
export type {
  CapacityVerdict,
  RecipientOutcome,
  RecipientResult,
  RecordedNonSuccess,
  RunProgress,
  ReconciliationVerdict,
  BatchPlan,
} from './bulkCommunication.js';

// ── Phase 8 — strategy automation and provenance (KI-71) ─────────────────────
export {
  ACTIVITY_ORIGIN_CODES,
  originFromCode,
  ActivityOriginSchema,
  ActivityProvenanceSchema,
  EvaluationContextSchema,
  ProvenanceError,
  StrategyPlanError,
  assertProvenance,
  describeOrigin,
  isStrategyGenerated,
  planStrategyWork,
  regenerationDecision,
  strategyActivityId,
  REGENERATION_POLICY,
} from './strategyAutomation.js';
export type {
  ActivityOrigin,
  ActivityProvenance,
  EvaluationContext,
  ExistingWork,
  IntendedActivity,
} from './strategyAutomation.js';

// ── Phase 8 — controlled re-evaluation (WP5) ─────────────────────────────────
export {
  REEVALUATION_TRIGGERS,
  belongsToEpisode,
  buildEvaluationTrace,
  reevaluate,
  strategyFactsChanged,
} from './strategyReevaluation.js';
export type {
  ActivityState,
  Disposition,
  DispositionEntry,
  EvaluationTrace,
  ExistingActivity,
  ReevaluationOutcome,
  ReevaluationTrigger,
} from './strategyReevaluation.js';

// ── Phase 8 — assignment decision (WP6) ──────────────────────────────────────
export {
  ambiguousAssignment,
  awaitingAssignment,
  decideAssignment,
  shouldWriteAssignment,
  worthRetrying,
} from './assignmentDecision.js';
export type {
  AssignmentDecision,
  AssignmentStatus,
  AssignmentTarget,
} from './assignmentDecision.js';

// ── Phase 8 — TAT and escalation (WP7) ───────────────────────────────────────
export {
  computeDeadline,
  continuousElapsed,
  deriveWorkState,
  escalationDue,
  escalationEventId,
  isCurrentWork,
} from './tatEscalation.js';
export type {
  EscalationEventKind,
  TatBasis,
  TatCalendar,
  TatDeadline,
  TatInstants,
  TatStartPolicy,
  WorkState,
  WorkStateInput,
} from './tatEscalation.js';

// ── Phase 8 — Action Plan presentation (WP8) ─────────────────────────────────
export {
  DUE_NOT_CONFIGURED,
  NOT_ASSIGNED,
  ORIGIN_NOT_RECORDED,
  describeDue,
  describeOriginLabel,
  satisfiesPlannedAction,
  toActionPlanItem,
} from './actionPlanItem.js';
export type { ActionPlanInput, ActionPlanItem } from './actionPlanItem.js';

// ── Phase 8 — Legal hand-off (WP9) ───────────────────────────────────────────
export {
  decideLegalHandoff,
  isQualificationConfigured,
  interpretHandoffWrite,
  litigationRequestId,
  remainsAvailable,
  resolveLegalCustomer,
  worthRetrying as legalHandoffWorthRetrying,
} from './legalHandoff.js';
export type {
  CustomerTable, LegalCustomerResolution, LegalHandoffDecision, LegalHandoffOutcome,
  LegalQualificationPolicy, LegalRecommendation,
} from './legalHandoff.js';

// ── Phase 8 — Legal visibility (WP10) ────────────────────────────────────────
export {
  assertsNoLitigation,
  describeLegalTrace,
  interpretLegalRead,
  legalFetchFromFailure,
  litigationExists,
} from './legalVisibility.js';
export type {
  LegalRecordFetch, LegalTrace, LegalTraceInput, LegalTraceState, LitigationSummary,
} from './legalVisibility.js';

// ── Phase 8 — Collection-side Legal state (WP14) ────────────────────────────
export {
  describeLegalWork,
  explainLegalWait,
  isCurrentLegalWork,
  queueBucketFor,
} from './legalWorkState.js';
export type {
  LegalQueueBucket, LegalWorkInput, LegalWorkState, LegalWorkStateName,
} from './legalWorkState.js';

// ── Phase 8 — Collection Dispute vs Customer Complaint (WP13) ────────────────
export {
  DISPUTE_LOGGING_NOTICE,
  describeDisputedSubject,
  effectsOfRaisingComplaint,
  effectsOfRecordingDispute,
  hasAnyEffect,
  impliesOtherConcern,
  toComplaintRow,
  toDisputeRow,
} from './disputeComplaint.js';
export type {
  CollectionConcern, CollectionDispute, CollectionEffects,
  ComplaintCaseSummary, ConcernRow, DisputedSubject,
} from './disputeComplaint.js';

// ── Phase 8 — the formal Complaint contract (WP13b) ─────────────────────────
export {
  COMPLAINT_CUSTOMER_BINDING,
  COMPLAINT_CUSTOMER_SET,
  buildComplaintCreate,
  complaintCaseId,
  isComplaintCaseType,
  lookupProvidesIdempotency,
  resolveComplaintCaseType,
} from './complaintContract.js';
export type {
  CaseTypeOption, CaseTypeResolution, ComplaintCreateDecision, ComplaintCustomer, ComplaintDraft,
} from './complaintContract.js';

// ── Phase 8 — the QCB deceased indication and its review (WP16) ─────────────
export {
  INDICATION_LABEL,
  NO_INDICATION_LABEL,
  deceasedReviewId,
  describeIndication,
  describeIndicationSource,
  effectsOfIndication,
  effectsOfStartingReview,
  reviewsToGenerateFrom,
  toDeceasedReviewRow,
} from './deceasedReview.js';
export type {
  DeceasedIndication, DeceasedReview, DeceasedReviewRow, DeceasedReviewState, IndicationSource,
} from './deceasedReview.js';

// ── Phase 8 — the operational read model (WP17) ─────────────────────────────
export {
  bucketTotalsAreDisjoint,
  bucketsFor,
  dedupeWork,
  describeBucket,
  describeCount,
  describeWorkType,
  distinctWorkCount,
  knownCount,
  toWorkCount,
  unknownCount,
} from './operationalWork.js';
export type {
  OperationalBucket, WorkCount, WorkItem, WorkType,
} from './operationalWork.js';

// ── Phase 9 — advanced-process capability matrix (WP6) ───────────────────────
export { describeAdvancedProcesses } from './advancedProcessState.js';
export type {
  AdvancedProcess, AdvancedProcessEvidence, ProcessAspect, ProcessCapability,
} from './advancedProcessState.js';
