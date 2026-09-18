/**
 * deploy-workspace-webresource.mjs
 * Uploads the built React workspace to the sandbox as a Dynamics web resource, and publishes it.
 *
 * This is the last step that can be taken without a person signing in. It proves the artefact can be
 * created, stored, published and read back at its real URL. What it cannot prove is that the
 * workspace *runs* inside Dynamics — that needs a browser with a CRM session, and is reported as
 * pending rather than implied by a green run here.
 *
 * It creates or updates exactly one web resource and touches nothing else. No entity, column,
 * relationship or choice is involved: a web resource is a file, not schema.
 *
 * Usage:
 *   npm --workspace @dcp/web run build
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --env-file="<path>/.env" crm/scripts/deploy-workspace-webresource.mjs [--publish]
 */

import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig, acquireToken, apiGet, buildHeaders } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';
const NAME = 'qdb_dcp_workspace.html';
const DISPLAY_NAME = 'DCP — Collection Workspace';
/** 1 = HTML. The workspace ships as one self-contained file, so no other resource is needed. */
const WEBRESOURCE_TYPE_HTML = 1;

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const ARTEFACT = resolve(root, 'apps/web/dist/index.html');

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

/**
 * Publishes, retrying while the organisation says something else is publishing or importing.
 *
 * `org5869857f` is shared with other engagements, and a solution import elsewhere makes the platform
 * refuse a concurrent publish outright. That is a busy signal, not a defect in this deployment, and
 * treating it as a failure would leave the web resource uploaded but unserved — the worst of the two
 * states, because the upload check passes and nothing says the file is stale.
 *
 * Only that one condition is retried. Any other refusal is returned immediately: retrying a genuine
 * error is how a script turns a clear failure into a slow one.
 */
async function publishWithRetry(cfg, token, parameterXml, maxAttempts = 5) {
  const BUSY = /another \[?(Import|Publish)\]?|another solution at the same time/i;
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    last = await send(cfg, token, 'POST', '/PublishXml', { ParameterXml: parameterXml });
    if (last.ok) return { ...last, attempts: attempt };
    if (!BUSY.test(last.message ?? '')) return { ...last, attempts: attempt };
    if (attempt < maxAttempts) {
      const waitSeconds = attempt * 10;
      console.log(`  (the organisation is busy with another import; retrying in ${waitSeconds}s — attempt ${attempt + 1} of ${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    }
  }
  return { ...last, attempts: maxAttempts };
}

async function main() {
  const publish = process.argv.includes('--publish');
  console.log('=== Deploying the Collection Workspace web resource ===\n');

  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) {
    throw new Error(`Refusing to run: authorised only for ${AUTHORISED_ORG}, connected to ${host}`);
  }
  console.log(`  Organisation: ${host}`);

  // ── The artefact ──────────────────────────────────────────────────────────
  console.log('\n─── The build artefact ───');
  let html;
  try {
    html = readFileSync(ARTEFACT, 'utf8');
  } catch {
    throw new Error(`No build artefact at ${ARTEFACT}. Run: npm --workspace @dcp/web run build`);
  }
  const sizeKb = statSync(ARTEFACT).size / 1024;
  check('A single self-contained artefact exists', html.length > 0, `${sizeKb.toFixed(0)} KB`);
  check('It references no external script or stylesheet',
    !/<script[^>]+src=/.test(html) && !/<link[^>]+stylesheet/.test(html),
    'nothing to resolve as a sibling under /WebResources');
  check('It uses no absolute asset path',
    !/(src|href)="\//.test(html),
    'an absolute /assets path would 404 under a web-resource URL');

  const token = await acquireToken(cfg);

  // ── Create or update ──────────────────────────────────────────────────────
  console.log('\n─── Upload ───');
  const existing = await apiGet(cfg, token, SOLUTION_NAME,
    `/webresourceset?$select=webresourceid,name,webresourcetype&$filter=name eq '${NAME}'&$top=2`);
  const rows = existing?.value ?? [];
  const content = Buffer.from(html, 'utf8').toString('base64');

  let id;
  if (rows.length === 1) {
    id = rows[0].webresourceid;
    const updated = await send(cfg, token, 'PATCH', `/webresourceset(${id})`, {
      content, displayname: DISPLAY_NAME,
    });
    check('Existing web resource updated', updated.ok, updated.ok ? id : updated.message);
  } else if (rows.length === 0) {
    const created = await send(cfg, token, 'POST', '/webresourceset', {
      name: NAME,
      displayname: DISPLAY_NAME,
      webresourcetype: WEBRESOURCE_TYPE_HTML,
      content,
      description: 'DCP Phase 5 React Collection Workspace. Built from apps/web; single self-contained file.',
    });
    id = created.id;
    check('Web resource created', created.ok, created.ok ? String(id) : created.message);
  } else {
    throw new Error(`Expected at most one web resource named '${NAME}', found ${rows.length}`);
  }
  if (!id) throw new Error('No web resource id was returned; nothing further can be verified.');

  // ── Publish ───────────────────────────────────────────────────────────────
  if (publish) {
    console.log('\n─── Publish ───');
    // A web resource is not served until it is published. Publishing only this component keeps the
    // blast radius to the file just uploaded, on an organisation shared with other engagements.
    const parameterXml = `<importexportxml><webresources><webresource>${id}</webresource></webresources></importexportxml>`;
    const published = await publishWithRetry(cfg, token, parameterXml);
    check('Published — only this web resource', published.ok,
      published.ok ? `PublishXml accepted${published.attempts > 1 ? ` on attempt ${published.attempts}` : ''}` : published.message);
  } else {
    console.log('\n  (skipped publish — pass --publish to publish this component)');
  }

  // ── Read it back ──────────────────────────────────────────────────────────
  console.log('\n─── Verification ───');
  const stored = await apiGet(cfg, token, SOLUTION_NAME,
    `/webresourceset(${id})?$select=name,displayname,webresourcetype,content`);
  check('The web resource reads back from the organisation',
    stored?.name === NAME, `${stored?.name} (${stored?.displayname})`);
  check('It is stored as HTML', stored?.webresourcetype === WEBRESOURCE_TYPE_HTML, `type=${stored?.webresourcetype}`);

  const storedHtml = stored?.content ? Buffer.from(stored.content, 'base64').toString('utf8') : '';
  check('The stored content matches the artefact byte for byte',
    storedHtml.length === html.length && storedHtml === html,
    `stored ${(storedHtml.length / 1024).toFixed(0)} KB, built ${(html.length / 1024).toFixed(0)} KB`);
  check('The design tokens survived the round trip', storedHtml.includes('--primary'));
  check('The workspace host element survived', storedHtml.includes('dcp-root'));

  const url = `${cfg.orgUrl.replace(/\/+$/, '')}/main.aspx?pagetype=webresource&webresourceName=${NAME}`;
  console.log(`\n  Open it at:\n    ${url}`);
  console.log('\n  NOT proven by this script: that the workspace loads inside Dynamics, that');
  console.log('  getGlobalContext answers, or that it can read data as the signed-in user.');
  console.log('  Those need a browser with a CRM session and are reported as pending.');

  const passed = results.filter(r => r.passed).length;
  console.log(`\n=== ${passed}/${results.length} checks passed ===`);
  if (passed !== results.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
