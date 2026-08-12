/**
 * End-to-end proof that the publish pipeline works against the live org.
 *
 * Creates a page and a version, calls msst_CmsPublishPage, then reads the page
 * back through msst_CmsGetPublishedPageJson and checks it round-trips.
 *
 * Also exercises the two rejections that matter, because a gate never seen
 * failing is not known to be a gate:
 *   - a payload containing a data: URI must be refused (FR-14, FR-65)
 *   - a page with no versions must be refused
 *
 * Run:
 *   node --env-file=<path>/.env projects/cms-engine/scripts/e2e-publish-a-page.mjs
 */

import { gzipSync } from 'node:zlib';

const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

const encode = (json) => gzipSync(Buffer.from(json, 'utf8')).toString('base64');

/**
 * Any user id that is not the one running this script. The gate refuses an
 * approver who is also the author, so the two must differ.
 */
const APPROVER_ID = '00000000-0000-0000-0000-0000000000aa';

const DEMO_PAGE = {
  root: { props: { title: { en: 'About Reyada', ar: 'عن ريادة' } } },
  content: [
    {
      type: 'Hero',
      props: {
        heading: { en: 'Supporting Qatari enterprise', ar: 'دعم المؤسسات القطرية' },
        accent: 'brand.primary',
      },
    },
    {
      type: 'RichText',
      props: {
        body: {
          en: '<p>Reyada helps small businesses <strong>grow</strong>.</p>',
          ar: '<p>ريادة تساعد الشركات الصغيرة على <strong>النمو</strong>.</p>',
        },
      },
    },
  ],
  zones: {},
};

async function acquireToken() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.DV_CLIENT_ID,
    client_secret: process.env.DV_CLIENT_SECRET,
    scope: `${DATAVERSE_URL}/.default`,
  });
  const res = await fetch(
    `https://login.microsoftonline.com/${process.env.DV_TENANT_ID}/oauth2/v2.0/token`,
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
  );
  if (!res.ok) throw new Error(`Token request failed ${res.status}`);
  return (await res.json()).access_token;
}

let token;
const hdrs = () => ({
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  'Content-Type': 'application/json',
});

async function send(method, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: hdrs(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    const error = new Error(text);
    error.status = res.status;
    try {
      error.dataverseMessage = JSON.parse(text).error.message;
    } catch {
      error.dataverseMessage = text.slice(0, 300);
    }
    throw error;
  }
  const id = res.headers.get('OData-EntityId');
  return { id: id ? id.match(/\(([^)]+)\)/)?.[1] : null, body: text ? JSON.parse(text) : null };
}

/** The version an approval must be attached to. */
async function latestVersionId(pageId) {
  const found = await send(
    'GET',
    `msst_cmspageversions?$select=msst_cmspageversionid&$filter=_msst_pageid_value eq ${pageId}` +
      '&$orderby=msst_versionnumber desc&$top=1',
  );
  return found.body.value[0].msst_cmspageversionid;
}

