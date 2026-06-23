import { z } from 'zod';

// ---------------------------------------------------------------------------
// CMS domain types — Track C (Content Management System)
// ---------------------------------------------------------------------------

export type CmsContentType = 'blog' | 'news' | 'announcement' | 'page';
export type CmsStatus = 'draft' | 'published' | 'archived';

/** Full content record including body HTML — used for detail views. */
export interface CmsContent {
  id: string;
  slug: string;
  title: string;
  titleAr: string;
  contentType: CmsContentType;
  bodyHtml: string;
  bodyHtmlAr: string;
  excerpt: string;
  excerptAr: string;
  coverImageUrl: string | null;
  status: CmsStatus;
  /** ISO 8601 date string, null when not yet published */
  publishedOn: string | null;
  authorName: string;
  tags: string[];
  metaDescription: string;
  createdOn: string;
  modifiedOn: string;
}

/** Lightweight summary used in list views — omits body HTML fields. */
export interface CmsSummary {
  id: string;
  slug: string;
  title: string;
  titleAr: string;
  contentType: CmsContentType;
  excerpt: string;
  excerptAr: string;
  coverImageUrl: string | null;
  status: CmsStatus;
  /** ISO 8601 date string, null when not yet published */
  publishedOn: string | null;
  authorName: string;
  tags: string[];
  createdOn: string;
}

/** Point-in-time snapshot of a content record's body, saved before each update. */
export interface CmsRevision {
  id: string;
  contentId: string;
  bodyHtml: string;
  bodyHtmlAr: string;
  savedBy: string;
  savedOn: string;
}

// ---------------------------------------------------------------------------
// Zod schemas for admin API request validation
// ---------------------------------------------------------------------------

export const CreateCmsContentSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  title: z.string().min(1).max(255),
  titleAr: z.string().min(1).max(255),
  contentType: z.enum(['blog', 'news', 'announcement', 'page']),
  bodyHtml: z.string().default(''),
  bodyHtmlAr: z.string().default(''),
  excerpt: z.string().max(500).default(''),
  excerptAr: z.string().max(500).default(''),
  coverImageUrl: z.string().url().nullable().default(null),
  authorName: z.string().min(1).max(255),
  tags: z.array(z.string()).default([]),
  metaDescription: z.string().max(500).default(''),
});

/** All fields optional on update; slug cannot be changed after creation. */
export const UpdateCmsContentSchema = CreateCmsContentSchema.partial().omit({ slug: true });

export const CmsListQuerySchema = z.object({
  type: z.enum(['blog', 'news', 'announcement', 'page']).optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export const AdminCmsListQuerySchema = CmsListQuerySchema.extend({
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

export type CreateCmsContentBody = z.infer<typeof CreateCmsContentSchema>;
export type UpdateCmsContentBody = z.infer<typeof UpdateCmsContentSchema>;
export type CmsListQuery = z.infer<typeof CmsListQuerySchema>;
export type AdminCmsListQuery = z.infer<typeof AdminCmsListQuerySchema>;
