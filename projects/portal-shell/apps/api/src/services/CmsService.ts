/**
 * CmsService — Dataverse data access for Track C (CMS).
 *
 * Dataverse entity schema (schema definitions — do NOT generate migration scripts):
 *
 * ─── qdb_cms_content ────────────────────────────────────────────────────────
 *   qdb_cms_contentid   : GUID PK
 *   qdb_slug            : String(100), unique, URL-safe
 *   qdb_title           : String(255)
 *   qdb_title_ar        : String(255) — Arabic title
 *   qdb_content_type    : Picklist  — 100000001=blog, 100000002=news,
 *                                     100000003=announcement, 100000004=page
 *   qdb_body_html       : Memo — Tiptap HTML output (English)
 *   qdb_body_html_ar    : Memo — Tiptap HTML output (Arabic)
 *   qdb_excerpt         : String(500)
 *   qdb_excerpt_ar      : String(500)
 *   qdb_cover_image_url : String(500)
 *   qdb_status          : Picklist  — 100000001=draft, 100000002=published,
 *                                     100000003=archived
 *   qdb_published_on    : DateTime
 *   qdb_author_name     : String(255) — denormalized display name
 *   qdb_tags            : String(1000) — comma-separated tags
 *   qdb_meta_description: String(500)
 *   createdon           : DateTime (standard Dataverse field)
 *   modifiedon          : DateTime (standard Dataverse field)
 *
 * ─── qdb_cms_revision ───────────────────────────────────────────────────────
 *   qdb_cms_revisionid  : GUID PK
 *   qdb_content_id      : Lookup → qdb_cms_content
 *   qdb_body_html       : Memo — snapshot of body at save time
 *   qdb_body_html_ar    : Memo — Arabic snapshot
 *   qdb_saved_by        : String(255) — user display name
 *   createdon           : DateTime — revision timestamp
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { DataverseClient } from '@portal/dataverse-client';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type {
  CmsContent,
  CmsSummary,
  CmsRevision,
  CmsContentType,
  CmsStatus,
  CreateCmsContentBody,
  UpdateCmsContentBody,
  CmsListQuery,
  AdminCmsListQuery,
} from '@portal/types';

// ---------------------------------------------------------------------------
// Entity names
// ---------------------------------------------------------------------------

const CONTENT_ENTITY = 'qdb_cms_contents';
const REVISION_ENTITY = 'qdb_cms_revisions';

// ---------------------------------------------------------------------------
// Picklist maps
// ---------------------------------------------------------------------------

const CONTENT_TYPE_MAP: Record<number, CmsContentType> = {
  100000001: 'blog',
  100000002: 'news',
  100000003: 'announcement',
  100000004: 'page',
};

const CONTENT_TYPE_REVERSE: Record<CmsContentType, number> = {
  blog: 100000001,
  news: 100000002,
  announcement: 100000003,
  page: 100000004,
};

const STATUS_MAP: Record<number, CmsStatus> = {
  100000001: 'draft',
  100000002: 'published',
  100000003: 'archived',
};

const STATUS_REVERSE: Record<CmsStatus, number> = {
  draft: 100000001,
  published: 100000002,
  archived: 100000003,
};

const PUBLISHED_STATUS_CODE = 100000002;

// ---------------------------------------------------------------------------
// Dataverse record shapes
// ---------------------------------------------------------------------------

interface DataverseCmsContent {
  qdb_cms_contentid: string;
  qdb_slug: string;
  qdb_title: string;
  qdb_title_ar: string;
  qdb_content_type: number;
  qdb_body_html: string;
  qdb_body_html_ar: string;
  qdb_excerpt: string;
  qdb_excerpt_ar: string;
  qdb_cover_image_url: string | null;
  qdb_status: number;
  qdb_published_on: string | null;
  qdb_author_name: string;
  qdb_tags: string | null;
  qdb_meta_description: string;
  createdon: string;
  modifiedon: string;
}

interface DataverseCmsRevision {
  qdb_cms_revisionid: string;
  '_qdb_content_id_value': string;
  qdb_body_html: string;
  qdb_body_html_ar: string;
  qdb_saved_by: string;
  createdon: string;
}

// ---------------------------------------------------------------------------
// Field selection lists
// ---------------------------------------------------------------------------

const SUMMARY_SELECT_FIELDS: (keyof DataverseCmsContent)[] = [
  'qdb_cms_contentid',
  'qdb_slug',
  'qdb_title',
  'qdb_title_ar',
  'qdb_content_type',
  'qdb_excerpt',
  'qdb_excerpt_ar',
  'qdb_cover_image_url',
  'qdb_status',
  'qdb_published_on',
  'qdb_author_name',
  'qdb_tags',
  'createdon',
];

const FULL_SELECT_FIELDS: (keyof DataverseCmsContent)[] = [
  ...SUMMARY_SELECT_FIELDS,
  'qdb_body_html',
  'qdb_body_html_ar',
  'qdb_meta_description',
  'modifiedon',
];

const REVISION_SELECT_FIELDS: (keyof DataverseCmsRevision)[] = [
  'qdb_cms_revisionid',
  '_qdb_content_id_value',
  'qdb_body_html',
  'qdb_body_html_ar',
  'qdb_saved_by',
  'createdon',
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Data access service for the CMS (Track C).
 *
 * All methods are async. Picklist values are mapped to and from string enums
 * at this layer so routes and types never reference Dataverse integer codes.
 */
