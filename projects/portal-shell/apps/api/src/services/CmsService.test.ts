// RED → GREEN → REFACTOR — CmsService unit tests
//
// Tests use a vi.fn() mock of DataverseClient so no real Dataverse calls are made.
// Each describe block tests one public method; each it() verifies one behaviour.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CmsService } from './CmsService.js';
import { DataverseNotFoundError } from '@portal/dataverse-client';
import type { DataverseClient } from '@portal/dataverse-client';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeDvContent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    qdb_cms_contentid: 'aaaaaaaa-0000-0000-0000-000000000001',
    qdb_slug: 'hello-world',
    qdb_title: 'Hello World',
    qdb_title_ar: 'مرحبا بالعالم',
    qdb_content_type: 100000001, // blog
    qdb_body_html: '<p>Hello</p>',
    qdb_body_html_ar: '<p>مرحبا</p>',
    qdb_excerpt: 'A short excerpt',
    qdb_excerpt_ar: 'ملخص قصير',
    qdb_cover_image_url: null,
    qdb_status: 100000002, // published
    qdb_published_on: '2025-01-01T00:00:00Z',
    qdb_author_name: 'Jane Doe',
    qdb_tags: 'tech,news',
    qdb_meta_description: 'SEO meta',
    createdon: '2025-01-01T00:00:00Z',
    modifiedon: '2025-01-02T00:00:00Z',
    ...overrides,
  };
}

function makeMockDataverse(overrides: Partial<Record<keyof DataverseClient, unknown>> = {}): DataverseClient {
  return {
    getList: vi.fn().mockResolvedValue({ value: [] }),
    getById: vi.fn(),
    create: vi.fn().mockResolvedValue(makeDvContent()),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    executeAction: vi.fn(),
    ...overrides,
  } as unknown as DataverseClient;
}

// ---------------------------------------------------------------------------
// CmsService.listPublished
// ---------------------------------------------------------------------------

describe('CmsService.listPublished', () => {
  it('should_return_summary_items_with_correct_field_mapping', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [makeDvContent()], '@odata.count': 1 }),
    });
    const service = new CmsService(dvMock);

    const { items, total } = await service.listPublished({ page: 1, pageSize: 12 });

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    expect(items[0]?.slug).toBe('hello-world');
    expect(items[0]?.contentType).toBe('blog');
    expect(items[0]?.status).toBe('published');
    expect(items[0]?.tags).toEqual(['tech', 'news']);
    expect(total).toBe(1);
  });

  it('should_apply_published_status_filter_in_odata_query', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const service = new CmsService(dvMock);

    await service.listPublished({ page: 1, pageSize: 12 });

    const [, queryOptions] = (dvMock.getList as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(queryOptions.filter).toContain('qdb_status eq 100000002');
  });

  it('should_apply_content_type_filter_when_type_query_param_is_provided', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const service = new CmsService(dvMock);

    await service.listPublished({ page: 1, pageSize: 12, type: 'news' });

    const [, queryOptions] = (dvMock.getList as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(queryOptions.filter).toContain('qdb_content_type eq 100000002');
  });

  it('should_apply_tag_contains_filter_when_tag_query_param_is_provided', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const service = new CmsService(dvMock);

    await service.listPublished({ page: 1, pageSize: 12, tag: 'tech' });

    const [, queryOptions] = (dvMock.getList as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(queryOptions.filter).toContain("contains(qdb_tags, 'tech')");
  });

  it('should_calculate_skip_correctly_for_pagination', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const service = new CmsService(dvMock);

    await service.listPublished({ page: 3, pageSize: 10 });

    const [, queryOptions] = (dvMock.getList as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(queryOptions.skip).toBe(20);
    expect(queryOptions.top).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// CmsService.getBySlug
// ---------------------------------------------------------------------------

describe('CmsService.getBySlug', () => {
  it('should_return_full_content_with_body_html_when_slug_matches_published_record', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [makeDvContent()] }),
    });
    const service = new CmsService(dvMock);

    const content = await service.getBySlug('hello-world');

    expect(content.slug).toBe('hello-world');
    expect(content.bodyHtml).toBe('<p>Hello</p>');
    expect(content.bodyHtmlAr).toBe('<p>مرحبا</p>');
    expect(content.metaDescription).toBe('SEO meta');
    expect(content.modifiedOn).toBe('2025-01-02T00:00:00Z');
  });

  it('should_throw_DataverseNotFoundError_when_slug_does_not_exist_or_is_not_published', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const service = new CmsService(dvMock);

    await expect(service.getBySlug('no-such-slug')).rejects.toBeInstanceOf(DataverseNotFoundError);
  });

  it('should_include_published_status_filter_in_odata_query', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [makeDvContent()] }),
    });
    const service = new CmsService(dvMock);

    await service.getBySlug('hello-world');

    const [, queryOptions] = (dvMock.getList as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(queryOptions.filter).toContain('qdb_status eq 100000002');
    expect(queryOptions.filter).toContain("qdb_slug eq 'hello-world'");
  });
});

