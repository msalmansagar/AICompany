/**
 * provision-dcp-app.mjs
 * Creates the "Debt Collection" model-driven app, so the workspace opens as a full page.
 *
 * Opened at `main.aspx?pagetype=webresource&…` with no app context, Dynamics adds a "For the best
 * experience viewing this content, open it in a specific application" banner and its own chrome. The
 * workspace works there — that is how the runtime checks were proved — but it does not look like the
 * product. Opening it from an app's sitemap removes the banner and gives the full-page presentation
 * ADR-DCP-07 specified, while keeping `Xrm`, the user context and the 9.1/9.2 dual-platform
 * behaviour exactly as they are.
 *
 * The shape is copied from the Report Engine app already in this organisation rather than invented:
 * `clienttype` 4, `formfactor` 1, an area/group/subarea sitemap, and a `$webresource:` URL.
 *
 * The alternative the raw `/WebResources/` path represents was rejected deliberately: there is no
 * `Xrm` there, so it needs a hardcoded API version — which is KI-02, and breaks on-premises.
 *
 * Safety: refuses any organisation but the authorised sandbox; `--remove` deletes exactly what it
 * created; no schema change — an app module and a sitemap are solution components, not tables.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/provision-dcp-app.mjs [--remove]
 */

import { loadConfig, acquireToken, apiGet, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
/**
 * Not `qdb_DebtCollection`, which is burnt.
 *
 * The first provisioning run created that app, then failed to attach a sitemap — `AddAppComponents`
 * is atomic and the call included a web resource, which an app may not reference — and the app was
 * rolled back. The unique name stayed reserved: creating it again returns `0x80050135` with no
 * message beyond a numeric code. Proved by creating the identical app under a different unique name,
 * which succeeded immediately.
 */
const APP_UNIQUE_NAME = 'qdb_CollectionWorkspace';
const APP_NAME = 'Debt Collection';
const SITEMAP_UNIQUE_NAME = 'qdb_debtcollection_sitemap';
const WEB_RESOURCE = 'qdb_dcp_workspace.html';

/**
 * One area, one group, one entry.
 *
 * The workspace carries its own navigation over all 21 views, so a sitemap that repeated them would
 * be a second place to keep in step. The privilege gate mirrors the Report Engine's: a user who
 * cannot read a collection case has no reason to see the entry.
 */
const SITEMAP_XML =
  '<SiteMap IntroducedVersion="9.0.0.0">' +
  '<Area Id="qdb_dcp_area" Title="Debt Collection" ShowGroups="false">' +
  '<Group Id="qdb_dcp_grp" Title="Collections">' +
  `<SubArea Id="qdb_dcp_sub_workspace" Title="Collection Workspace" Url="$webresource:${WEB_RESOURCE}" ` +
  'AvailableOffline="false" PassParams="true" Client="All">' +
  '<Privilege Entity="qdb_collectioncase" Privilege="Read" />' +
  '</SubArea>' +
  '</Group>' +
  '</Area>' +
  '</SiteMap>';

const ICON_NAME = 'qdb_dcp_app_icon.svg';
/** 11 = SVG. An app module requires an icon, and borrowing another engagement's would be confusing. */
const WEBRESOURCE_TYPE_SVG = 11;

/** The workspace's own palette: `--primary` on a document, with a coin for collections. */
const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">' +
  '<path d="M7 3h12l6 6v20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#0F6CBD"/>' +
  '<path d="M19 3l6 6h-5a1 1 0 0 1-1-1V3z" fill="#115EA3"/>' +
  '<circle cx="16" cy="19" r="6" fill="#FFFFFF"/>' +
  '<path d="M16 15v8M14 17.2c0-.9.9-1.4 2-1.4s2 .5 2 1.4-4 .7-4 2.1c0 .9.9 1.4 2 1.4s2-.5 2-1.4" ' +
  'fill="none" stroke="#0F6CBD" stroke-width="1.3" stroke-linecap="round"/>' +
  '</svg>';

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function send(cfg, token, method, path, body) {
  const res = await fetch(`${cfg.apiBase}${path}`, {
    method,
    headers: buildHeaders(token, SOLUTION_NAME),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (res.ok) {
    return { ok: true, id: (res.headers.get('OData-EntityId')?.match(/\(([^)]+)\)$/) ?? [])[1] ?? null };
  }
  const text = await res.text();
  let message = text;
  try { message = JSON.parse(text)?.error?.message ?? text; } catch { /* raw */ }
  return { ok: false, message };
}

const findOne = async (cfg, token, path) => ((await apiGet(cfg, token, SOLUTION_NAME, path))?.value ?? [])[0];

async function remove(cfg, token) {
  const app = await findOne(cfg, token, `/appmodules?$select=appmoduleid&$filter=uniquename eq '${APP_UNIQUE_NAME}'`);
  if (app) {
    const deleted = await send(cfg, token, 'DELETE', `/appmodules(${app.appmoduleid})`);
    check('App module removed', deleted.ok, deleted.ok ? app.appmoduleid : deleted.message);
  } else {
    check('App module removed', true, 'none existed');
  }

  const sitemap = await findOne(cfg, token, `/sitemaps?$select=sitemapid&$filter=sitemapnameunique eq '${SITEMAP_UNIQUE_NAME}'`);
  if (sitemap) {
    const deleted = await send(cfg, token, 'DELETE', `/sitemaps(${sitemap.sitemapid})`);
    check('Sitemap removed', deleted.ok, deleted.ok ? sitemap.sitemapid : deleted.message);
  } else {
    check('Sitemap removed', true, 'none existed');
  }
  console.log('\n  The web resource itself is untouched — it is a file, and the app only pointed at it.');
}

async function provision(cfg, token) {
  const resource = await findOne(cfg, token,
    `/webresourceset?$select=webresourceid&$filter=name eq '${WEB_RESOURCE}'`);
  check('The workspace web resource exists to point at', Boolean(resource), resource?.webresourceid ?? 'MISSING');
  if (!resource) throw new Error(`Deploy ${WEB_RESOURCE} first.`);

  // ── Sitemap ───────────────────────────────────────────────────────────────
  let sitemap = await findOne(cfg, token, `/sitemaps?$select=sitemapid&$filter=sitemapnameunique eq '${SITEMAP_UNIQUE_NAME}'`);
  if (sitemap) {
    const updated = await send(cfg, token, 'PATCH', `/sitemaps(${sitemap.sitemapid})`, { sitemapxml: SITEMAP_XML });
    check('Sitemap updated', updated.ok, updated.ok ? sitemap.sitemapid : updated.message);
  } else {
    const createdSitemap = await send(cfg, token, 'POST', '/sitemaps', {
      sitemapnameunique: SITEMAP_UNIQUE_NAME,
      sitemapxml: SITEMAP_XML,
    });
    check('Sitemap created', createdSitemap.ok, createdSitemap.ok ? String(createdSitemap.id) : createdSitemap.message);
    if (!createdSitemap.ok) throw new Error(createdSitemap.message);
    sitemap = { sitemapid: createdSitemap.id };
  }

  // ── Icon ──────────────────────────────────────────────────────────────────
  // An app module refuses to be created without one: "Attribute 'webresourceid' cannot be NULL".
  let icon = await findOne(cfg, token, `/webresourceset?$select=webresourceid&$filter=name eq '${ICON_NAME}'`);
  if (!icon) {
    const createdIcon = await send(cfg, token, 'POST', '/webresourceset', {
      name: ICON_NAME,
      displayname: 'DCP — app icon',
      webresourcetype: WEBRESOURCE_TYPE_SVG,
      content: Buffer.from(ICON_SVG, 'utf8').toString('base64'),
      description: 'Icon for the Debt Collection model-driven app.',
    });
    check('App icon created', createdIcon.ok, createdIcon.ok ? String(createdIcon.id) : createdIcon.message);
    if (!createdIcon.ok) throw new Error(createdIcon.message);
    icon = { webresourceid: createdIcon.id };
  } else {
    check('App icon already present', true, icon.webresourceid);
  }

  // ── App module ────────────────────────────────────────────────────────────
  let app = await findOne(cfg, token, `/appmodules?$select=appmoduleid&$filter=uniquename eq '${APP_UNIQUE_NAME}'`);
  if (!app) {
    const createdApp = await send(cfg, token, 'POST', '/appmodules', {
      name: APP_NAME,
      uniquename: APP_UNIQUE_NAME,
      description: 'Collection officer workspace over Housing Loan and BFD, as one application.',
      // Copied from the Report Engine app in this organisation: Unified Interface, web form factor.
      clienttype: 4,
      formfactor: 1,
      navigationtype: 0,
      webresourceid: icon.webresourceid,
    });
    check('App module created', createdApp.ok, createdApp.ok ? String(createdApp.id) : createdApp.message);
    if (!createdApp.ok) throw new Error(createdApp.message);
    app = { appmoduleid: createdApp.id };
  } else {
    check('App module already present', true, app.appmoduleid);
  }

  // ── Wire the sitemap and the entity into the app ──────────────────────────
  // A web resource is NOT an app component — "An app can't reference the component type
  // 'webresource'". It reaches the app through the sitemap's `$webresource:` URL instead, and adding
  // it alongside failed the whole call, which is why the first run left the app with no sitemap at
  // all: `AddAppComponents` is atomic.
  const addedSitemap = await send(cfg, token, 'POST', '/AddAppComponents', {
    AppId: app.appmoduleid,
    Components: [{ '@odata.type': 'Microsoft.Dynamics.CRM.sitemap', sitemapid: sitemap.sitemapid }],
  });
  check('Sitemap added to the app', addedSitemap.ok, addedSitemap.ok ? sitemap.sitemapid : addedSitemap.message);

  // `ValidateApp` raises a *warning* that the app references no entity. It is left standing, and
  // deliberately: this app's only component is a sitemap pointing at one web resource. The workspace
  // renders no model-driven form, view or chart, so there is no entity for the app to reference —
  // the reads happen inside the page through `Xrm.WebApi`. Adding a table purely to silence a
  // warning would put a component in the app that nothing in it uses.
  //
  // `AddAppComponents` will not take an entity by `MetadataId` either — the OData deserializer
  // rejects the payload — so satisfying the warning would mean `appmodulecomponent` rows by hand.
  // Not worth it for a warning the app is correct to raise.
  console.log('     (no entity component: the app is one sitemap over one web resource, by design)');

  // ── Validate before publishing, rather than reading "validation errors" afterwards ────────────
  const validation = await fetch(`${cfg.apiBase}/ValidateApp(AppModuleId=${app.appmoduleid})`, {
    headers: buildHeaders(token, SOLUTION_NAME),
  });
  const issues = (await validation.json())?.AppValidationResponse?.ValidationIssueList ?? [];
  const errors = issues.filter(issue => issue.ErrorType === 'Error');
  for (const issue of issues) console.log(`     ${issue.ErrorType}: ${issue.Message}`);
  check('The app validates with no errors', errors.length === 0,
    errors.length === 0 ? `${issues.length} warning(s)` : errors.map(e => e.Message).join('; '));

  // ── Publish ───────────────────────────────────────────────────────────────
  const parameterXml =
    '<importexportxml>' +
    `<appmodules><appmodule>${app.appmoduleid}</appmodule></appmodules>` +
    `<sitemaps><sitemap>${sitemap.sitemapid}</sitemap></sitemaps>` +
    `<webresources><webresource>${resource.webresourceid}</webresource><webresource>${icon.webresourceid}</webresource></webresources>` +
    '</importexportxml>';
  const published = await send(cfg, token, 'POST', '/PublishXml', { ParameterXml: parameterXml });
  check('Published — app, sitemap and web resource', published.ok, published.ok ? 'PublishXml accepted' : published.message);

  // ── Read it back ──────────────────────────────────────────────────────────
  const stored = await findOne(cfg, token,
    `/appmodules?$select=appmoduleid,name,uniquename,clienttype,url&$filter=uniquename eq '${APP_UNIQUE_NAME}'`);
  check('The app reads back from the organisation', stored?.name === APP_NAME, `${stored?.name} (${stored?.uniquename})`);
  check('It is a Unified Interface app', stored?.clienttype === 4, `clienttype=${stored?.clienttype}`);

  console.log(`\n  Open it at:\n    ${cfg.orgUrl.replace(/\/+$/, '')}/main.aspx?appid=${app.appmoduleid}`);
  console.log('\n  NOT proven by this script: that the app renders the workspace full-page without the');
  console.log('  "Choose an app" banner. That needs a browser with a CRM session, like every other');
  console.log('  runtime claim in this phase.');
}

async function main() {
  const removing = process.argv.includes('--remove');
  console.log(`=== Debt Collection app — ${removing ? 'REMOVE' : 'PROVISION'} ===\n`);

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);
  console.log('  Scope: one app module and one sitemap. No table, column, choice or relationship.\n');

  const token = await acquireToken(cfg);
  if (removing) await remove(cfg, token);
  else await provision(cfg, token);

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
