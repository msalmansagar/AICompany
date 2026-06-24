/**
 * Creates SVG icons for 10 additional DFE entities + Form Designer + Workflow Designer.
 * Run: node scripts/set-entity-icons-extended.mjs
 */
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

// ── SVG icons ────────────────────────────────────────────────────────────────

const ENTITY_ICONS = {

  qdb_form_audit_log: {
    label: 'Form Audit Log',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="3" y="2" width="14" height="16" rx="2" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="6.5" y1="7"  x2="13.5" y2="7"  stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="6.5" y1="10" x2="13.5" y2="10" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="6.5" y1="13" x2="10"   y2="13" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <circle cx="15.5" cy="15.5" r="3.5" fill="#fff" stroke="#0078d4" stroke-width="1.3"/>
  <line x1="15.5" y1="13.5" x2="15.5" y2="15.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <circle cx="15.5" cy="16.5" r="0.6" fill="#0078d4"/>
</svg>`,
  },

  qdb_form_business_rule: {
    label: 'Form Business Rule',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="3" width="7" height="5" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="11" y="3" width="7" height="5" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="6.5" y="12" width="7" height="5" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <path d="M5.5 8v1.5a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V8" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round"/>
  <line x1="10" y1="8" x2="10" y2="12" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round"/>
</svg>`,
  },

  qdb_form_lookup_config: {
    label: 'Form Lookup Config',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <circle cx="8.5" cy="8.5" r="5.5" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="12.5" y1="12.5" x2="17" y2="17" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="6" y1="8.5" x2="11" y2="8.5" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round"/>
  <line x1="8.5" y1="6" x2="8.5" y2="11" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round"/>
</svg>`,
  },

  qdb_form_submission_log: {
    label: 'Form Submission Log',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <path d="M3 4h14v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4z" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="3" y1="4" x2="17" y2="4" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="6.5" y1="8"  x2="10" y2="8"  stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="6.5" y1="11" x2="13.5" y2="11" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <polyline points="12,6.5 13.5,8 16,5.5" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  },

  qdb_button_design: {
    label: 'Button Design',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="5" width="12" height="7" rx="3.5" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="5.5" y1="8.5" x2="10.5" y2="8.5" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M16 9l1.5 1.5L14 14" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="16" cy="9" r="1" fill="#0078d4"/>
</svg>`,
  },

  qdb_field_design: {
    label: 'Field Design',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="7" width="12" height="6" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="5" y1="4" x2="8" y2="4" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="4.5" y1="10" x2="8.5" y2="10" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="8.5" y1="8" x2="8.5" y2="12" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M15 7l1.5 1.5-3.5 3.5" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="15" cy="7" r="1" fill="#0078d4"/>
</svg>`,
  },

  qdb_form_design: {
    label: 'Form Design',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="2" width="13" height="16" rx="2" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="5" y1="7"  x2="12" y2="7"  stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="10" x2="12" y2="10" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="13" x2="9"  y2="13" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M14 13l2-2 2 2-2 2-2-2z" fill="#0078d4"/>
  <line x1="15.5" y1="15.5" x2="18" y2="18" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  },

  qdb_section_design: {
    label: 'Section Design',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="2" width="13" height="6" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="2" y="11" width="13" height="6" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="5" y1="5"  x2="10" y2="5"  stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="14" x2="10" y2="14" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M17 5l-1.5 1.5M17 5l-1.5-1.5M17 5h-3" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
</svg>`,
  },

  qdb_theme: {
    label: 'Form Theme',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <circle cx="10" cy="10" r="7.5" stroke="#0078d4" stroke-width="1.5"/>
  <circle cx="10" cy="6"  r="1.5" fill="#0078d4"/>
  <circle cx="14" cy="12.5" r="1.5" fill="#0078d4"/>
  <circle cx="6"  cy="12.5" r="1.5" fill="#0078d4"/>
  <path d="M10 7.5v5M10 12.5l4-2.5M10 12.5L6 10" stroke="#0078d4" stroke-width="1" stroke-linecap="round"/>
</svg>`,
  },

  qdb_layout_grid: {
    label: 'Layout Grid',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
</svg>`,
  },
};

// ── Web resource–only icons (no entity update) ────────────────────────────────

const WEB_RESOURCE_ICONS = {
  qdb_icon_form_designer: {
    label: 'Visual Form Designer',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="3" width="16" height="12" rx="2" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="2" y1="7" x2="18" y2="7" stroke="#0078d4" stroke-width="1.3"/>
  <rect x="4.5" y="9.5" width="4" height="3" rx="1" stroke="#0078d4" stroke-width="1.2"/>
  <rect x="11"  y="9.5" width="5" height="1.5" rx="0.75" stroke="#0078d4" stroke-width="1.1"/>
  <rect x="11"  y="12"  width="3.5" height="1.5" rx="0.75" stroke="#0078d4" stroke-width="1.1"/>
  <rect x="4"  y="17" width="12" height="1.5" rx="0.75" fill="#0078d4" opacity="0.4"/>
</svg>`,
  },

  qdb_icon_workflow_designer: {
    label: 'Workflow Designer',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="1.5" y="7" width="5" height="5" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="7.5" y="2" width="5" height="5" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="7.5" y="13" width="5" height="5" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="13.5" y="7" width="5" height="5" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="6.5"  y1="9.5" x2="7.5"  y2="9.5" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round"/>
  <path d="M10 7v1.5M10 11.5V13" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round"/>
  <line x1="12.5" y1="9.5" x2="13.5" y2="9.5" stroke="#0078d4" stroke-width="1.3" stroke-linecap="round"/>
</svg>`,
  },
};

