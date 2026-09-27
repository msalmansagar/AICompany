import { z } from 'zod';

/**
 * Canonical Collection Facility.
 *
 * The canonical contract is **`facilityNumber` + `sourceSystem`** plus resolved facility domain
 * information. It deliberately does not depend on a physical lookup: a Dynamics lookup's target entity
 * is fixed metadata, so an HL-targeted and a BFD-targeted `qdb_facilityid` are *two different physical
 * relationships*, not one shared schema. Any such lookup is an optional per-deployment extension.
 *
 * Consequences that the type enforces:
 *   - `facilityNumber` is required — it is the MIS Account Number and the stable business key.
 *   - `crmRecordId` is optional — Collection logic must work when no physical lookup is deployed, and
 *     an unresolved MIS observation must still be representable.
 *   - No field names a physical entity; `sourceSystem` is an opaque label for diagnostics and mapping.
 */

export const FacilitySourceSystemSchema = z.string().min(1);

export const FacilityStatusSchema = z.object({
  /** Source status code, carried verbatim. DCP does not interpret unconfirmed codes. */
  statusCode: z.string().optional(),
  /** Set only where a confirmed mapping exists; absent means "not interpreted". */
  isActive: z.boolean().optional(),
});
export type FacilityStatus = z.infer<typeof FacilityStatusSchema>;

export const CollectionFacilitySchema = z.object({
  /** MIS Account Number / facility business key. The canonical identity. */
  facilityNumber: z.string().min(1),
  /**
   * Which system of record this facility came from (e.g. an organisation code). Used by Platform
   * Mapping to choose the physical binding — never by Collection business logic to branch.
   */
  sourceSystem: FacilitySourceSystemSchema,
  /**
   * CRM id of the underlying facility/loan-account record, when an optional per-deployment lookup is
   * configured and resolution succeeded. **Optional by design.**
   */
  crmRecordId: z.string().uuid().optional(),
  /** Logical name of the physical entity that produced `crmRecordId`, for diagnostics only. */
  crmEntityLogicalName: z.string().optional(),
  customerId: z.string().uuid().optional(),
  productCode: z.string().optional(),
  productDescription: z.string().optional(),
  status: FacilityStatusSchema.default({}),
  originalAmount: z.number().optional(),
  startDate: z.string().optional(),
  maturityDate: z.string().optional(),
});
export type CollectionFacility = z.infer<typeof CollectionFacilitySchema>;

/**
 * True when a physical CRM facility record was resolved. Call sites use this to decide whether native
 * navigation is offered — never to decide whether Collection processing may proceed.
 */
export function hasResolvedCrmRecord(facility: CollectionFacility): boolean {
  return facility.crmRecordId !== undefined;
}
