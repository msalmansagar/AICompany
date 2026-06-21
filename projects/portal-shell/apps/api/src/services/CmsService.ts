/**
 * CmsService — Dataverse data access for Track C (CMS).
 *
 * Actual Dataverse attribute logical names are derived from SchemaName by lowercasing.
 * Dataverse ignores explicit LogicalName values in attribute creation payloads, so
 * multi-word PascalCase SchemaNames like qdb_BodyHtml become qdb_bodyhtml (no underscores).
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
// Entity set names (logical name ends in 's' → Dataverse appends 'es')
// ---------------------------------------------------------------------------

const CONTENT_ENTITY = 'qdb_cms_contentses';
const REVISION_ENTITY = 'qdb_cms_revisionses';

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
// Dataverse record shapes — actual logical names (SchemaName.toLowerCase())
// ---------------------------------------------------------------------------

interface DataverseCmsContent {
  qdb_cms_contentsid: string;
  qdb_slug: string;
  qdb_title: string;
  qdb_titlear: string;
  qdb_contenttype: number;
  qdb_bodyhtml: string;
  qdb_bodyhtmlar: string;
  qdb_excerpt: string;
  qdb_excerptar: string;
  qdb_coverimageurl: string | null;
  qdb_status: number;
  qdb_publishedon: string | null;
  qdb_authorname: string;
  qdb_tags: string | null;
  qdb_metadescription: string;
  createdon: string;
  modifiedon: string;
}

interface DataverseCmsRevision {
  qdb_cms_revisionsid: string;
  '_qdb_contentid_value': string; // qdb_ContentId → qdb_contentid → _qdb_contentid_value
  qdb_bodyhtml: string;
  qdb_bodyhtmlar: string;
  qdb_savedby: string;
  createdon: string;
}

// ---------------------------------------------------------------------------
// Field selection lists
// ---------------------------------------------------------------------------

const SUMMARY_SELECT_FIELDS: (keyof DataverseCmsContent)[] = [
  'qdb_cms_contentsid',
  'qdb_slug',
  'qdb_title',
  'qdb_titlear',
  'qdb_contenttype',
  'qdb_excerpt',
  'qdb_excerptar',
  'qdb_coverimageurl',
  'qdb_status',
  'qdb_publishedon',
  'qdb_authorname',
  'qdb_tags',
  'createdon',
];

const FULL_SELECT_FIELDS: (keyof DataverseCmsContent)[] = [
  ...SUMMARY_SELECT_FIELDS,
  'qdb_bodyhtml',
  'qdb_bodyhtmlar',
  'qdb_metadescription',
  'modifiedon',
];

const REVISION_SELECT_FIELDS: (keyof DataverseCmsRevision)[] = [
  'qdb_cms_revisionsid',
  '_qdb_contentid_value',
  'qdb_bodyhtml',
  'qdb_bodyhtmlar',
  'qdb_savedby',
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
   * Ordered by qdb_publishedon descending.
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
        orderBy: 'qdb_publishedon desc',
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

    await this.saveRevision(created.qdb_cms_contentsid, created.qdb_bodyhtml, created.qdb_bodyhtmlar, savedBy, correlationId);

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
   * Publishes a content record: sets status=published and publishedon=now.
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
        qdb_publishedon: new Date().toISOString(),
      },
      { correlationId },
    );
  }

  /**
   * Unpublishes a content record: sets status=draft and clears publishedon.
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
        qdb_publishedon: null,
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
        filter: `_qdb_contentid_value eq ${contentId}`,
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

  private static readonly MAX_REVISIONS = 10;

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
        'qdb_contentid@odata.bind': `/${CONTENT_ENTITY}(${contentId})`,
        qdb_bodyhtml: bodyHtml,
        qdb_bodyhtmlar: bodyHtmlAr,
        qdb_savedby: savedBy,
      },
      { correlationId },
    );
    await this.pruneRevisions(contentId, correlationId);
  }

  /**
   * Enforces the FIFO revision cap: deletes the oldest revisions when the
   * total count for a content record exceeds MAX_REVISIONS.
   *
   * Fetches revision IDs ordered oldest-first so that slice(0, excess)
   * targets the correct records for deletion.
   */
  private async pruneRevisions(contentId: string, correlationId?: string): Promise<void> {
    const result = await this.dataverse.getList<{ qdb_cms_revisionsid: string }>(
      REVISION_ENTITY,
      {
        select: ['qdb_cms_revisionsid'],
        filter: `_qdb_contentid_value eq ${contentId}`,
        orderBy: 'createdon asc',
      },
      { correlationId },
    );

    const excess = result.value.length - CmsService.MAX_REVISIONS;
    if (excess <= 0) return;

    await Promise.all(
      result.value.slice(0, excess).map((r) =>
        this.dataverse.delete(REVISION_ENTITY, r.qdb_cms_revisionsid, { correlationId }),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers — pure functions with no side effects
// ---------------------------------------------------------------------------

function mapToSummary(record: DataverseCmsContent): CmsSummary {
  return {
    id: record.qdb_cms_contentsid,
    slug: record.qdb_slug,
    title: record.qdb_title,
    titleAr: record.qdb_titlear,
    contentType: CONTENT_TYPE_MAP[record.qdb_contenttype] ?? 'blog',
    excerpt: record.qdb_excerpt ?? '',
    excerptAr: record.qdb_excerptar ?? '',
    coverImageUrl: record.qdb_coverimageurl ?? null,
    status: STATUS_MAP[record.qdb_status] ?? 'draft',
    publishedOn: record.qdb_publishedon ?? null,
    authorName: record.qdb_authorname ?? '',
    tags: parseTags(record.qdb_tags),
    createdOn: record.createdon,
  };
}

function mapToContent(record: DataverseCmsContent): CmsContent {
  return {
    ...mapToSummary(record),
    bodyHtml: record.qdb_bodyhtml ?? '',
    bodyHtmlAr: record.qdb_bodyhtmlar ?? '',
    metaDescription: record.qdb_metadescription ?? '',
    modifiedOn: record.modifiedon,
  };
}

function mapToRevision(record: DataverseCmsRevision): CmsRevision {
  return {
    id: record.qdb_cms_revisionsid,
    contentId: record['_qdb_contentid_value'],
    bodyHtml: record.qdb_bodyhtml ?? '',
    bodyHtmlAr: record.qdb_bodyhtmlar ?? '',
    savedBy: record.qdb_savedby ?? '',
    savedOn: record.createdon,
  };
}

// ---------------------------------------------------------------------------
// OData filter builders
// ---------------------------------------------------------------------------

function buildPublishedFilter(query: CmsListQuery): string {
  const parts: string[] = [`qdb_status eq ${PUBLISHED_STATUS_CODE}`];

  if (query.type !== undefined) {
    parts.push(`qdb_contenttype eq ${CONTENT_TYPE_REVERSE[query.type]}`);
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
    parts.push(`qdb_contenttype eq ${CONTENT_TYPE_REVERSE[query.type]}`);
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
    qdb_titlear: body.titleAr,
    qdb_contenttype: CONTENT_TYPE_REVERSE[body.contentType],
    qdb_bodyhtml: body.bodyHtml,
    qdb_bodyhtmlar: body.bodyHtmlAr,
    qdb_excerpt: body.excerpt,
    qdb_excerptar: body.excerptAr,
    qdb_coverimageurl: body.coverImageUrl,
    qdb_status: STATUS_REVERSE.draft,
    qdb_authorname: body.authorName,
    qdb_tags: body.tags.join(','),
    qdb_metadescription: body.metaDescription,
  };
}

function buildUpdatePayload(body: UpdateCmsContentBody): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) patch['qdb_title'] = body.title;
  if (body.titleAr !== undefined) patch['qdb_titlear'] = body.titleAr;
  if (body.contentType !== undefined) patch['qdb_contenttype'] = CONTENT_TYPE_REVERSE[body.contentType];
  if (body.bodyHtml !== undefined) patch['qdb_bodyhtml'] = body.bodyHtml;
  if (body.bodyHtmlAr !== undefined) patch['qdb_bodyhtmlar'] = body.bodyHtmlAr;
  if (body.excerpt !== undefined) patch['qdb_excerpt'] = body.excerpt;
  if (body.excerptAr !== undefined) patch['qdb_excerptar'] = body.excerptAr;
  if (body.coverImageUrl !== undefined) patch['qdb_coverimageurl'] = body.coverImageUrl;
  if (body.authorName !== undefined) patch['qdb_authorname'] = body.authorName;
  if (body.tags !== undefined) patch['qdb_tags'] = body.tags.join(',');
  if (body.metaDescription !== undefined) patch['qdb_metadescription'] = body.metaDescription;

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