// ── Auth & helpers ─────────────────────────────────────────────────────────────

async function acquireToken() {
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await res.json();
  if (!res.ok) throw new Error(`Token: ${j.error_description}`);
  return j.access_token;
}

function headers(token, extra = {}) {
  return { Authorization: `Bearer ${token}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json', ...extra };
}

async function upsertWebResource(token, name, displayName, svgContent) {
  const h = headers(token);
  const check = await fetch(`${API_BASE}/webresourceset?$filter=name eq '${name}'&$select=webresourceid`, { headers: h }).then(r => r.json());
  const payload = { name, displayname: displayName, webresourcetype: 11, content: Buffer.from(svgContent).toString('base64') };
  if (check.value?.length) {
    const r = await fetch(`${API_BASE}/webresourceset(${check.value[0].webresourceid})`, { method: 'PATCH', headers: h, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(`PATCH webresource ${name}: ${r.status}`);
    return check.value[0].webresourceid;
  }
  const r = await fetch(`${API_BASE}/webresourceset`, { method: 'POST', headers: headers(token, { Prefer: 'return=representation' }), body: JSON.stringify(payload) });
  const j = await r.json();
  if (!r.ok) throw new Error(`POST webresource ${name}: ${r.status} — ${j.error?.message}`);
  return j.webresourceid;
}

async function setEntityIcon(token, entityLogicalName, webResourceName) {
  const h = headers(token);
  const getRes = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entityLogicalName}')`, { headers: h });
  if (!getRes.ok) throw new Error(`GET entity ${entityLogicalName}: ${getRes.status}`);
  const entity = await getRes.json();
  entity.IconVectorName = webResourceName;
  for (const key of Object.keys(entity)) {
    if (key.startsWith('@odata') || key.startsWith('@Microsoft')) delete entity[key];
  }
  const putRes = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entityLogicalName}')`, { method: 'PUT', headers: h, body: JSON.stringify(entity) });
  if (!putRes.ok) {
    const j = await putRes.json().catch(() => ({}));
    throw new Error(`PUT entity ${entityLogicalName}: ${putRes.status} — ${j.error?.message}`);
  }
}

async function publishEntities(token, entityNames) {
  const xml = `<importexportxml><entities>${entityNames.map(n => `<entity>${n}</entity>`).join('')}</entities></importexportxml>`;
  const res = await fetch(`${API_BASE}/PublishXml`, { method: 'POST', headers: headers(token), body: JSON.stringify({ ParameterXml: xml }) });
  if (!res.ok) throw new Error(`PublishXml: ${res.status}`);
}

async function publishWebResources(token, ids) {
  const xml = `<importexportxml><webresources>${ids.map(id => `<webresource>{${id}}</webresource>`).join('')}</webresources></importexportxml>`;
  const res = await fetch(`${API_BASE}/PublishXml`, { method: 'POST', headers: headers(token), body: JSON.stringify({ ParameterXml: xml }) });
  if (!res.ok) throw new Error(`PublishXml webresources: ${res.status}`);
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Setting Extended DFE Entity Icons ===\n');
  const token = await acquireToken();
  console.log('✓ Token acquired\n');

  const entityNames = [];

  // Part 1: Entity icons
  console.log('── Entity icons ──────────────────────────');
  for (const [entityName, { label, svg }] of Object.entries(ENTITY_ICONS)) {
    const resourceName = `qdb_icon_${entityName.replace('qdb_', '')}`;
    process.stdout.write(`[${label}]\n  web resource … `);
    try {
      await upsertWebResource(token, resourceName, `${label} Icon`, svg);
      process.stdout.write('✓  entity icon … ');
      await setEntityIcon(token, entityName, resourceName);
      process.stdout.write('✓\n');
      entityNames.push(entityName);
    } catch (err) {
      process.stdout.write(`✗  ${err.message}\n`);
    }
  }

  // Part 2: Web resource icons (form designer + workflow designer)
  console.log('\n── Designer app icons ────────────────────');
  const wrIds = [];
  for (const [resourceName, { label, svg }] of Object.entries(WEB_RESOURCE_ICONS)) {
    process.stdout.write(`[${label}] ${resourceName} … `);
    try {
      const id = await upsertWebResource(token, resourceName, `${label} Icon`, svg);
      wrIds.push(id);
      process.stdout.write('✓\n');
    } catch (err) {
      process.stdout.write(`✗  ${err.message}\n`);
    }
  }

  // Publish
  process.stdout.write(`\nPublishing ${entityNames.length} entities … `);
  if (entityNames.length) { await publishEntities(token, entityNames); }
  console.log('✓');

  process.stdout.write(`Publishing ${wrIds.length} web resources … `);
  if (wrIds.length) { await publishWebResources(token, wrIds); }
  console.log('✓');

  console.log(`\n=== Done. ${entityNames.length}/10 entities + ${wrIds.length}/2 designer icons. ===`);
  console.log(`\nDesigner icon names for sitemap SubArea Icon attribute:`);
  console.log(`  Visual Form Designer : qdb_icon_form_designer`);
  console.log(`  Workflow Designer    : qdb_icon_workflow_designer\n`);
}

main().catch(err => { console.error('\n✗ Fatal:', err.message); process.exit(1); });
