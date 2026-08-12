/**
 * Seeds one published page with a stable slug, so the viewer has something to
 * show without hunting for a generated id.
 *
 * Run:
 *   node --env-file=<path>/.env projects/cms-engine/scripts/seed-demo-page.mjs
 *
 * Idempotent: re-running adds a new version and republishes, which is also a
 * useful way to prove versioning works.
 */

import { gzipSync } from 'node:zlib';

const SLUG = 'about-reyada';
const DATAVERSE_URL = process.env.DV_DATAVERSE_URL;
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2`;

const PAGE = {
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
          en:
            '<p>Reyada helps small and medium businesses in Qatar <strong>grow</strong>, with financing, advice and market access.</p>' +
            '<ul><li>Working capital</li><li>Equipment finance</li><li>Export support</li></ul>',
          ar:
            '<p>ريادة تساعد الشركات الصغيرة والمتوسطة في قطر على <strong>النمو</strong>، من خلال التمويل والاستشارات والوصول إلى الأسواق.</p>' +
            '<ul><li>رأس المال العامل</li><li>تمويل المعدات</li><li>دعم التصدير</li></ul>',
        },
      },
    },
    {
      type: 'RichText',
      props: {
        body: {
          en: '<h2>Who we serve</h2><p>Businesses at every stage, from a first idea to an export contract.</p>',
          ar: '<h2>من نخدم</h2><p>الشركات في كل مرحلة، من الفكرة الأولى إلى عقد التصدير.</p>',
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
async function send(method, path, body) {
  const res = await fetch(`${API_BASE}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  const id = res.headers.get('OData-EntityId');
  return { id: id ? id.match(/\(([^)]+)\)/)?.[1] : null, body: text ? JSON.parse(text) : null };
}

async function main() {
  token = await acquireToken();

  const found = await send('GET', `msst_cmspages?$select=msst_cmspageid&$filter=msst_slug eq '${SLUG}'`);
  let pageId = found.body.value[0]?.msst_cmspageid;

  if (!pageId) {
    const created = await send('POST', 'msst_cmspages', {
      msst_slug: SLUG,
      msst_titleen: 'About Reyada',
      msst_titlear: 'عن ريادة',
      msst_status: 100000000,
      msst_classification: 100000000,
    });
    pageId = created.id;
    console.log(`page ${SLUG} — created`);
  } else {
    console.log(`page ${SLUG} — exists`);
  }

  const versions = await send(
    'GET',
    `msst_cmspageversions?$select=msst_versionnumber&$filter=_msst_pageid_value eq ${pageId}&$orderby=msst_versionnumber desc&$top=1`,
  );
  const nextVersion = (versions.body.value[0]?.msst_versionnumber ?? 0) + 1;

  await send('POST', 'msst_cmspageversions', {
    msst_versionlabel: `${SLUG} v${nextVersion}`,
    msst_versionnumber: nextVersion,
    msst_contentjson: gzipSync(Buffer.from(JSON.stringify(PAGE), 'utf8')).toString('base64'),
    msst_islatest: true,
    msst_schemaversion: '1.0',
    'msst_pageid@odata.bind': `/msst_cmspages(${pageId})`,
  });
  console.log(`version ${nextVersion} — created`);

  const published = await send('POST', 'msst_CmsPublishPage', {
    PageId: pageId,
    Comment: 'seeded demo page',
  });
  console.log(`published v${published.body.PublishedVersionNumber}: ${published.body.Message}`);
  console.log(`\nView it:\n  ${DATAVERSE_URL}/main.aspx?pagetype=webresource&webresourceName=msst_cms_viewer.html`);
  console.log(`  slug: ${SLUG}`);
}

await main();
