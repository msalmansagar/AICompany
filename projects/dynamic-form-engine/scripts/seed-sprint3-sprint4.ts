/**
 * Sprint 3 + Sprint 4 seed data
 *
 * Seeds test records for the three new Dataverse tables:
 *   TABLE 13  qdb_rule_templates        — 4 reusable validation rule templates
 *   TABLE 14  qdb_fieldlabels           — 5 Arabic (ar) field label overrides
 *   TABLE 15  qdb_form_access_policies  — 4 role-based access policies
 *
 * Prerequisites:
 *   - migrate-sprint3-sprint4.ts  must have run (tables + columns + relationships exist)
 *   - seed-crm-metadata.ts        must have run (Loan Application form + fields exist)
 *
 * Required env vars:
 *   DATAVERSE_URL   — https://your-org.crm4.dynamics.com
 *   DATAVERSE_TOKEN — Bearer token (client credentials or az account get-access-token)
 *
 * Run:
 *   npx ts-node scripts/seed-sprint3-sprint4.ts
 */

const DATAVERSE_URL  = process.env['DATAVERSE_URL'];
const DATAVERSE_TOKEN = process.env['DATAVERSE_TOKEN'];
const SOLUTION       = 'QdbDynamicFormEngine';
const API_VER        = '9.2';

// IDs created by seed-crm-metadata.ts — update if you re-seeded in a different env.
const FORM_DEFINITION_ID = '1139d7d4-cc5b-f111-a826-7c1e52512216';