// ---------------------------------------------------------------------------
// CmsService.create
// ---------------------------------------------------------------------------

describe('CmsService.create', () => {
  it('should_create_content_with_draft_status_and_save_initial_revision', async () => {
    const createdRecord = makeDvContent({ qdb_status: 100000001 }); // draft
    const dvMock = makeMockDataverse({
      create: vi.fn().mockResolvedValue(createdRecord),
    });
    const service = new CmsService(dvMock);

    const result = await service.create(
      {
        slug: 'new-post',
        title: 'New Post',
        titleAr: 'مقالة جديدة',
        contentType: 'blog',
        bodyHtml: '<p>Body</p>',
        bodyHtmlAr: '<p>نص</p>',
        excerpt: '',
        excerptAr: '',
        coverImageUrl: null,
        authorName: 'Jane',
        tags: [],
        metaDescription: '',
      },
      'Jane Doe',
    );

    // Should have created the content record AND a revision record
    expect(dvMock.create).toHaveBeenCalledTimes(2);

    // First call: content record
    const [firstEntity, firstBody] = (dvMock.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(firstEntity).toBe('qdb_cms_contents');
    expect(firstBody['qdb_status']).toBe(100000001); // draft

    // Second call: revision record
    const [secondEntity, secondBody] = (dvMock.create as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondEntity).toBe('qdb_cms_revisions');
    expect(secondBody['qdb_saved_by']).toBe('Jane Doe');

    expect(result.status).toBe('draft');
  });

  it('should_serialise_tags_array_to_comma_separated_string', async () => {
    const dvMock = makeMockDataverse({
      create: vi.fn().mockResolvedValue(makeDvContent({ qdb_tags: 'alpha,beta' })),
    });
    const service = new CmsService(dvMock);

    await service.create(
      {
        slug: 'tagged',
        title: 'Tagged',
        titleAr: '',
        contentType: 'blog',
        bodyHtml: '',
        bodyHtmlAr: '',
        excerpt: '',
        excerptAr: '',
        coverImageUrl: null,
        authorName: 'Admin',
        tags: ['alpha', 'beta'],
        metaDescription: '',
      },
      'Admin',
    );

    const [, contentBody] = (dvMock.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(contentBody['qdb_tags']).toBe('alpha,beta');
  });
});

// ---------------------------------------------------------------------------
// CmsService.update
// ---------------------------------------------------------------------------

describe('CmsService.update', () => {
  it('should_save_revision_snapshot_before_applying_update', async () => {
    const dvMock = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(makeDvContent()),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue(undefined),
    });
    // getById is called twice: once for snapshot, once to return updated record
    (dvMock.getById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeDvContent())
      .mockResolvedValueOnce(makeDvContent({ qdb_title: 'Updated' }));

    const service = new CmsService(dvMock);

    await service.update(
      'aaaaaaaa-0000-0000-0000-000000000001',
      { title: 'Updated' },
      'Admin User',
    );

    // Revision should have been created before the update was applied
    expect(dvMock.create).toHaveBeenCalledTimes(1);
    const [revisionEntity, revisionBody] = (dvMock.create as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(revisionEntity).toBe('qdb_cms_revisions');
    expect(revisionBody['qdb_body_html']).toBe('<p>Hello</p>');
    expect(revisionBody['qdb_saved_by']).toBe('Admin User');

    expect(dvMock.update).toHaveBeenCalledTimes(1);
    const [, id, patch] = (dvMock.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe('aaaaaaaa-0000-0000-0000-000000000001');
    expect(patch['qdb_title']).toBe('Updated');
  });

  it('should_not_include_slug_in_update_payload', async () => {
    const dvMock = makeMockDataverse({
      getById: vi.fn().mockResolvedValue(makeDvContent()),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue(undefined),
    });

    const service = new CmsService(dvMock);

    await service.update(
      'aaaaaaaa-0000-0000-0000-000000000001',
      { title: 'No Slug Change' },
      'Admin',
    );

    const [, , patch] = (dvMock.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch).not.toHaveProperty('qdb_slug');
  });
});

// ---------------------------------------------------------------------------
// CmsService.publish / unpublish
// ---------------------------------------------------------------------------

describe('CmsService.publish', () => {
  it('should_set_status_to_published_and_set_published_on_to_current_time', async () => {
    const dvMock = makeMockDataverse();
    const service = new CmsService(dvMock);

    const before = new Date();
    await service.publish('aaaaaaaa-0000-0000-0000-000000000001');
    const after = new Date();

    expect(dvMock.update).toHaveBeenCalledTimes(1);
    const [, , patch] = (dvMock.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch['qdb_status']).toBe(100000002); // published
    const publishedOn = new Date(patch['qdb_published_on'] as string);
    expect(publishedOn.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(publishedOn.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe('CmsService.unpublish', () => {
  it('should_set_status_to_draft_and_clear_published_on', async () => {
    const dvMock = makeMockDataverse();
    const service = new CmsService(dvMock);

    await service.unpublish('aaaaaaaa-0000-0000-0000-000000000001');

    expect(dvMock.update).toHaveBeenCalledTimes(1);
    const [, , patch] = (dvMock.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(patch['qdb_status']).toBe(100000001); // draft
    expect(patch['qdb_published_on']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CmsService.delete
// ---------------------------------------------------------------------------

describe('CmsService.delete', () => {
  it('should_call_dataverse_delete_with_correct_entity_and_id', async () => {
    const dvMock = makeMockDataverse();
    const service = new CmsService(dvMock);

    await service.delete('aaaaaaaa-0000-0000-0000-000000000001');

    expect(dvMock.delete).toHaveBeenCalledWith(
      'qdb_cms_contents',
      'aaaaaaaa-0000-0000-0000-000000000001',
      {},
    );
  });
});

// ---------------------------------------------------------------------------
// CmsService.listRevisions
// ---------------------------------------------------------------------------

describe('CmsService.listRevisions', () => {
  it('should_return_revisions_mapped_to_CmsRevision_interface', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({
        value: [
          {
            qdb_cms_revisionid: 'rev-001',
            '_qdb_content_id_value': 'aaaaaaaa-0000-0000-0000-000000000001',
            qdb_body_html: '<p>Old body</p>',
            qdb_body_html_ar: '<p>نص قديم</p>',
            qdb_saved_by: 'Jane Doe',
            createdon: '2025-06-10T10:00:00Z',
          },
        ],
      }),
    });
    const service = new CmsService(dvMock);

    const revisions = await service.listRevisions('aaaaaaaa-0000-0000-0000-000000000001');

    expect(revisions).toHaveLength(1);
    expect(revisions[0]?.id).toBe('rev-001');
    expect(revisions[0]?.savedBy).toBe('Jane Doe');
    expect(revisions[0]?.savedOn).toBe('2025-06-10T10:00:00Z');
  });
});

// ---------------------------------------------------------------------------
// CmsService.listPublishedTags
// ---------------------------------------------------------------------------

describe('CmsService.listPublishedTags', () => {
  it('should_return_sorted_distinct_tags_from_all_published_records', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({
        value: [
          { qdb_tags: 'tech, news' },
          { qdb_tags: 'tech,featured' },
          { qdb_tags: null },
        ],
      }),
    });
    const service = new CmsService(dvMock);

    const tags = await service.listPublishedTags();

    expect(tags).toEqual(['featured', 'news', 'tech']); // sorted, deduplicated
  });

  it('should_return_empty_array_when_no_published_content_has_tags', async () => {
    const dvMock = makeMockDataverse({
      getList: vi.fn().mockResolvedValue({ value: [] }),
    });
    const service = new CmsService(dvMock);

    const tags = await service.listPublishedTags();

    expect(tags).toEqual([]);
  });
});
