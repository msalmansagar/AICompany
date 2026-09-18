import type { ContinuationToken, Page } from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import {
  COMMUNICATION_CHANNEL_LABELS, CUSTOMER_TYPE_LABELS, ENTITY_SETS, EXCEPTION_REASON_LABELS,
  EXCEPTION_STATUS_LABELS, IDENTITY_EXCEPTION_COLUMNS, ORG_LABELS, PLATFORM_CONFIGURATION_COLUMNS,
  PLATFORM_MAPPING_COLUMNS, PLATFORM_TYPE_LABELS, SNAPSHOT_POLICY_LABELS, STRATEGY_ACTION_COLUMNS,
  STRATEGY_COLUMNS, TRIGGER_EVENT_LABELS,
} from './schema.js';
import {
  optional, readBoolean, readChoice, readLookupName, readNumber, readText, type CrmRow,
} from './rowReaders.js';
import { escapeOData, mapPage } from './collectionQueries.js';

/**
 * Configuration, read.
 *
 * Every screen fed from here is read-only in Phase 5, and that is a design decision rather than an
 * unfinished one. Strategy criteria are *shown*; the thresholds themselves live in the QDB Rule
 * Engine, and authoring belongs to Phase 8. A React application that could edit a threshold would be
 * a second place where collection policy lives, which is exactly what Phase 5 was told not to build.
 */

// ── Collection strategies — the segmentation criteria ────────────────────────

export interface StrategyRow {
  id: string;
  code: string;
  name: string;
  priority?: number;
  isActive: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  ruleCode?: string;
  noAutomatedContact?: boolean;
  description?: string;
  customerType?: string;
  productType?: string;
  dpdFrom?: number;
  dpdTo?: number;
  arrearsFrom?: number;
  arrearsTo?: number;
  exposureFrom?: number;
  exposureTo?: number;
  riskLevel?: string;
  nplFlag?: boolean;
  brokenPtpCountFrom?: number;
  legalStatus?: string;
  restructureStatus?: string;
}

export function toStrategyRow(row: CrmRow): StrategyRow {
  return {
    id: String(row['qdb_collectionstrategyid']),
    code: readText(row, 'qdb_code') ?? '—',
    name: readText(row, 'qdb_name') ?? '—',
    isActive: readBoolean(row, 'qdb_isactive') === true,
    ...optional('priority', readNumber(row, 'qdb_priority')),
    ...optional('effectiveFrom', readText(row, 'qdb_effectivefrom')),
    ...optional('effectiveTo', readText(row, 'qdb_effectiveto')),
    ...optional('ruleCode', readText(row, 'qdb_rulecode')),
    ...optional('noAutomatedContact', readBoolean(row, 'qdb_noautomatedcontact')),
    ...optional('description', readText(row, 'qdb_description')),
    // Risk level and product type are choices this build has not verified option values for, so the
    // platform's own formatted value is the only label used for them.
    ...optional('customerType', readChoice(row, 'qdb_customertype', CUSTOMER_TYPE_LABELS)),
    ...optional('productType', readChoice(row, 'qdb_producttype')),
    ...optional('riskLevel', readChoice(row, 'qdb_risklevel')),
    ...optional('dpdFrom', readNumber(row, 'qdb_dpdfrom')),
    ...optional('dpdTo', readNumber(row, 'qdb_dpdto')),
    ...optional('arrearsFrom', readNumber(row, 'qdb_arrearsfrom')),
    ...optional('arrearsTo', readNumber(row, 'qdb_arrearsto')),
    ...optional('exposureFrom', readNumber(row, 'qdb_exposurefrom')),
    ...optional('exposureTo', readNumber(row, 'qdb_exposureto')),
    ...optional('nplFlag', readBoolean(row, 'qdb_nplflag')),
    ...optional('brokenPtpCountFrom', readNumber(row, 'qdb_brokenptpcountfrom')),
    ...optional('legalStatus', readText(row, 'qdb_legalstatus')),
    ...optional('restructureStatus', readText(row, 'qdb_restructurestatus')),
  };
}

export interface StrategyQuery {
  activeOnly?: boolean;
  search?: string;
}

