/**
 * The Collection Case as the domain sees it: one delinquent facility, one delinquency episode.
 *
 * What the case carries is deliberately enough to identify the facility on its own — the MIS facility
 * number and the source system — so that no CRM facility record has to exist for the case to exist.
 * The Facility Limit (BFD) and Customer Product (HL) tables are optional enrichment for navigation and
 * are not referenced here at all.
 */

import { z } from 'zod';
import { CaseStatus, CASE_STATUS_CODES } from './caseLifecycle.js';
import { CachedMisPositionSchema, FacilityIdentitySchema } from './misObservation.js';
import { CustomerMasterEntitySchema } from './customerResolution.js';
import { OrganizationCodeSchema } from './platformConfiguration.js';

export const CaseStatusSchema = z.enum(Object.keys(CASE_STATUS_CODES) as [CaseStatus, ...CaseStatus[]]);

/** How an episode ended. Values are the labels of `qdb_resolution_type`. */
export const CaseResolutionTypeSchema = z.enum([
  'Cured', 'Settled', 'Restructured', 'WrittenOff', 'Legal', 'Deceased', 'Closed',
]);
export type CaseResolutionType = z.infer<typeof CaseResolutionTypeSchema>;

/** A reference to the CRM customer master record the case belongs to. */
export const CaseCustomerRefSchema = z.object({
  entity: CustomerMasterEntitySchema,
  id: z.string().uuid(),
});

export const CollectionCaseSchema = z.object({
  id: z.string().uuid().optional(),
  /** Primary name. Provisional composition until QDB's auto-number configuration covers this table (KI-39). */
  caseNumber: z.string().min(1),
  customer: CaseCustomerRefSchema,
  /** The business identifier copied at create for search and reporting; the master is contact/account. */
  customerBusinessId: z.string().min(1),
  facility: FacilityIdentitySchema,
  organizationCode: OrganizationCodeSchema,
  /** Sequence of this delinquency episode for the facility, starting at 1. */
  episodeNumber: z.number().int().positive(),
  status: CaseStatusSchema,
  openDate: z.string(),
  /** Selected current MIS values the case caches for operational use. Never the source of truth. */
  cachedPosition: CachedMisPositionSchema.optional(),
  cureDate: z.string().optional(),
  closedDate: z.string().optional(),
  resolutionType: CaseResolutionTypeSchema.optional(),
  /** Provenance of the decision that created this episode. */
  eligibilityRulesetVersion: z.string().optional(),
  correlationId: z.string().optional(),
});
export type CollectionCase = z.infer<typeof CollectionCaseSchema>;

/** The subset a repository returns when a caller only needs to know what is open. */
export const CaseSummarySchema = CollectionCaseSchema.pick({
  id: true, caseNumber: true, facility: true, episodeNumber: true, status: true,
  cachedPosition: true, cureDate: true, closedDate: true, openDate: true,
}).extend({ id: z.string().uuid() });
export type CaseSummary = z.infer<typeof CaseSummarySchema>;

/**
 * Composes the provisional case number from business identity: unique per facility and episode by
 * construction, and readable. Replaced by QDB's auto-number configuration once that covers the table;
 * until then this is identity, not an invented numbering policy.
 */
export function composeProvisionalCaseNumber(facility: { facilityNumber: string; sourceSystem: string }, episodeNumber: number): string {
  return `${facility.sourceSystem}-${facility.facilityNumber}-E${episodeNumber}`;
}
