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
const DECISION_APPROVED = 100000001;

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

export interface VersionSummary {
  id: string;
  versionNumber: number;
  label: string;
  createdOn: string;
}

interface XrmLike {
  WebApi: {
    retrieveMultipleRecords(entity: string, options: string): Promise<{ entities: any[] }>;
    createRecord(entity: string, record: object): Promise<{ id: string }>;
    updateRecord(entity: string, id: string, record: object): Promise<{ id: string }>;
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

/** Every deliberate save is a new version. No published version is ever edited (FR-62). */
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

/**
 * Persists work in progress without creating a version per keystroke.
 *
 * FR-06 wants drafts saved with no explicit action; FR-62 wants every save to
 * create a version that is never edited in place. Taken literally together they
 * produce hundreds of versions per editing session, which makes version history
 * useless for the thing FR-63 needs it for.
 *
 * The reading applied here: **a version becomes immutable once it has been
 * approved or published**, and until then it is the working draft. So an
 * editing session produces one version, not one per pause, and nothing that any
 * approver or visitor has ever seen is altered.
 *
 * Recorded as a decision needing ratification — it is an interpretation of
 * FR-62, not a restatement of it.
 */
export async function saveDraft(pageId: string, slug: string, content: unknown): Promise<number> {
  const latest = await latestVersionRecord(pageId);
  const encoded = await encode(JSON.stringify(content));

  if (latest && !(await isSealed(latest.id))) {
    await xrm().WebApi.updateRecord('msst_cmspageversion', latest.id, {
      msst_contentjson: encoded,
    });
    return latest.versionNumber;
  }

  return saveVersion(pageId, slug, content);
}

/** A version is sealed once an approval decision exists against it. */
async function isSealed(versionId: string): Promise<boolean> {
  const approvals = await xrm().WebApi.retrieveMultipleRecords(
    'msst_cmsapproval',
    `?$select=msst_cmsapprovalid&$filter=_msst_versionid_value eq ${versionId}&$top=1`,
  );
  return approvals.entities.length > 0;
}

async function latestVersionRecord(
  pageId: string,
): Promise<{ id: string; versionNumber: number } | null> {
  const result = await xrm().WebApi.retrieveMultipleRecords(
    'msst_cmspageversion',
    `?$select=msst_cmspageversionid,msst_versionnumber&$filter=_msst_pageid_value eq ${pageId}` +
      '&$orderby=msst_versionnumber desc&$top=1',
  );
  const row = result.entities[0];
  return row ? { id: row.msst_cmspageversionid, versionNumber: row.msst_versionnumber } : null;
}

/** Copies a page and its latest content into a new page (FR-07). */
export async function duplicatePage(
  source: PageSummary,
  siteId: string,
  slug: string,
): Promise<string> {
  const newPageId = await createPage(siteId, slug, `${source.titleEn} (copy)`, source.titleAr);
  const latest = await loadLatestVersion(source.id);
  if (latest) {
    await saveVersion(newPageId, slug, latest.content);
  }
  return newPageId;
}

/**
 * Records an approval decision against the latest version.
 *
 * The route is written onto the row at decision time rather than read from the
 * route table at publish, so editing the route table later cannot retroactively
 * change what a past approval meant (§5).
 */
export async function approveLatestVersion(
  pageId: string,
  slug: string,
  routeKey: 'standard' | 'regulated',
): Promise<number> {
  const result = await xrm().WebApi.retrieveMultipleRecords(
    'msst_cmspageversion',
    `?$select=msst_cmspageversionid,msst_versionnumber&$filter=_msst_pageid_value eq ${pageId}` +
      '&$orderby=msst_versionnumber desc&$top=1',
  );
  const version = result.entities[0];
  if (!version) throw new Error('There is no version to approve. Save the page first.');

  await xrm().WebApi.createRecord('msst_cmsapproval', {
    msst_approvalkey: `${slug} v${version.msst_versionnumber} approval`,
    msst_routekey: routeKey,
    msst_decision: DECISION_APPROVED,
    msst_decidedby: currentUserId(),
    'msst_versionid@odata.bind': `/msst_cmspageversions(${version.msst_cmspageversionid})`,
  });

  return version.msst_versionnumber;
}

function currentUserId(): string {
  const context = (window.parent as any)?.Xrm?.Utility?.getGlobalContext?.();
  const raw = context?.userSettings?.userId ?? '';
  return String(raw).replace(/[{}]/g, '');
}

/**
 * Version history, newest first. The content column is deliberately not
 * selected: a Memo comes back with the record unless the query names its
 * columns, and a history list would otherwise drag every payload with it
 * (AC-08.2).
 */
export async function listVersions(pageId: string): Promise<VersionSummary[]> {
  const result = await xrm().WebApi.retrieveMultipleRecords(
    'msst_cmspageversion',
    '?$select=msst_cmspageversionid,msst_versionnumber,msst_versionlabel,createdon' +
      `&$filter=_msst_pageid_value eq ${pageId}&$orderby=msst_versionnumber desc`,
  );
  return result.entities.map((row) => ({
    id: row.msst_cmspageversionid,
    versionNumber: row.msst_versionnumber,
    label: row.msst_versionlabel ?? '',
    createdOn: row.createdon ?? '',
  }));
}

/**
 * Restores a prior version by copying it forward as a new one (FR-63).
 *
 * History is never deleted, and the restored content is not live until it
 * passes the normal approval route — a new version carries no approval, so the
 * publish gate refuses it until someone approves. Rollback must not become a
 * path around FR-60.
 */
export async function restoreVersion(
  pageId: string,
  slug: string,
  restoreFrom: number,
): Promise<number> {
  const source = await xrm().WebApi.retrieveMultipleRecords(
    'msst_cmspageversion',
    `?$select=msst_contentjson&$filter=_msst_pageid_value eq ${pageId}` +
      ` and msst_versionnumber eq ${restoreFrom}&$top=1`,
  );
  const content = source.entities[0]?.msst_contentjson;
  if (!content) throw new Error(`Version ${restoreFrom} could not be read.`);

  const versions = await listVersions(pageId);
  const versionNumber = (versions[0]?.versionNumber ?? 0) + 1;

  await xrm().WebApi.createRecord('msst_cmspageversion', {
    // Provenance lives in the label because the schema has no field for it.
    msst_versionlabel: `${slug} v${versionNumber} (restored from v${restoreFrom})`,
    msst_versionnumber: versionNumber,
    msst_contentjson: content,
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
