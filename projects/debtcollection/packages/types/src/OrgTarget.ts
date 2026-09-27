import { z } from 'zod';

export const OrgKeySchema = z.enum(['HL', 'BFD']);

/** The two CRM organisations this platform bridges. */
export type OrgKey = z.infer<typeof OrgKeySchema>;

export const OrgTargetSchema = z.object({
  orgKey: OrgKeySchema,
  /** Base URL of the Dataverse / D365 CE org, no trailing slash. */
  baseUrl: z.string().url(),
  /**
   * Web API version used in the OData path, e.g. '9.1' on Dynamics 365 CE 9.1 on-premises or
   * '9.2' on Dataverse.
   *
   * Deliberately has **no default**: the version is a platform difference and must arrive from
   * configuration (`DV_API_VERSION` / `DV_BFD_API_VERSION`) or from the CRM runtime context in the
   * browser. Defaulting it here would reintroduce a compiled-in platform assumption, which the
   * dual-platform principle forbids.
   */
  apiVersion: z.string().regex(/^\d+\.\d+$/, 'apiVersion must look like "9.1" or "9.2"'),
});

/** Runtime descriptor for one of the two CRM organisations. */
export type OrgTarget = z.infer<typeof OrgTargetSchema>;
