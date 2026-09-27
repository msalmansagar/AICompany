import { z } from 'zod';

export const PreferredLanguageSchema = z.enum(['ar', 'en']);

/**
 * Customer master record (msst_dcpcustomer).
 * PII fields (msst_mobile, msst_email, msst_address) are omitted when the
 * caller's token lacks the 'View Sensitive PII' claim (FR-014 / FR-114).
 */
export const CustomerSchema = z.object({
  msst_dcpcustomerid: z.string().uuid(),
  msst_qid: z.string(),
  msst_crnumber: z.string().optional(),
  msst_fullname: z.string(),
  msst_nationality: z.string().optional(),
  msst_employer: z.string().optional(),
  /** PII — present only for callers with View Sensitive PII. */
  msst_mobile: z.string().optional(),
  /** PII — present only for callers with View Sensitive PII. */
  msst_email: z.string().optional(),
  /** PII — present only for callers with View Sensitive PII. */
  msst_address: z.string().optional(),
  msst_salarytransfer: z.boolean().optional(),
  msst_vulnerabilityflag: z.boolean().optional(),
  msst_stopcontact: z.boolean(),
  msst_deceasedflag: z.boolean().optional(),
  msst_dateofdeath: z.string().optional(),
  msst_deathsource: z.string().optional(),
  msst_preferredlanguage: PreferredLanguageSchema.optional(),
  createdon: z.string().optional(), // FIXED: Dataverse uses createdon (no underscore)
  modifiedon: z.string().optional(), // FIXED: Dataverse uses modifiedon (no underscore)
});

export type Customer = z.infer<typeof CustomerSchema>;
