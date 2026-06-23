/**
 * Updates qdb_icon_reference on info-card items to proper Fluent UI icon names.
 * Also fills in missing icons for numbered-steps items.
 * Run: node scripts/update-icon-references.mjs
 */
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = 'zMp8Q~~kJW3l3h_HOKbkYdH56c5ALU-Pxc3X_ct6';
const DATAVERSE_URL = 'https://org5869857f.crm4.dynamics.com';
const API_BASE      = `${DATAVERSE_URL}/api/data/v9.2`;

const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET, scope: `${DATAVERSE_URL}/.default` });
const t = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).then(r => r.json()).then(j => j.access_token);
const hdrs = { Authorization: `Bearer ${t}`, 'OData-MaxVersion': '4.0', 'OData-Version': '4.0', Accept: 'application/json', 'Content-Type': 'application/json' };

console.log('✓ Token acquired');

// icon name → Fluent UI Regular icon name (used on web)
// Same name used as key for mobile mapping
const ICON_MAP = {
  // icon-list: Details to Enter
  'Person':      'PersonRegular',
  'Home':        'HomeRegular',
  // icon-list: Documents to Upload
  'ContactCard': 'ContactCardRegular',
  'Certificate': 'CertificateRegular',
  'Design':      'DrawImageRegular',
  'Bank':        'BuildingBankRegular',
  // numbered-steps (no icons currently — add them)
  // These are matched by item title below
};

// Fetch all items
const res = await fetch(`${API_BASE}/qdb_info_card_items?$select=qdb_info_card_itemid,qdb_info_card_itemname,qdb_icon_reference`, { headers: hdrs });
const { value: items } = await res.json();

// Title → icon mapping for items that currently have no icon set
const TITLE_ICON_MAP = {
  'Application Details':                'DocumentTextRegular',
  'Digitally Sign Mandatory Documents': 'SignatureRegular',
  'Title Deed':                         'DocumentRegular',
  'Pledge & Commitment Letter':         'DocumentTextRegular',
  'Bank Guarantee Form':                'ShieldCheckmarkRegular',
};

let updated = 0;
for (const item of items) {
  // Resolve target icon
  let targetIcon = item.qdb_icon_reference
    ? (ICON_MAP[item.qdb_icon_reference] ?? item.qdb_icon_reference)
    : (TITLE_ICON_MAP[item.qdb_info_card_itemname] ?? null);

  if (!targetIcon) continue;
  if (targetIcon === item.qdb_icon_reference) continue; // already correct

  const patch = await fetch(`${API_BASE}/qdb_info_card_items(${item.qdb_info_card_itemid})`, {
    method: 'PATCH', headers: hdrs,
    body: JSON.stringify({ qdb_icon_reference: targetIcon }),
  });
  if (!patch.ok) {
    console.error(`  ✗ Failed to update ${item.qdb_info_card_itemname}: ${patch.status}`);
  } else {
    console.log(`  ✓ ${item.qdb_info_card_itemname} → ${targetIcon}`);
    updated++;
  }
}

console.log(`\nDone. ${updated} items updated.`);
