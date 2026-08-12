/**
 * Every call the editor makes into Dataverse.
 *
 * Kept in one module because the boundary matters: a web resource runs in an
 * iframe and reaches the platform through the parent window's Xrm. Nothing else
 * in the editor should know that.
 */

const PAGE_SET = 'msst_cmspages';

export type PageStatus = 'Draft' | 'In Review' | 'Published' | 'Unpublished';

const STATUS_BY_VALUE: Record<number, PageStatus> = {
  100000000: 'Draft',
  100000001: 'In Review',
  100000002: 'Published',
  100000003: 'Unpublished',
};

const STATUS_DRAFT = 100000000;
const CLASSIFICATION_STANDARD = 100000000;
const SITE_LIVE = 100000001;

export interface SiteSummary {
  id: string;
  key: string;
  nameEn: string;
  hostName: string;
}

export interface PageSummary {
  id: string;
  slug: string;
  titleEn: string;
  titleAr: string;
  status: PageStatus;
  siteId: string | null;
}

export interface PageVersion {
  versionNumber: number;
  content: unknown;
}

interface XrmLike {
  WebApi: {
    retrieveMultipleRecords(entity: string, options: string): Promise<{ entities: any[] }>;
    createRecord(entity: string, record: object): Promise<{ id: string }>;
    online: { execute(request: object): Promise<Response> };
  };
}

/**
 * A web resource is framed, so Xrm lives on the parent. Resolved on each call
 * rather than cached, because the frame can be re-pointed with a cache-buster
 * and a stale reference survives the reload.
 */
function xrm(): XrmLike {
  const found = (window as any).Xrm ?? (window.parent as any)?.Xrm;
  if (!found?.WebApi) {
    throw new Error(
      'Xrm is unavailable. Open this through main.aspx?pagetype=webresource, not the raw /WebResources/ URL.',
    );
  }
  return found as XrmLike;
}

/**
 * Architecture §7 states that no browser decompresses anything, and closed the
 * `CompressionStream` browser-baseline question on that basis. **That is true of
 * published content and false here.** The editor loads *drafts*, and there is no
 * message for reading a draft — `msst_CmsGetPublishedPageJson` reads the render
 * cache, which by definition holds only published pages.
 *
 * So the dependency is real for the authoring path and the baseline needs
 * stating: Chrome/Edge 80+, Firefox 113+, Safari 16.4+. Checked once, loudly,
 * rather than failing later inside a save.
 */
function requireCompressionSupport(): void {
  if (typeof CompressionStream === 'undefined' || typeof DecompressionStream === 'undefined') {
    throw new Error(
      'This browser cannot compress page content (CompressionStream is unavailable). ' +
        'The editor needs Chrome or Edge 80+, Firefox 113+, or Safari 16.4+.',
    );
  }
}

/** gzip + Base64, the stored form from ADR-CMS-001. */
async function encode(json: string): Promise<string> {
  requireCompressionSupport();
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function decode(stored: string): Promise<string> {
  requireCompressionSupport();
  const binary = atob(stored);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function listSites(): Promise<SiteSummary[]> {
  const result = await xrm().WebApi.retrieveMultipleRecords(
    'msst_cmssite',
    '?$select=msst_cmssiteid,msst_sitekey,msst_sitenameen,msst_hostname&$orderby=msst_sitekey',
  );
  return result.entities.map((row) => ({
    id: row.msst_cmssiteid,
    key: row.msst_sitekey,
    nameEn: row.msst_sitenameen ?? row.msst_sitekey,
    hostName: row.msst_hostname ?? '',
  }));
}

export async function createSite(key: string, nameEn: string, hostName: string): Promise<string> {
  const created = await xrm().WebApi.createRecord('msst_cmssite', {
    msst_sitekey: key,
    msst_sitenameen: nameEn,
    msst_hostname: hostName,
    msst_defaultlocale: 'en',
    msst_locales: 'en,ar',
    msst_sitestatus: SITE_LIVE,
  });
  return created.id;
}

export async function listPages(siteId: string): Promise<PageSummary[]> {
  const result = await xrm().WebApi.retrieveMultipleRecords(
    'msst_cmspage',
    '?$select=msst_cmspageid,msst_slug,msst_titleen,msst_titlear,msst_status' +
      `&$filter=_msst_siteid_value eq ${siteId}&$orderby=msst_slug`,
  );
  return result.entities.map((row) => ({
    id: row.msst_cmspageid,
    slug: row.msst_slug,
    titleEn: row.msst_titleen ?? '',
    titleAr: row.msst_titlear ?? '',
    status: STATUS_BY_VALUE[row.msst_status] ?? 'Draft',
    siteId,
  }));
}

/**
 * A page is always created into a site. The render cache is keyed by site and
 * slug, so a page with no portal cannot be published — better to require the
 * site here than to fail later inside publish.
 */
export async function createPage(
  siteId: string,
  slug: string,
  titleEn: string,
  titleAr: string,
): Promise<string> {
  const created = await xrm().WebApi.createRecord('msst_cmspage', {
    msst_slug: slug,
    msst_titleen: titleEn,
    msst_titlear: titleAr,
    msst_status: STATUS_DRAFT,
    msst_classification: CLASSIFICATION_STANDARD,
    'msst_siteid@odata.bind': `/msst_cmssites(${siteId})`,
  });
  return created.id;
}

/**
 * Reads the latest version. The column list is explicit — a Memo column comes
 * back with the record otherwise, and these carry the whole page (AC-08.2).
 */
export async function loadLatestVersion(pageId: string): Promise<PageVersion | null> {
  const result = await xrm().WebApi.retrieveMultipleRecords(
    'msst_cmspageversion',
    `?$select=msst_versionnumber,msst_contentjson&$filter=_msst_pageid_value eq ${pageId}` +
      '&$orderby=msst_versionnumber desc&$top=1',
  );
  const row = result.entities[0];
  if (!row) return null;
  return {
    versionNumber: row.msst_versionnumber,
    content: JSON.parse(await decode(row.msst_contentjson)),
  };
}

/** Every save is a new version. No version is ever edited in place (FR-62). */
export async function saveVersion(pageId: string, slug: string, content: unknown): Promise<number> {
  const latest = await loadLatestVersion(pageId);
  const versionNumber = (latest?.versionNumber ?? 0) + 1;

  await xrm().WebApi.createRecord('msst_cmspageversion', {
    msst_versionlabel: `${slug} v${versionNumber}`,
    msst_versionnumber: versionNumber,
    msst_contentjson: await encode(JSON.stringify(content)),
    msst_islatest: true,
    msst_schemaversion: '1.0',
    'msst_pageid@odata.bind': `/${PAGE_SET}(${pageId})`,
  });

  return versionNumber;
}

export interface PublishResult {
  versionNumber: number;
  message: string;
}

export async function publishPage(pageId: string, comment: string): Promise<PublishResult> {
  const response = await xrm().WebApi.online.execute({
    PageId: pageId,
    Comment: comment,
    getMetadata: () => ({
      boundParameter: null,
      operationType: 0,
      operationName: 'msst_CmsPublishPage',
      parameterTypes: {
        PageId: { typeName: 'Edm.Guid', structuralProperty: 1 },
        Comment: { typeName: 'Edm.String', structuralProperty: 1 },
      },
    }),
  });

  const body = await response.json();
  return { versionNumber: body.PublishedVersionNumber, message: body.Message };
}