const FIELD_IDS = {
  customerType:    'e02f39d7-cc5b-f111-a825-7ced8d96ec97',
  fullName:        '1739d7d4-cc5b-f111-a826-7c1e52512216',
  nationalId:      'a24a06d6-cc5b-f111-a826-7ced8d8fec2d',
  email:           '1939d7d4-cc5b-f111-a826-7c1e52512216',
  mobile:          'ac4a06d6-cc5b-f111-a826-7ced8d8fec2d',
  requestedAmount: '1c39d7d4-cc5b-f111-a826-7c1e52512216',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function assertEnv(): void {
  if (!DATAVERSE_URL)   throw new Error('DATAVERSE_URL is required');
  if (!DATAVERSE_TOKEN) throw new Error('DATAVERSE_TOKEN is required');
}

function headers(): Record<string, string> {
  return {
    Authorization:             `Bearer ${DATAVERSE_TOKEN}`,
    'Content-Type':            'application/json; charset=utf-8',
    'OData-Version':           '4.0',
    'OData-MaxVersion':        '4.0',
    'MSCRM.SolutionUniqueName': SOLUTION,
  };
}

function logSection(title: string): void {
  const line = '─'.repeat(Math.max(0, 62 - title.length));
  console.log(`\n── ${title} ${line}`);
}

async function post(entitySet: string, body: Record<string, unknown>, label: string): Promise<string> {
  const url = `${DATAVERSE_URL}/api/data/v${API_VER}/${entitySet}`;
  const res  = await fetch(url, { method: 'POST', headers: headers(), body: JSON.stringify(body) });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /${entitySet} failed (HTTP ${res.status}) [${label}]: ${text.slice(0, 400)}`);
  }

  // Without Prefer:return=representation Dataverse returns 204 + OData-EntityId header.
  // Try that first — it works for all entity types regardless of plural naming.
  const guidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  const entityIdHdr = res.headers.get('OData-EntityId') ?? res.headers.get('Location') ?? '';
  let id = entityIdHdr.match(guidRe)?.[0];

  // Fallback: parse body if the server did return one
  if (!id) {
    const text = await res.text().catch(() => '');
    id = text.match(guidRe)?.[0];
    if (!id && text) {
      throw new Error(`Could not extract ID from POST /${entitySet} [${label}]. Response body: ${text.slice(0, 300)}`);
    }
  }

  if (!id) throw new Error(`Could not extract ID from POST /${entitySet} [${label}] — no OData-EntityId header and empty body`);

  console.log(`  [OK] ${entitySet} | ${label} | ${id}`);
  return id;
}

function bindLookup(entitySet: string, id: string): string {
  return `${DATAVERSE_URL}/api/data/v${API_VER}/${entitySet}(${id})`;
}

// ── TABLE 13: Rule Templates ───────────────────────────────────────────────────

async function seedRuleTemplates(): Promise<void> {
  logSection('Rule Templates (qdb_rule_templates)');

  // Required field
  await post('qdb_rule_templates', {
    qdb_name:          'Required Field',
    qdb_rule_type:     100000001,
    qdb_error_message: 'This field is required.',
  }, 'Required Field');

  // Qatar National ID — 11 numeric digits
  await post('qdb_rule_templates', {
    qdb_name:           'Qatar National ID (11 digits)',
    qdb_rule_type:      100000006,
    qdb_error_message:  'Please enter a valid 11-digit Qatar National ID.',
    qdb_regex_pattern:  '^[0-9]{11}$',
  }, 'Qatar National ID regex');

  // Standard email
  await post('qdb_rule_templates', {
    qdb_name:          'Standard Email',
    qdb_rule_type:     100000007,
    qdb_error_message: 'Please enter a valid email address.',
  }, 'Standard Email');

  // QAR minimum amount
  await post('qdb_rule_templates', {
    qdb_name:          'QAR Amount — Minimum 10,000',
    qdb_rule_type:     100000004,
    qdb_error_message: 'Amount must be at least QAR 10,000.',
    qdb_min_value:     10000,
  }, 'QAR Amount min 10,000');
}

// ── TABLE 14: Arabic Field Labels ─────────────────────────────────────────────

async function seedFieldLabels(): Promise<void> {
  logSection('Arabic Field Labels (qdb_fieldlabels)');

  const fields: Array<{ schemaName: string; fieldId: string; label: string; placeholder?: string }> = [
    {
      schemaName:  'customerType',
      fieldId:     FIELD_IDS.customerType,
      label:       'نوع العميل',
      placeholder: 'اختر نوع العميل',
    },
    {
      schemaName:  'fullName',
      fieldId:     FIELD_IDS.fullName,
      label:       'الاسم الكامل',
      placeholder: 'أدخل اسمك الكامل',
    },
    {
      schemaName:  'nationalId',
      fieldId:     FIELD_IDS.nationalId,
      label:       'رقم الهوية الوطنية',
      placeholder: 'أدخل رقم الهوية المكون من 11 رقماً',
    },
    {
      schemaName:  'email',
      fieldId:     FIELD_IDS.email,
      label:       'البريد الإلكتروني',
      placeholder: 'أدخل عنوان بريدك الإلكتروني',
    },
    {
      schemaName:  'mobile',
      fieldId:     FIELD_IDS.mobile,
      label:       'رقم الهاتف المحمول',
      placeholder: 'أدخل رقم هاتفك المحمول',
    },
    {
      schemaName:  'requestedAmount',
      fieldId:     FIELD_IDS.requestedAmount,
      label:       'المبلغ المطلوب',
      placeholder: 'أدخل المبلغ بالريال القطري',
    },
  ];

  for (const f of fields) {
    const body: Record<string, unknown> = {
      qdb_name:   `${f.schemaName} (ar)`,
      qdb_locale: 'ar',
      qdb_label:  f.label,
      'qdb_form_field_id@odata.bind': bindLookup('qdb_form_fields', f.fieldId),
    };
    if (f.placeholder) body['qdb_placeholder'] = f.placeholder;

    await post('qdb_fieldlabels', body, `${f.schemaName} (ar)`);
  }
}

// ── TABLE 15: Form Access Policies ────────────────────────────────────────────

async function seedAccessPolicies(): Promise<void> {
  logSection('Access Policies (qdb_form_access_policies)');

  // access_type option values: 100000001=View, 100000002=Submit, 100000003=Draft
  const formBind = bindLookup('qdb_form_definitions', FORM_DEFINITION_ID);

  const policies: Array<{ name: string; roleId: string; accessType: number }> = [
    { name: 'loan-application — LoanOfficer — view',      roleId: 'LoanOfficer',    accessType: 100000001 },
    { name: 'loan-application — LoanOfficer — submit',    roleId: 'LoanOfficer',    accessType: 100000002 },
    { name: 'loan-application — BranchManager — view',    roleId: 'BranchManager',  accessType: 100000001 },
    { name: 'loan-application — BranchManager — draft',   roleId: 'BranchManager',  accessType: 100000003 },
  ];

  for (const p of policies) {
    await post('qdb_form_access_policies', {
      qdb_name:        p.name,
      qdb_role_id:     p.roleId,
      qdb_access_type: p.accessType,
      'qdb_form_definition_id@odata.bind': formBind,
    }, p.name);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  assertEnv();

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  QDB Dynamic Form Engine — Sprint 3 + Sprint 4 Seed Data     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`  Environment : ${DATAVERSE_URL}`);
  console.log(`  Solution    : ${SOLUTION}`);
  console.log(`  Form ID     : ${FORM_DEFINITION_ID}`);

  await seedRuleTemplates();
  await seedFieldLabels();
  await seedAccessPolicies();

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Sprint 3 + Sprint 4 seed data complete.                     ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
}

main().catch((err: unknown) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
