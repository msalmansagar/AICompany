import { z } from 'zod';

export const OrgKeySchema = z.enum(['HL', 'BFD']);

/** The two CRM organisations this platform bridges. */
export type OrgKey = z.infer<typeof OrgKeySchema>;

export const OrgTargetSchema = z.object({
  orgKey: OrgKeySchema,
  /** Base URL of the Dataverse / D365 CE org, no trailing slash. */
  baseUrl: z.string().url(),
  /** Web API version to use in the OData path (e.g. '9.2'). */
  apiVersion: z.string().default('9.2'),
});

/** Runtime descriptor for one of the two CRM organisations. */
export type OrgTarget = z.infer<typeof OrgTargetSchema>;
