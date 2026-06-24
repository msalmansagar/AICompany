/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  IMPORTANT — C-004 GATE                                                    ║
 * ║  This script creates Dataverse schema changes (qdb_translation and         ║
 * ║  qdb_language_config entities). Execution against org5869857f requires     ║
 * ║  written approval from QDB IT Director per CEO condition C-004             ║
 * ║  (DFE-i18n-001 BRD approval document, 2026-06-24).                        ║
 * ║                                                                            ║
 * ║  DO NOT execute this script until C-004 is cleared.                       ║
 * ║                                                                            ║
 * ║  Entity creation MUST be done via PAC CLI managed solution (see below).   ║
 * ║  This script only seeds the language-config records once entities exist.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * ── STEP 1: Entity creation via PAC CLI (must be done before running this script)
 *
 * Both entities must be added to the QDB managed solution via PAC CLI.
 * Each entity must be declared in solution.xml RootComponents individually
 * (no wildcards — per CRM solution packaging memory note).
 *
 * ENTITY: qdb_translation
 * ─────────────────────────────────────────────────────────────────────────────
 * Display name:   Translation
 * Schema name:    qdb_translation
 * PK attribute:   qdb_translationid  (GUID, auto)
 *
 * Attributes:
 *   qdb_entity_name          Text(100)    required
 *                            e.g. "qdb_form_field"
 *   qdb_record_id            Text(36)     required
 *                            GUID of the source record
 *   qdb_field_name           Text(100)    required
 *                            e.g. "qdb_label"
 *   qdb_language_code        Text(10)     required
 *                            e.g. "ar", "fr"
 *   qdb_translated_value     Memo(4000)   required
 *                            The translated string (max 4000 chars)
 *   qdb_is_active            TwoOptions   default: true
 *   (+ standard audit: created_by, created_on, modified_by, modified_on)
 *
 * Alternate key (unique constraint — enforce via Dataverse Key definition):
 *   Name: qdb_translation_composite_key
 *   Attributes: qdb_entity_name + qdb_record_id + qdb_field_name + qdb_language_code
 *
 * Recommended index:
 *   Additional index on qdb_record_id for batched IN-list queries (AG-005)
 *
 * PAC CLI steps:
 *   pac solution add-reference --path . --processCanvasApps false
 *   # Add entity via Power Apps maker portal or XML in the solution
 *   pac solution pack --zipfile QdbDfe_i18n.zip --folder ./solution
 *   pac solution import --path QdbDfe_i18n.zip --environment org5869857f.crm4.dynamics.com
 *
 *
 * ENTITY: qdb_language_config
 * ─────────────────────────────────────────────────────────────────────────────
 * Display name:   Language Configuration
 * Schema name:    qdb_language_config
 * PK attribute:   qdb_language_configid  (GUID, auto)
 *
 * Attributes:
 *   qdb_language_code        Text(10)     required, unique
 *                            e.g. "en", "ar", "fr"
 *   qdb_display_name         Text(100)    required
 *                            e.g. "English", "Arabic"
 *   qdb_display_name_native  Text(100)    optional
 *                            e.g. "العربية"
 *   qdb_lcid                 WholeNumber  optional
 *                            e.g. 1033 (en), 1025 (ar-SA)
 *   qdb_is_active            TwoOptions   default: true
 *   qdb_is_default           TwoOptions   default: false
 *                            Exactly one record should have this = true (English)
 *   qdb_display_order        WholeNumber  default: 99
 *   qdb_rtl_direction        TwoOptions   default: false
 *                            true for Arabic, Hebrew, and other RTL languages
 *   (+ standard audit: created_by, created_on, modified_by, modified_on)
 *
 * Alternate key (unique constraint):
 *   Name: qdb_language_config_code_key
 *   Attributes: qdb_language_code
 *
 * Security role additions required:
 *   CRM Configuration Team: Read/Write on qdb_translation; Read on qdb_language_config
 *   Portal service account: Read on qdb_translation; Read on qdb_language_config
 *
 *
 * ── STEP 2: Seed language-config records (THIS SCRIPT)
 *
 * Run ONLY after the entities above exist in Dataverse:
 *   node scripts/provision-i18n-schema.mjs
 */

// ── Auth ──────────────────────────────────────────────────────────────────────
const TENANT_ID     = 'd79e793c-f6de-4204-8508-7980a63df957';
const CLIENT_ID     = '08e80e93-0bab-45ef-8372-2e554fa9af9b';
const CLIENT_SECRET = process.env.DV_CLIENT_SECRET;
if (!CLIENT_SECRET) {
  throw new Error('DV_CLIENT_SECRET environment variable is required. Run with: node --env-file=scripts/.env scripts/provision-i18n-schema.mjs');
}
const DV            = 'https://org5869857f.crm4.dynamics.com';
const BASE          = `${DV}/api/data/v9.2`;

const tokenBody = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: CLIENT_ID,
  client_secret: CLIENT_SECRET,
  scope: `${DV}/.default`,
});

const token = await fetch(
  `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`,
  { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: tokenBody },
)
  .then((r) => r.json())
  .then((j) => {
    if (!j.access_token) throw new Error(j.error_description ?? 'Token acquisition failed');
    return j.access_token;
  });

const H = {
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function upsertByAltKey(entitySetName, altKeyAttr, altKeyValue, body) {
  const url = `${BASE}/${entitySetName}(${altKeyAttr}='${altKeyValue}')`;
  const r = await fetch(url, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok && r.status !== 204) {
    throw new Error(`UPSERT ${entitySetName}(${altKeyAttr}='${altKeyValue}'): HTTP ${r.status} — ${text}`);
  }
  console.log(`  ✓ Upserted ${entitySetName} code=${altKeyValue}`);
}

console.log('\n╔══════════════════════════════════════════════════╗');
console.log('║   DFE i18n Schema — Language Config Seed         ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log('✓ Token acquired\n');

console.log('Seeding qdb_language_config records...');

// English (default)
await upsertByAltKey('qdb_language_configs', 'qdb_language_code', 'en', {
  qdb_language_code: 'en',
  qdb_display_name: 'English',
  qdb_lcid: 1033,
  qdb_is_default: true,
  qdb_rtl_direction: false,
  qdb_display_order: 1,
  qdb_is_active: true,
});

// Arabic
await upsertByAltKey('qdb_language_configs', 'qdb_language_code', 'ar', {
  qdb_language_code: 'ar',
  qdb_display_name: 'Arabic',
  qdb_display_name_native: 'العربية',
  qdb_lcid: 1025,
  qdb_is_default: false,
  qdb_rtl_direction: true,
  qdb_display_order: 2,
  qdb_is_active: true,
});

console.log('\n✓ Language config seed complete.');
console.log('NOTE: qdb_translation records are created by the designer Translations Panel — no seed needed here.');
console.log('\nRemember to clear the language-config cache after seeding:');
console.log('  POST /api/internal/cache/invalidate  { "target": "languages" }');
