import { z } from 'zod';

// ---------------------------------------------------------------------------
// Service catalog domain types
// ---------------------------------------------------------------------------

export interface ServiceTab {
  id: string;
  title: string;
  titleAr: string;
  /** Rich-text HTML content */
  content: string;
  contentAr: string;
  displayOrder: number;
}

export interface PortalService {
  id: string;
  code: string;
  title: string;
  titleAr: string;
  shortDescription: string;
  shortDescriptionAr: string;
  fullDescription: string;
  fullDescriptionAr: string;
  /** e.g. "SME", "Enterprise" */
  categoryTag: string;
  imageUrl: string;
  /** Links to qdb_form_definition.qdb_form_code */
  formCode: string;
  isActive: boolean;
  displayOrder: number;
  tabs: ServiceTab[];
}

// ---------------------------------------------------------------------------
// Zod schemas — services are read-only from portal, no create/patch needed here
// ---------------------------------------------------------------------------

export const ServiceCodeParamSchema = z.object({
  code: z.string().min(1),
});

export type ServiceCodeParam = z.infer<typeof ServiceCodeParamSchema>;