export class CmsService {
  private readonly dataverse: DataverseClient;

  constructor(dataverse: DataverseClient) {
    this.dataverse = dataverse;
  }

  /**
   * Returns a paginated list of published content items — public endpoint.
   *
   * OData filter: qdb_status eq 100000002 (published only).
   * Ordered by qdb_published_on descending.
   * Optional filters: content type and tag substring match.
   *
   * @param query - Validated list query params
   * @param correlationId - Request correlation ID
   */
  async listPublished(
    query: CmsListQuery,
    correlationId?: string,
  ): Promise<{ items: CmsSummary[]; total: number }> {
    const filter = buildPublishedFilter(query);
    const skip = (query.page - 1) * query.pageSize;

    const result = await this.dataverse.getList<DataverseCmsContent>(
      CONTENT_ENTITY,
      {
        select: SUMMARY_SELECT_FIELDS as string[],
        filter,
        orderBy: 'qdb_published_on desc',
        top: query.pageSize,
        skip,
        count: true,
      },
      { correlationId },
    );

    return {
      items: result.value.map(mapToSummary),
      total: result['@odata.count'] ?? result.value.length,
    };
  }

  /**
   * Returns a single published content record by URL slug — public endpoint.
   *
   * Throws DataverseNotFoundError when the slug does not exist or the record
   * is not in published status.
   *
   * @param slug - URL-safe slug to look up
   * @param correlationId - Request correlation ID
   */
  async getBySlug(slug: string, correlationId?: string): Promise<CmsContent> {
    const result = await this.dataverse.getList<DataverseCmsContent>(
      CONTENT_ENTITY,
      {
        select: FULL_SELECT_FIELDS as string[],
        filter: `qdb_slug eq '${escapeODataString(slug)}' and qdb_status eq ${PUBLISHED_STATUS_CODE}`,
        top: 1,
      },
      { correlationId },
    );

    const record = result.value[0];
    if (!record) {
      throw new DataverseNotFoundError(CONTENT_ENTITY, slug);
    }
    return mapToContent(record);
  }

  /**
   * Returns a paginated list of all content records across all statuses — admin endpoint.
   *
   * @param query - Validated admin list query params (includes optional status filter)
   * @param correlationId - Request correlation ID
   */
  async listAll(
    query: AdminCmsListQuery,
    correlationId?: string,
  ): Promise<{ items: CmsSummary[]; total: number }> {
    const filter = buildAdminFilter(query);
    const skip = (query.page - 1) * query.pageSize;

    const result = await this.dataverse.getList<DataverseCmsContent>(
      CONTENT_ENTITY,
      {
        select: SUMMARY_SELECT_FIELDS as string[],
        filter,
        orderBy: 'createdon desc',
        top: query.pageSize,
        skip,
        count: true,
      },
      { correlationId },
    );

    return {
      items: result.value.map(mapToSummary),
      total: result['@odata.count'] ?? result.value.length,
    };
  }

  /**
   * Returns a full content record by Dataverse GUID — admin endpoint.
   *
   * Throws DataverseNotFoundError when the ID does not exist.
   *
   * @param id - GUID of the content record
   * @param correlationId - Request correlation ID
   */
  async getById(id: string, correlationId?: string): Promise<CmsContent> {
    const record = await this.dataverse.getById<DataverseCmsContent>(
      CONTENT_ENTITY,
      id,
      { select: FULL_SELECT_FIELDS as string[] },
      { correlationId },
    );
    return mapToContent(record);
  }

  /**
   * Creates a new content record in Dataverse with status=draft.
   * Also writes an initial revision snapshot immediately after creation.
   *
   * @param body - Validated create body
   * @param savedBy - Display name of the user performing the action
   * @param correlationId - Request correlation ID
   */
  async create(
    body: CreateCmsContentBody,
    savedBy: string,
    correlationId?: string,
  ): Promise<CmsContent> {
    const dvBody = buildCreatePayload(body);
    const created = await this.dataverse.create<DataverseCmsContent>(
      CONTENT_ENTITY,
      dvBody,
      { correlationId },
    );

    await this.saveRevision(created.qdb_cms_contentid, created.qdb_body_html, created.qdb_body_html_ar, savedBy, correlationId);

    return mapToContent(created);
  }