/** Approves a version on a route, so a publish is allowed to proceed. */
async function approve(pageId, label, routeKey = 'standard') {
  const versionId = await latestVersionId(pageId);
  await send('POST', 'msst_cmsapprovals', {
    msst_approvalkey: label,
    msst_routekey: routeKey,
    msst_decision: 100000001,
    msst_decidedby: APPROVER_ID,
    'msst_versionid@odata.bind': `/msst_cmspageversions(${versionId})`,
  });
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main() {
  token = await acquireToken();
  const stamp = Date.now();
  const slug = `e2e-about-reyada-${stamp}`;

  console.log(`End-to-end publish against ${DATAVERSE_URL}\n`);

  // ── Happy path ────────────────────────────────────────────────────────────
  console.log('Publishing a page');

  // A page belongs to a site. The render cache is keyed by both, so two portals
  // can each have an "about" page without one overwriting the other.
  const siteKey = `e2e-site-${stamp}`;
  const site = await send('POST', 'msst_cmssites', {
    msst_sitekey: siteKey,
    msst_sitenameen: 'End-to-end portal',
    msst_defaultlocale: 'en',
    msst_locales: 'en,ar',
    msst_sitestatus: 100000001,
  });

  const page = await send('POST', 'msst_cmspages', {
    msst_slug: slug,
    msst_titleen: 'About Reyada',
    msst_titlear: 'عن ريادة',
    msst_status: 100000000,
    msst_classification: 100000000,
    'msst_siteid@odata.bind': `/msst_cmssites(${site.id})`,
  });

  const json = JSON.stringify(DEMO_PAGE);
  await send('POST', 'msst_cmspageversions', {
    msst_versionlabel: `${slug} v1`,
    msst_versionnumber: 1,
    msst_contentjson: encode(json),
    msst_islatest: true,
    msst_schemaversion: '1.0',
    'msst_pageid@odata.bind': `/msst_cmspages(${page.id})`,
  });

  // FR-60: an author cannot publish alone. Prove the gate refuses first, then
  // approve and prove it lets the page through. Testing only the approved path
  // would leave the control unverified.
  try {
    await send('POST', 'msst_CmsPublishPage', { PageId: page.id });
    check('an unapproved page cannot publish', false, 'publish succeeded without approval');
  } catch (error) {
    check(
      'an unapproved page cannot publish',
      /no approval/i.test(error.dataverseMessage),
      error.dataverseMessage.slice(0, 110),
    );
  }

  await approve(page.id, `${slug} v1 approval`);

  const published = await send('POST', 'msst_CmsPublishPage', {
    PageId: page.id,
    Comment: 'end-to-end test',
  });
  check(
    'publish returns the version number',
    published.body?.PublishedVersionNumber === 1,
    `got ${published.body?.PublishedVersionNumber}, message: ${published.body?.Message}`,
  );

  // ── Read it back ──────────────────────────────────────────────────────────
  console.log('\nReading it back');
  const read = await send('POST', 'msst_CmsGetPublishedPageJson', {
    Site: siteKey,
    Slug: slug,
    LanguageCode: 'en',
  });
  const returned = read.body?.PageJson;
  check('round-trips byte-identical', returned === json, returned === json ? '' : 'payload differs');

  // Compare against the source object, not a re-typed literal: two identical
  // looking Arabic strings can differ in codepoint sequence, which makes the
  // test fail for a reason that has nothing to do with the pipeline.
  const parsed = JSON.parse(returned);
  const expectedArabic = DEMO_PAGE.content[0].props.heading.ar;
  check(
    'Arabic survives the round trip',
    parsed.content[0].props.heading.ar === expectedArabic,
    `${parsed.content[0].props.heading.ar}`,
  );
  check('rich text markup survives', parsed.content[1].props.body.en.includes('<strong>'));

  // ── The audit row ─────────────────────────────────────────────────────────
  const log = await send(
    'GET',
    `msst_cmspublishlogs?$select=msst_action,msst_versionnumber&$filter=msst_logkey eq '${siteKey}/${slug} v1'`,
  );
  check('an audit row was written by the plugin', log.body.value.length === 1,
    log.body.value[0]?.msst_action ?? 'none found');

  // ── The gates, proven to fire ─────────────────────────────────────────────
  console.log('\nThe rejections');

  const badSlug = `e2e-datauri-${stamp}`;
  const badPage = await send('POST', 'msst_cmspages', {
    msst_slug: badSlug,
    msst_titleen: 'Inlined binary',
    msst_status: 100000000,
    'msst_siteid@odata.bind': `/msst_cmssites(${site.id})`,
  });
  await send('POST', 'msst_cmspageversions', {
    msst_versionlabel: `${badSlug} v1`,
    msst_versionnumber: 1,
    msst_contentjson: encode(
      JSON.stringify({
        root: {},
        content: [{ type: 'Image', props: { src: 'data:image/png;base64,iVBORw0KGgo=' } }],
        zones: {},
      }),
    ),
    msst_islatest: true,
    'msst_pageid@odata.bind': `/msst_cmspages(${badPage.id})`,
  });
  try {
    await send('POST', 'msst_CmsPublishPage', { PageId: badPage.id });
    check('a data: URI is rejected', false, 'publish succeeded when it should not have');
  } catch (error) {
    check(
      'a data: URI is rejected',
      /inlined/i.test(error.dataverseMessage),
      error.dataverseMessage.slice(0, 120),
    );
  }

  const emptySlug = `e2e-noversions-${stamp}`;
  const emptyPage = await send('POST', 'msst_cmspages', {
    msst_slug: emptySlug,
    msst_titleen: 'No versions',
    msst_status: 100000000,
    'msst_siteid@odata.bind': `/msst_cmssites(${site.id})`,
  });
  try {
    await send('POST', 'msst_CmsPublishPage', { PageId: emptyPage.id });
    check('a page with no versions is rejected', false, 'publish succeeded');
  } catch (error) {
    check(
      'a page with no versions is rejected',
      /no versions/i.test(error.dataverseMessage),
      error.dataverseMessage.slice(0, 120),
    );
  }

  // A page with no portal has no address, so publishing it must be refused
  // rather than defaulted to some guessed route.
  const orphanSlug = `e2e-orphan-${stamp}`;
  const orphanPage = await send('POST', 'msst_cmspages', {
    msst_slug: orphanSlug,
    msst_titleen: 'No site',
    msst_status: 100000000,
  });
  await send('POST', 'msst_cmspageversions', {
    msst_versionlabel: `${orphanSlug} v1`,
    msst_versionnumber: 1,
    msst_contentjson: encode(JSON.stringify({ root: {}, content: [], zones: {} })),
    msst_islatest: true,
    'msst_pageid@odata.bind': `/msst_cmspages(${orphanPage.id})`,
  });
  try {
    await send('POST', 'msst_CmsPublishPage', { PageId: orphanPage.id });
    check('a page with no site is rejected', false, 'publish succeeded');
  } catch (error) {
    check(
      'a page with no site is rejected',
      /does not belong to a site/i.test(error.dataverseMessage),
      error.dataverseMessage.slice(0, 120),
    );
  }

  try {
    await send('POST', 'msst_CmsGetPublishedPageJson', {
      Site: siteKey,
      Slug: 'never-published',
      LanguageCode: 'en',
    });
    check('an unpublished page is not served', false, 'returned content');
  } catch (error) {
    check(
      'an unpublished page is not served',
      /No published content/i.test(error.dataverseMessage),
      error.dataverseMessage.slice(0, 120),
    );
  }

  // Two portals, same slug: proof that the cache key is site-scoped.
  const secondSiteKey = `e2e-site2-${stamp}`;
  const secondSite = await send('POST', 'msst_cmssites', {
    msst_sitekey: secondSiteKey,
    msst_sitenameen: 'Second portal',
    msst_defaultlocale: 'en',
    msst_sitestatus: 100000001,
  });
  const twinPage = await send('POST', 'msst_cmspages', {
    msst_slug: slug,
    msst_titleen: 'Same slug, different portal',
    msst_status: 100000000,
    'msst_siteid@odata.bind': `/msst_cmssites(${secondSite.id})`,
  });
  const twinJson = JSON.stringify({
    root: {},
    content: [{ type: 'Hero', props: { heading: { en: 'Second portal', ar: 'بوابة ثانية' }, accent: 'brand.primary' } }],
    zones: {},
  });
  await send('POST', 'msst_cmspageversions', {
    msst_versionlabel: `${slug} v1 (second)`,
    msst_versionnumber: 1,
    msst_contentjson: encode(twinJson),
    msst_islatest: true,
    'msst_pageid@odata.bind': `/msst_cmspages(${twinPage.id})`,
  });
  await approve(twinPage.id, `${slug} v1 approval (second portal)`);
  await send('POST', 'msst_CmsPublishPage', { PageId: twinPage.id });

  const firstAgain = await send('POST', 'msst_CmsGetPublishedPageJson', {
    Site: siteKey,
    Slug: slug,
    LanguageCode: 'en',
  });
  check(
    'the same slug on two portals does not collide',
    firstAgain.body?.PageJson === json,
    'the first portal still serves its own content',
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${failed.length === 0 ? 'All checks passed.' : `${failed.length} check(s) failed.`}`);
  console.log(`Published page slug: ${slug}`);
  if (failed.length > 0) process.exit(1);
}

await main();
