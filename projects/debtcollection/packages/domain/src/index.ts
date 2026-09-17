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
