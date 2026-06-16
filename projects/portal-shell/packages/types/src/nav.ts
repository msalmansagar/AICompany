import { z } from 'zod';

// ---------------------------------------------------------------------------
// Navigation domain types
// ---------------------------------------------------------------------------

export interface NavItem {
  id: string;
  label: string;
  labelAr: string;
  /** Fluent UI icon name */
  icon: string;
  pageCode: string;
  displayOrder: number;
  isVisible: boolean;
  badgeSource: 'none' | 'static' | 'query';
  /** Static value or OData query string used when badgeSource !== 'none' */
  badgeValue: string | null;
  requiredRole: string | null;
  parentId: string | null;
  children?: NavItem[];
  /** Resolved at runtime from Dataverse when badgeSource === 'query' */
  liveCount?: number;
}

// ---------------------------------------------------------------------------
// Zod schemas for admin nav-item mutations
// ---------------------------------------------------------------------------

export const NavItemCreateSchema = z.object({
  label: z.string().min(1),
  labelAr: z.string().min(1),
  icon: z.string().min(1),
  pageCode: z.string().min(1),
  displayOrder: z.number().int().min(0),
  isVisible: z.boolean(),
  badgeSource: z.enum(['none', 'static', 'query']),
  badgeValue: z.string().nullable(),
  requiredRole: z.string().nullable(),
  parentId: z.string().uuid().nullable(),
});

export const NavItemPatchSchema = NavItemCreateSchema.partial();

export type NavItemCreate = z.infer<typeof NavItemCreateSchema>;
export type NavItemPatch = z.infer<typeof NavItemPatchSchema>;