  /**
   * Updates a content record in Dataverse.
   * Saves a revision snapshot of the existing body values BEFORE applying the update.
   *
   * @param id - GUID of the content record to update
   * @param body - Validated partial update body (slug cannot be changed)
   * @param savedBy - Display name of the user performing the action
   * @param correlationId - Request correlation ID
   */
  async update(
    id: string,
    body: UpdateCmsContentBody,
    savedBy: string,
    correlationId?: string,
  ): Promise<CmsContent> {
    const existing = await this.getById(id, correlationId);
    await this.saveRevision(id, existing.bodyHtml, existing.bodyHtmlAr, savedBy, correlationId);

    const dvPatch = buildUpdatePayload(body);
    await this.dataverse.update(CONTENT_ENTITY, id, dvPatch, { correlationId });

    return this.getById(id, correlationId);
  }

  /**
   * Publishes a content record: sets status=published and publishedOn=now.
   *
   * @param id - GUID of the content record to publish
   * @param correlationId - Request correlation ID
   */
  async publish(id: string, correlationId?: string): Promise<void> {
    await this.dataverse.update(
      CONTENT_ENTITY,
      id,
      {
        qdb_status: STATUS_REVERSE.published,
        qdb_published_on: new Date().toISOString(),
      },
      { correlationId },
    );
  }

  /**
   * Unpublishes a content record: sets status=draft and clears publishedOn.
   *
   * @param id - GUID of the content record to unpublish
   * @param correlationId - Request correlation ID
   */
  async unpublish(id: string, correlationId?: string): Promise<void> {
    await this.dataverse.update(
      CONTENT_ENTITY,
      id,
      {
        qdb_status: STATUS_REVERSE.draft,
        qdb_published_on: null,
      },
      { correlationId },
    );
  }

  /**
   * Hard-deletes a content record from Dataverse.
   *
   * @param id - GUID of the content record to delete
   * @param correlationId - Request correlation ID
   */
  async delete(id: string, correlationId?: string): Promise<void> {
    await this.dataverse.delete(CONTENT_ENTITY, id, { correlationId });
  }

  /**
   * Returns all revision snapshots for a content record, ordered newest first.
   *
   * @param contentId - GUID of the parent content record
   * @param correlationId - Request correlation ID
   */
  async listRevisions(contentId: string, correlationId?: string): Promise<CmsRevision[]> {
    const result = await this.dataverse.getList<DataverseCmsRevision>(
      REVISION_ENTITY,
      {
        select: REVISION_SELECT_FIELDS as string[],
        filter: `_qdb_content_id_value eq ${contentId}`,
        orderBy: 'createdon desc',
      },
      { correlationId },
    );

    return result.value.map(mapToRevision);
  }

