import { z } from 'zod';

/**
 * Canonical Collection Customer.
 *
 * This is the shape Collection services, the Rule Engine and React work with. It is deliberately
 * **not** a Dataverse row: HL resolves it from `contact`, BFD from `account`, and the physical column
 * bindings live in Platform Mapping. No Collection logic may branch on which organisation or which
 * physical entity produced it.
 *
 * There is no DCP customer master — this type is an aggregation over existing QDB masters.
 */

export const CustomerTypeSchema = z.enum(['Individual', 'SME', 'Corporate']);
export type CustomerType = z.infer<typeof CustomerTypeSchema>;

export const CollectionLanguageSchema = z.enum(['ar', 'en']);
export type CollectionLanguage = z.infer<typeof CollectionLanguageSchema>;

/**
 * Collection-specific customer attributes that persist across Collection Cases.
 *
 * These describe the *customer*, not a delinquency episode, so they live on contact/account as `qdb_`
 * extensions. They are inputs to the Contact Hold evaluation — they are not themselves the decision.
 * Whether any particular combination establishes a hold is Rule Engine configuration and remains
 * business policy (`TBD — Requires QDB Confirmation`).
 */
export const CollectionFlagsSchema = z.object({
  stopContact: z.boolean().default(false),
  stopContactReason: z.string().optional(),
  deceased: z.boolean().default(false),
  dateOfDeath: z.string().optional(),
  /** Where the deceased indicator came from, e.g. a QCB feed or a QDB process. Never interpreted here. */
  deceasedSource: z.string().optional(),
  vulnerability: z.boolean().default(false),
  specialHandling: z.boolean().default(false),
  language: CollectionLanguageSchema.optional(),
});
export type CollectionFlags = z.infer<typeof CollectionFlagsSchema>;

/** Contact points. Masked for callers without the View Sensitive PII claim (FR-014 / FR-114). */
export const CustomerContactPointsSchema = z.object({
  mobile: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
});
export type CustomerContactPoints = z.infer<typeof CustomerContactPointsSchema>;

export const CollectionCustomerSchema = z.object({
  /** CRM record id of the underlying contact (HL) or account (BFD). */
  customerId: z.string().uuid(),
  /** Which physical master this came from. Presentation/diagnostics only — never a branch condition. */
  sourceEntity: z.enum(['contact', 'account']),
  customerType: CustomerTypeSchema,
  /**
   * Stable business identity: QID / ID Number for HL individuals, CR / UEN / TRN or another approved
   * identifier for BFD (`TBD — Requires QDB Confirmation`). Never a mobile number.
   */
  businessId: z.string().optional(),
  /** Secondary identifier used to cross-check `businessId` during MIS resolution. */
  customerNumber: z.string().optional(),
  displayName: z.string(),
  contactPoints: CustomerContactPointsSchema.default({}),
  flags: CollectionFlagsSchema.default({}),
});
export type CollectionCustomer = z.infer<typeof CollectionCustomerSchema>;
