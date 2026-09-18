/**
 * Platform configuration: where the deployment's shape lives so the code does not carry it.
 *
 * The Debt Collection Platform owns no customer or facility master. Housing Loan keeps customers on
 * `contact`, BFD on `account`, and the facility table differs again; on-premises and cloud differ in
 * Web API version. None of that may appear as a constant in Collection logic — the Master Prompt is
 * explicit that thresholds and names are configuration, never constants — so every such name is
 * read from `qdb_platformconfiguration`, and every field-level mapping from `qdb_platformmapping`.
 *
 * This module defines the contract and the resolution rules. Reading the rows is the service's job;
 * keeping the rules here means they are testable without an organisation.
 */

import { z } from 'zod';

/** Which organisation a configuration row describes, as provisioned in qdb_organization_code. */
export const OrganizationCodeSchema = z.enum(['HL', 'BFD']);
export type OrganizationCode = z.infer<typeof OrganizationCodeSchema>;

/** Which target the deployment runs on, as provisioned in qdb_platform_type. */
export const PlatformTypeSchema = z.enum(['OnPrem', 'Cloud']);
export type PlatformType = z.infer<typeof PlatformTypeSchema>;

/** The business objects a mapping row can describe. */
export const BusinessObjectSchema = z.enum([
  'Customer',
  'Facility',
  'Case',
  'Activity',
  'Communication',
  'Document',
]);
export type BusinessObject = z.infer<typeof BusinessObjectSchema>;

/** Whether a mapped field may be written back to the source system. */
export const AccessModeSchema = z.enum(['Read', 'Write', 'ReadWrite']);
export type AccessMode = z.infer<typeof AccessModeSchema>;

/**
 * One canonical field bound to one physical column on one table.
 * `canonicalField` is the name the Collection code uses; the other two are what the deployment has.
 */
export const FieldMappingSchema = z.object({
  businessObject: BusinessObjectSchema,
  canonicalField: z.string().min(1),
  entity: z.string().min(1),
  field: z.string().min(1),
  isRequired: z.boolean(),
  accessMode: AccessModeSchema,
});
export type FieldMapping = z.infer<typeof FieldMappingSchema>;

/**
 * The resolved shape of one deployment.
 *
 * Nothing here has a default. A missing value is a configuration error to surface, not something to
 * guess: guessing `contact` on a BFD organisation would silently read the wrong master.
 */
export const PlatformConfigurationSchema = z.object({
  /** Which organisation this configuration describes, e.g. the Housing Loan or BFD org code. */
  organizationCode: OrganizationCodeSchema,
  /** Whether this deployment runs on-premises or in the cloud. Never inferred from the URL. */
  platformType: PlatformTypeSchema,
  /** Web API version for this target — 9.1 on-premises, 9.2 cloud. Never assumed. */
  apiVersion: z.string().regex(/^\d+\.\d+$/, 'apiVersion must look like "9.1" or "9.2"'),
  /** Table holding the customer master for this deployment. */
  customerEntity: z.string().min(1),
  /** Column on the customer master carrying the business identifier (QID, customer number). */
  customerBusinessIdField: z.string().min(1),
  /** Table holding the facility master, when the deployment has one. */
  facilityEntity: z.string().min(1).optional(),
  /** Column on the facility master carrying the facility number. */
  facilityBusinessIdField: z.string().min(1).optional(),
  /** Ruleset codes the Collection services evaluate; no defaults, per ADR-DCP-11. */
  eligibilityRulesetCode: z.string().min(1).optional(),
  contactHoldRulesetCode: z.string().min(1).optional(),
  /** The customer type this deployment's cases carry when MIS does not say. Configuration, never a constant. */
  defaultCustomerType: z.enum(['Individual', 'SME', 'Corporate']).optional(),
  /** Snapshot retention policy. Deliberately has no default — the choice is QDB's. */
  snapshotPolicy: z.enum(['AllReceived', 'EligibleOnly', 'ChangedOnly']).optional(),
  /** Field-level mappings for this deployment. */
  mappings: z.array(FieldMappingSchema),
  /**
   * The JSON bag in qdb_featureflags. Collection settings that are provisional or policy — the
   * snapshot key composition, the episode reopen policy, the eligibility operation name — are read
   * from here by collectionSettings.ts, and none has a default.
   */
  featureFlags: z.record(z.unknown()).optional(),
});
export type PlatformConfiguration = z.infer<typeof PlatformConfigurationSchema>;

/** Raised when the deployment has not configured something the caller needs. */
export class PlatformConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformConfigurationError';
  }
}

/**
 * Resolves a canonical field to the physical table and column this deployment uses.
 * @throws PlatformConfigurationError when the deployment has no mapping for it.
 */
export function resolveField(
  configuration: PlatformConfiguration,
  businessObject: BusinessObject,
  canonicalField: string,
): FieldMapping {
  const mapping = configuration.mappings.find(
    m => m.businessObject === businessObject && m.canonicalField === canonicalField,
  );
  if (!mapping) {
    throw new PlatformConfigurationError(
      `No mapping for ${businessObject}.${canonicalField} in organisation ${configuration.organizationCode}. ` +
      'Add a qdb_platformmapping row rather than hard-coding the column.',
    );
  }
  return mapping;
}

/**
 * Returns the physical columns for a set of canonical fields, for building a select list.
 * @throws PlatformConfigurationError on the first field the deployment has not mapped.
 */
export function resolveFields(
  configuration: PlatformConfiguration,
  businessObject: BusinessObject,
  canonicalFields: string[],
): string[] {
  return canonicalFields.map(field => resolveField(configuration, businessObject, field).field);
}

/**
 * Returns the facility master for this deployment.
 * @throws PlatformConfigurationError when the deployment has no facility master configured — which
 * is a legitimate state, so callers that can work without one should check `facilityEntity` instead.
 */
export function requireFacilityEntity(configuration: PlatformConfiguration): string {
  if (!configuration.facilityEntity) {
    throw new PlatformConfigurationError(
      `Organisation ${configuration.organizationCode} has no facility master configured. ` +
      'A physical facility lookup is an optional per-deployment extension, not part of the shared schema.',
    );
  }
  return configuration.facilityEntity;
}

/** Reads a canonical value off a record using the deployment's mapping. */
export function readMappedValue(
  configuration: PlatformConfiguration,
  businessObject: BusinessObject,
  canonicalField: string,
  record: Record<string, unknown>,
): unknown {
  return record[resolveField(configuration, businessObject, canonicalField).field];
}

/**
 * Supplies the configuration for an organisation. Implementations cache; the interface does not say
 * how, because a plugin, the API and a background job all need this and cache differently.
 */
export interface IPlatformConfigurationService {
  /** Returns the configuration for an organisation code. */
  getConfiguration(organizationCode: OrganizationCode): Promise<PlatformConfiguration>;
}