  /**
   * Returns distinct tags from all published content records.
   * Parses the comma-separated qdb_tags fields and deduplicates.
   *
   * @param correlationId - Request correlation ID
   */
  async listPublishedTags(correlationId?: string): Promise<string[]> {
    const result = await this.dataverse.getList<Pick<DataverseCmsContent, 'qdb_tags'>>(
      CONTENT_ENTITY,
      {
        select: ['qdb_tags'],
        filter: `qdb_status eq ${PUBLISHED_STATUS_CODE} and qdb_tags ne null`,
      },
      { correlationId },
    );

    return extractDistinctTags(result.value.map((r) => r.qdb_tags));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async saveRevision(
    contentId: string,
    bodyHtml: string,
    bodyHtmlAr: string,
    savedBy: string,
    correlationId?: string,
  ): Promise<void> {
    await this.dataverse.create(
      REVISION_ENTITY,
      {
        'qdb_content_id@odata.bind': `/${CONTENT_ENTITY}(${contentId})`,
        qdb_body_html: bodyHtml,
        qdb_body_html_ar: bodyHtmlAr,
        qdb_saved_by: savedBy,
      },
      { correlationId },
    );
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers — pure functions with no side effects
// ---------------------------------------------------------------------------

function mapToSummary(record: DataverseCmsContent): CmsSummary {
  return {
    id: record.qdb_cms_contentid,
    slug: record.qdb_slug,
    title: record.qdb_title,
    titleAr: record.qdb_title_ar,
    contentType: CONTENT_TYPE_MAP[record.qdb_content_type] ?? 'blog',
    excerpt: record.qdb_excerpt ?? '',
    excerptAr: record.qdb_excerpt_ar ?? '',
    coverImageUrl: record.qdb_cover_image_url ?? null,
    status: STATUS_MAP[record.qdb_status] ?? 'draft',
    publishedOn: record.qdb_published_on ?? null,
    authorName: record.qdb_author_name ?? '',
    tags: parseTags(record.qdb_tags),
    createdOn: record.createdon,
  };
}

function mapToContent(record: DataverseCmsContent): CmsContent {
  return {
    ...mapToSummary(record),
    bodyHtml: record.qdb_body_html ?? '',
    bodyHtmlAr: record.qdb_body_html_ar ?? '',
    metaDescription: record.qdb_meta_description ?? '',
    modifiedOn: record.modifiedon,
  };
}

function mapToRevision(record: DataverseCmsRevision): CmsRevision {
  return {
    id: record.qdb_cms_revisionid,
    contentId: record['_qdb_content_id_value'],
    bodyHtml: record.qdb_body_html ?? '',
    bodyHtmlAr: record.qdb_body_html_ar ?? '',
    savedBy: record.qdb_saved_by ?? '',
    savedOn: record.createdon,
  };
}

// ---------------------------------------------------------------------------
// OData filter builders
// ---------------------------------------------------------------------------

function buildPublishedFilter(query: CmsListQuery): string {
  const parts: string[] = [`qdb_status eq ${PUBLISHED_STATUS_CODE}`];

  if (query.type !== undefined) {
    parts.push(`qdb_content_type eq ${CONTENT_TYPE_REVERSE[query.type]}`);
  }

  if (query.tag !== undefined) {
    parts.push(`contains(qdb_tags, '${escapeODataString(query.tag)}')`);
  }

  return parts.join(' and ');
}

function buildAdminFilter(query: AdminCmsListQuery): string {
  const parts: string[] = [];

  if (query.status !== undefined) {
    parts.push(`qdb_status eq ${STATUS_REVERSE[query.status]}`);
  }

  if (query.type !== undefined) {
    parts.push(`qdb_content_type eq ${CONTENT_TYPE_REVERSE[query.type]}`);
  }

  if (query.tag !== undefined) {
    parts.push(`contains(qdb_tags, '${escapeODataString(query.tag)}')`);
  }

  return parts.length > 0 ? parts.join(' and ') : 'statecode eq 0';
}

// ---------------------------------------------------------------------------
// Payload builders — maps domain fields to Dataverse logical names
// ---------------------------------------------------------------------------

function buildCreatePayload(body: CreateCmsContentBody): Record<string, unknown> {
  return {
    qdb_slug: body.slug,
    qdb_title: body.title,
    qdb_title_ar: body.titleAr,
    qdb_content_type: CONTENT_TYPE_REVERSE[body.contentType],
    qdb_body_html: body.bodyHtml,
    qdb_body_html_ar: body.bodyHtmlAr,
    qdb_excerpt: body.excerpt,
    qdb_excerpt_ar: body.excerptAr,
    qdb_cover_image_url: body.coverImageUrl,
    qdb_status: STATUS_REVERSE.draft,
    qdb_author_name: body.authorName,
    qdb_tags: body.tags.join(','),
    qdb_meta_description: body.metaDescription,
  };
}

function buildUpdatePayload(body: UpdateCmsContentBody): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) patch['qdb_title'] = body.title;
  if (body.titleAr !== undefined) patch['qdb_title_ar'] = body.titleAr;
  if (body.contentType !== undefined) patch['qdb_content_type'] = CONTENT_TYPE_REVERSE[body.contentType];
  if (body.bodyHtml !== undefined) patch['qdb_body_html'] = body.bodyHtml;
  if (body.bodyHtmlAr !== undefined) patch['qdb_body_html_ar'] = body.bodyHtmlAr;
  if (body.excerpt !== undefined) patch['qdb_excerpt'] = body.excerpt;
  if (body.excerptAr !== undefined) patch['qdb_excerpt_ar'] = body.excerptAr;
  if (body.coverImageUrl !== undefined) patch['qdb_cover_image_url'] = body.coverImageUrl;
  if (body.authorName !== undefined) patch['qdb_author_name'] = body.authorName;
  if (body.tags !== undefined) patch['qdb_tags'] = body.tags.join(',');
  if (body.metaDescription !== undefined) patch['qdb_meta_description'] = body.metaDescription;

  return patch;
}

// ---------------------------------------------------------------------------
// Pure utility helpers
// ---------------------------------------------------------------------------

/** Parses a comma-separated tag string into a trimmed, non-empty string array. */
function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/** Collects all unique tags from a list of nullable raw tag strings. */
function extractDistinctTags(rawValues: (string | null | undefined)[]): string[] {
  const tagSet = new Set<string>();
  for (const raw of rawValues) {
    for (const tag of parseTags(raw)) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}

/** Escapes single quotes in OData string literals to prevent injection. */
function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}
