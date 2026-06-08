/**
 * Creates SVG web resources for each DFE entity and sets IconVectorName.
 * Run: node scripts/set-entity-icons.mjs
 */
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

// ── SVG icon definitions ──────────────────────────────────────────────────────
// Each icon uses a 20×20 viewBox, QDB blue #0078d4, stroke-based style.

const ICONS = {
  qdb_form_definition: {
    label: 'Form Definition',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="3" y="2" width="14" height="17" rx="2" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="6.5" y1="7"  x2="13.5" y2="7"  stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="6.5" y1="10" x2="13.5" y2="10" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="6.5" y1="13" x2="10.5" y2="13" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  },

  qdb_form_tab: {
    label: 'Form Tab',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="7" width="16" height="11" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <path d="M2 10h3.5V6a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v4H16" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  },

  qdb_form_section: {
    label: 'Form Section',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="3" width="16" height="14" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="2" y1="8" x2="18" y2="8" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="5" y1="11.5" x2="15" y2="11.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="14"   x2="12" y2="14"   stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
</svg>`,
  },

  qdb_form_field: {
    label: 'Form Field',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="7" width="16" height="7" rx="2" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="5" y1="10.5" x2="9" y2="10.5" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <line x1="9" y1="8.5" x2="9" y2="12.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="3" y1="4.5" x2="7" y2="4.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
</svg>`,
  },

  qdb_form_button: {
    label: 'Form Button',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="6" width="16" height="8" rx="4" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="7" y1="10" x2="13" y2="10" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  },

  qdb_form_option_value: {
    label: 'Form Option Value',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <circle cx="5" cy="6"  r="2" stroke="#0078d4" stroke-width="1.5"/>
  <circle cx="5" cy="6"  r="0.8" fill="#0078d4"/>
  <line x1="9" y1="6" x2="17" y2="6" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="5" cy="11" r="2" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="9" y1="11" x2="17" y2="11" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="5" cy="16" r="2" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="9" y1="16" x2="17" y2="16" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  },

  qdb_form_validation_rule: {
    label: 'Form Validation Rule',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <path d="M10 2L3 5v5c0 4.4 3 8.1 7 9 4-0.9 7-4.6 7-9V5L10 2z" stroke="#0078d4" stroke-width="1.5" stroke-linejoin="round"/>
  <polyline points="7,10 9,12 13,8" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  },

  qdb_form_submission_mapping: {
    label: 'Form Submission Mapping',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="1"  y="7" width="6" height="6" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="13" y="7" width="6" height="6" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="7" y1="10" x2="13" y2="10" stroke="#0078d4" stroke-width="1.5"/>
  <polyline points="11,8 13,10 11,12" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  },

  qdb_form_submission_draft: {
    label: 'Form Submission Draft',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <path d="M11 3H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M14 2l3 3-6 6H8v-3l6-6z" stroke="#0078d4" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`,
  },

  qdb_form_version: {
    label: 'Form Version',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <circle cx="10" cy="10" r="7.5" stroke="#0078d4" stroke-width="1.5"/>
  <polyline points="10,6 10,10.5 13,13" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M2.5 7A8 8 0 0 1 4 4.5" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <polyline points="2,4 2.5,7 5.5,6.5" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  },

  qdb_info_card_screen: {
    label: 'Info Card Screen',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="3" y="2" width="14" height="16" rx="2" stroke="#0078d4" stroke-width="1.5"/>
  <rect x="6" y="5" width="8" height="4" rx="1" stroke="#0078d4" stroke-width="1.2"/>
  <line x1="6" y1="12" x2="14" y2="12" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="6" y1="14.5" x2="11" y2="14.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
</svg>`,
  },

  qdb_info_card_section: {
    label: 'Info Card Section',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="3" width="16" height="14" rx="2" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="2" y1="8"  x2="18" y2="8"  stroke="#0078d4" stroke-width="1.2"/>
  <line x1="2" y1="13" x2="18" y2="13" stroke="#0078d4" stroke-width="1.2"/>
  <line x1="5" y1="5.5"  x2="10" y2="5.5"  stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="10.5" x2="10" y2="10.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="5" y1="15.5" x2="10" y2="15.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
</svg>`,
  },

  qdb_info_card_item: {
    label: 'Info Card Item',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <circle cx="4.5" cy="6"  r="1.5" fill="#0078d4"/>
  <line x1="8" y1="6"  x2="17" y2="6"  stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="4.5" cy="10.5" r="1.5" fill="#0078d4"/>
  <line x1="8" y1="10.5" x2="17" y2="10.5" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="4.5" cy="15" r="1.5" fill="#0078d4"/>
  <line x1="8" y1="15" x2="17" y2="15" stroke="#0078d4" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
  },

  qdb_info_card_view_record: {
    label: 'Info Card View Record',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <path d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6S1.5 10 1.5 10z" stroke="#0078d4" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="10" cy="10" r="2.5" stroke="#0078d4" stroke-width="1.5"/>
  <circle cx="10" cy="10" r="1"   fill="#0078d4"/>
</svg>`,
  },

  qdb_grid_column_config: {
    label: 'Grid Column Config',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none">
  <rect x="2" y="3" width="16" height="14" rx="1.5" stroke="#0078d4" stroke-width="1.5"/>
  <line x1="2"  y1="8"  x2="18" y2="8"  stroke="#0078d4" stroke-width="1.2"/>
  <line x1="7.5" y1="3" x2="7.5" y2="17" stroke="#0078d4" stroke-width="1.2"/>
  <line x1="13"  y1="3" x2="13"  y2="17" stroke="#0078d4" stroke-width="1.2"/>
  <line x1="4"   y1="5.5" x2="6"  y2="5.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="9"   y1="5.5" x2="11" y2="5.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
  <line x1="14.5" y1="5.5" x2="16.5" y2="5.5" stroke="#0078d4" stroke-width="1.2" stroke-linecap="round"/>
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

function toBase64(str) {
  return Buffer.from(str).toString('base64');
}

// ── Create or update web resource ─────────────────────────────────────────────

async function upsertWebResource(token, name, displayName, svgContent) {
  const h = headers(token);

  // Check if exists
  const check = await fetch(`${API_BASE}/webresourceset?$filter=name eq '${name}'&$select=webresourceid`, { headers: h }).then(r => r.json());

  const payload = {
    name,
    displayname: displayName,
    webresourcetype: 11,            // SVG
    content: toBase64(svgContent),
    description: `Icon for ${displayName} entity`,
  };

  if (check.value?.length) {
    // Update existing
    const id = check.value[0].webresourceid;
    const res = await fetch(`${API_BASE}/webresourceset(${id})`, { method: 'PATCH', headers: h, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`PATCH webresource ${name}: ${res.status}`);
    return id;
  }

  // Create new
  const res = await fetch(`${API_BASE}/webresourceset`, { method: 'POST', headers: headers(token, { Prefer: 'return=representation' }), body: JSON.stringify(payload) });
  const j = await res.json();
  if (!res.ok) throw new Error(`POST webresource ${name}: ${res.status} — ${j.error?.message}`);
  return j.webresourceid;
}

// ── Set entity icon (GET full definition, update icon, PUT back) ──────────────

async function setEntityIcon(token, entityLogicalName, webResourceName) {
  const h = headers(token);

  // GET the full entity metadata (required for PUT)
  const getRes = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entityLogicalName}')`, { headers: h });
  if (!getRes.ok) {
    const j = await getRes.json().catch(() => ({}));
    throw new Error(`GET entity ${entityLogicalName}: ${getRes.status} — ${j.error?.message}`);
  }
  const entity = await getRes.json();

  // Set the icon and PUT the full definition back
  entity.IconVectorName = webResourceName;
  // Remove read-only OData annotations that cause PUT failures
  for (const key of Object.keys(entity)) {
    if (key.startsWith('@odata') || key.startsWith('@Microsoft')) delete entity[key];
  }

  const putRes = await fetch(`${API_BASE}/EntityDefinitions(LogicalName='${entityLogicalName}')`, {
    method: 'PUT',
    headers: h,
    body: JSON.stringify(entity),
  });
  if (!putRes.ok) {
    const j = await putRes.json().catch(() => ({}));
    throw new Error(`PUT entity ${entityLogicalName}: ${putRes.status} — ${j.error?.message}`);
  }
}

// ── Publish ────────────────────────────────────────────────────────────────────

async function publishEntities(token, entityNames) {
  const xml = `<importexportxml><entities>${entityNames.map(n => `<entity>${n}</entity>`).join('')}</entities></importexportxml>`;
  const res = await fetch(`${API_BASE}/PublishXml`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ ParameterXml: xml }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(`PublishXml: ${res.status} — ${j.error?.message}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Setting DFE Entity Icons ===\n');
  const token = await acquireToken();
  console.log('✓ Token acquired\n');

  const entityNames = [];

  for (const [entityName, { label, svg }] of Object.entries(ICONS)) {
    const resourceName = `qdb_icon_${entityName.replace('qdb_', '')}`;
    process.stdout.write(`[${label}]\n  → web resource: ${resourceName} … `);

    try {
      await upsertWebResource(token, resourceName, `${label} Icon`, svg);
      process.stdout.write('✓\n  → entity icon … ');
      await setEntityIcon(token, entityName, resourceName);
      process.stdout.write('✓\n');
      entityNames.push(entityName);
    } catch (err) {
      process.stdout.write(`✗  ${err.message}\n`);
    }
  }

  if (entityNames.length) {
    process.stdout.write(`\nPublishing ${entityNames.length} entities … `);
    await publishEntities(token, entityNames);
    console.log('✓');
  }

  console.log(`\n=== Done. ${entityNames.length}/${Object.keys(ICONS).length} entities updated. ===\n`);
}

main().catch(err => { console.error('\n✗ Fatal:', err.message); process.exit(1); });