export function createStrategyQuery(adapter: XrmCrmAdapter) {
  return async (
    request: StrategyQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<StrategyRow>> => {
    const clauses: string[] = [];
    if (request.activeOnly) clauses.push('qdb_isactive eq true');
    if (request.search) {
      const term = escapeOData(request.search);
      clauses.push(`(contains(qdb_name,'${term}') or contains(qdb_code,'${term}'))`);
    }
    const filter = clauses.length > 0 ? clauses.join(' and ') : undefined;

    const page = await adapter.retrievePage(ENTITY_SETS.collectionStrategy, {
      select: [...STRATEGY_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'qdb_priority', descending: false }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toStrategyRow);
  };
}

// ── Strategy actions — the resolved plan ─────────────────────────────────────

export interface StrategyActionRow {
  id: string;
  name: string;
  sequence?: number;
  dayOffset?: number;
  triggerEvent?: string;
  channel?: string;
  queueName?: string;
  requiresApproval?: boolean;
  isMandatory?: boolean;
  stopOnPayment?: boolean;
  stopOnPtp?: boolean;
  escalateIfNotCompleted?: boolean;
  escalationHours?: number;
  processCode?: string;
  ruleCode?: string;
  isActive: boolean;
  strategyId?: string;
  strategyName?: string;
  activityType?: string;
}

export function toStrategyActionRow(row: CrmRow): StrategyActionRow {
  return {
    id: String(row['qdb_strategyactionid']),
    name: readText(row, 'qdb_name') ?? '—',
    isActive: readBoolean(row, 'qdb_isactive') === true,
    ...optional('sequence', readNumber(row, 'qdb_sequence')),
    ...optional('dayOffset', readNumber(row, 'qdb_dayoffset')),
    ...optional('triggerEvent', readChoice(row, 'qdb_triggerevent', TRIGGER_EVENT_LABELS)),
    ...optional('channel', readChoice(row, 'qdb_communicationchannel', COMMUNICATION_CHANNEL_LABELS)),
    ...optional('queueName', readText(row, 'qdb_queuename')),
    ...optional('requiresApproval', readBoolean(row, 'qdb_requiresapproval')),
    ...optional('isMandatory', readBoolean(row, 'qdb_ismandatory')),
    ...optional('stopOnPayment', readBoolean(row, 'qdb_stoponpayment')),
    ...optional('stopOnPtp', readBoolean(row, 'qdb_stoponptp')),
    ...optional('escalateIfNotCompleted', readBoolean(row, 'qdb_escalateifnotcompleted')),
    ...optional('escalationHours', readNumber(row, 'qdb_escalationhours')),
    ...optional('processCode', readText(row, 'qdb_processcode')),
    ...optional('ruleCode', readText(row, 'qdb_rulecode')),
    // The lookup is read by its `_value` form. Selecting the bare storage column is accepted and
    // returns nothing — KI-52, and the reason every lookup in this workspace is written this way.
    ...optional('strategyId', readText(row, '_qdb_strategyid_value')),
    ...optional('strategyName', readLookupName(row, '_qdb_strategyid_value')),
    ...optional('activityType', readLookupName(row, '_qdb_activitytypeid_value')),
  };
}

export interface StrategyActionQuery {
  strategyId?: string;
  activeOnly?: boolean;
}

export function createStrategyActionQuery(adapter: XrmCrmAdapter) {
  return async (
    request: StrategyActionQuery & { pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<StrategyActionRow>> => {
    const clauses: string[] = [];
    if (request.strategyId) clauses.push(`_qdb_strategyid_value eq ${escapeOData(request.strategyId)}`);
    if (request.activeOnly) clauses.push('qdb_isactive eq true');
    const filter = clauses.length > 0 ? clauses.join(' and ') : undefined;

    const page = await adapter.retrievePage(ENTITY_SETS.strategyAction, {
      select: [...STRATEGY_ACTION_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'qdb_sequence', descending: false }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toStrategyActionRow);
  };
}

// ── Identity exceptions — what intake could not match ────────────────────────

export interface IdentityExceptionRow {
  id: string;
  name: string;
  customerBusinessId?: string;
  facilityNumber?: string;
  source?: string;
  reason?: string;
  status?: string;
  sourceReference?: string;
  batchId?: string;
  receivedDate?: string;
  resolution?: string;
  resolvedFacilityNumber?: string;
}

export function toIdentityExceptionRow(row: CrmRow): IdentityExceptionRow {
  return {
    id: String(row['qdb_identityexceptionid']),
    name: readText(row, 'qdb_name') ?? '—',
    ...optional('customerBusinessId', readText(row, 'qdb_customerbusinessid')),
    ...optional('facilityNumber', readText(row, 'qdb_facilitynumber')),
    ...optional('source', readText(row, 'qdb_source')),
    ...optional('reason', readChoice(row, 'qdb_exceptionreason', EXCEPTION_REASON_LABELS)),
    ...optional('status', readChoice(row, 'qdb_exceptionstatus', EXCEPTION_STATUS_LABELS)),
    ...optional('sourceReference', readText(row, 'qdb_sourcereference')),
    ...optional('batchId', readText(row, 'qdb_integrationbatchid')),
    ...optional('receivedDate', readText(row, 'qdb_receiveddate')),
    ...optional('resolution', readText(row, 'qdb_resolution')),
    ...optional('resolvedFacilityNumber', readText(row, 'qdb_resolvedfacilitynumber')),
  };
}

export function createIdentityExceptionQuery(adapter: XrmCrmAdapter) {
  return async (
    request: { openOnly?: boolean; pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<IdentityExceptionRow>> => {
    const filter = request.openOnly ? 'statecode eq 0' : undefined;
    const page = await adapter.retrievePage(ENTITY_SETS.identityException, {
      select: [...IDENTITY_EXCEPTION_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'qdb_receiveddate', descending: true }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toIdentityExceptionRow);
  };
}

// ── Platform configuration — the deployment's own shape ──────────────────────

export interface PlatformConfigurationRow {
  id: string;
  name: string;
  platformType?: string;
  organization?: string;
  environmentCode?: string;
  customerEntity?: string;
  customerBusinessIdField?: string;
  facilityEntity?: string;
  facilityBusinessIdField?: string;
  eligibilityRulesetCode?: string;
  strategyRulesetCode?: string;
  contactHoldRulesetCode?: string;
  snapshotPolicy?: string;
  defaultCustomerType?: string;
  featureFlags?: string;
  misIntegrationEnabled?: boolean;
  misProvider?: string;
  isActive: boolean;
}

export function toPlatformConfigurationRow(row: CrmRow): PlatformConfigurationRow {
  return {
    id: String(row['qdb_platformconfigurationid']),
    name: readText(row, 'qdb_name') ?? '—',
    isActive: readBoolean(row, 'qdb_isactive') === true,
    ...optional('platformType', readChoice(row, 'qdb_platformtype', PLATFORM_TYPE_LABELS)),
    ...optional('organization', readChoice(row, 'qdb_organizationcode', ORG_LABELS)),
    ...optional('environmentCode', readText(row, 'qdb_environmentcode')),
    ...optional('customerEntity', readText(row, 'qdb_customerentity')),
    ...optional('customerBusinessIdField', readText(row, 'qdb_customerbusinessidfield')),
    ...optional('facilityEntity', readText(row, 'qdb_facilityentity')),
    ...optional('facilityBusinessIdField', readText(row, 'qdb_facilitybusinessidfield')),
    ...optional('eligibilityRulesetCode', readText(row, 'qdb_eligibilityrulesetcode')),
    ...optional('strategyRulesetCode', readText(row, 'qdb_strategyrulesetcode')),
    ...optional('contactHoldRulesetCode', readText(row, 'qdb_contactholdrulesetcode')),
    ...optional('snapshotPolicy', readChoice(row, 'qdb_snapshotpolicy', SNAPSHOT_POLICY_LABELS)),
    ...optional('defaultCustomerType', readChoice(row, 'qdb_customertype', CUSTOMER_TYPE_LABELS)),
    ...optional('featureFlags', readText(row, 'qdb_featureflags')),
    ...optional('misIntegrationEnabled', readBoolean(row, 'qdb_misintegrationenabled')),
    ...optional('misProvider', readChoice(row, 'qdb_misprovider')),
  };
}

/** The configuration rows. A handful per organisation — bounded by nature, so not paged. */
export async function retrievePlatformConfigurations(
  adapter: XrmCrmAdapter,
): Promise<readonly PlatformConfigurationRow[]> {
  const rows = await adapter.retrieveMultiple(ENTITY_SETS.platformConfiguration, {
    select: [...PLATFORM_CONFIGURATION_COLUMNS],
    orderBy: { field: 'qdb_name', descending: false },
    top: 50,
  });
  return rows.map(toPlatformConfigurationRow);
}

export interface PlatformMappingRow {
  id: string;
  name: string;
  businessObject?: string;
  canonicalField?: string;
  crmEntity?: string;
  crmField?: string;
  dataType?: string;
  isRequired?: boolean;
  accessMode?: string;
  isActive: boolean;
  configurationId?: string;
}

export function toPlatformMappingRow(row: CrmRow): PlatformMappingRow {
  return {
    id: String(row['qdb_platformmappingid']),
    name: readText(row, 'qdb_name') ?? '—',
    isActive: readBoolean(row, 'qdb_isactive') === true,
    ...optional('businessObject', readChoice(row, 'qdb_businessobject')),
    ...optional('canonicalField', readText(row, 'qdb_canonicalfield')),
    ...optional('crmEntity', readText(row, 'qdb_crmentitylogicalname')),
    ...optional('crmField', readText(row, 'qdb_crmfieldlogicalname')),
    ...optional('dataType', readText(row, 'qdb_datatype')),
    ...optional('isRequired', readBoolean(row, 'qdb_isrequired')),
    ...optional('accessMode', readChoice(row, 'qdb_accessmode')),
    ...optional('configurationId', readText(row, '_qdb_platformconfigurationid_value')),
  };
}

export function createPlatformMappingQuery(adapter: XrmCrmAdapter) {
  return async (
    request: { configurationId?: string; pageSize: number; continuation?: ContinuationToken },
  ): Promise<Page<PlatformMappingRow>> => {
    const filter = request.configurationId
      ? `_qdb_platformconfigurationid_value eq ${escapeOData(request.configurationId)}`
      : undefined;
    const page = await adapter.retrievePage(ENTITY_SETS.platformMapping, {
      select: [...PLATFORM_MAPPING_COLUMNS],
      pageSize: request.pageSize,
      sort: [{ field: 'qdb_name', descending: false }],
      ...(filter !== undefined ? { filter } : {}),
      ...(request.continuation !== undefined ? { continuation: request.continuation } : {}),
      includeTotalCount: request.continuation === undefined,
    });
    return mapPage(page, toPlatformMappingRow);
  };
}
