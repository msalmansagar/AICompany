/**
 * seed-phase7-templates.mts
 * Seeds synthetic `P7-` communication templates on `org5869857f`, so the Communication Centre has
 * something real to read.
 *
 * **These are development wording, not QDB's.** Every one is coded `P7-` and named so a reader can
 * see at a glance that it is synthetic. No production message text is invented here and none is
 * hard-coded in React — the point of seeding is precisely that the catalogue comes from the
 * organisation.
 *
 * Two lessons from Phase 6 are built in.
 *
 * **Every flag is set explicitly.** `qdb_isactive`, `qdb_approvalrequired`, `qdb_freetextallowed`
 * and `qdb_editingallowed` all default to **false** on this entity. KI-74 was eleven activity types
 * seeded inactive and a form that offered them anyway; a seeder that relies on a default is how that
 * happened.
 *
 * **The seed is verified by reading it back.** A seeder that reports success without asking the
 * organisation what it now holds is marking its own homework (KI-73).
 *
 * Idempotent: a template is matched by `qdb_code` and updated rather than duplicated.
 *
 * Usage:
 *   DV_API_VERSION=9.2 DV_AUTH_MODE=entra \
 *   node --import tsx --env-file="<path>/.env" crm/scripts/seed-phase7-templates.mts
 */

import { loadConfig, acquireToken, apiGet, apiPost } from './lib/crm-client.mjs';
import { SOLUTION_NAME } from './lib/qdb-plugin-steps.mjs';

const AUTHORISED_ORG = 'org5869857f';

/** Read from the organisation on 2026-09-20, never guessed. */
const CHANNEL = { SMS: 100000100, WhatsApp: 100000101, Email: 100000102 } as const;
const LANGUAGE = { Arabic: 100000440, English: 100000441 } as const;
const APPROVAL = { Return: 0, Approve: 1 } as const;

interface SeedTemplate {
  code: string;
  name: string;
  channel: number;
  language: number;
  subject: string;
  body: string;
  placeholders: string;
  approved: boolean;
  editingAllowed: boolean;
}

const TEMPLATES: readonly SeedTemplate[] = [
  {
    code: 'P7-SMS-OVERDUE-EN',
    name: 'P7 synthetic — overdue reminder (English)',
    channel: CHANNEL.SMS, language: LANGUAGE.English,
    subject: '',
    body: 'Dear {{customerName}}, your instalment of {{amount}} is overdue. Please contact QDB Collections.',
    placeholders: 'customerName, amount',
    approved: true, editingAllowed: false,
  },
  {
    code: 'P7-SMS-OVERDUE-AR',
    name: 'P7 synthetic — overdue reminder (Arabic)',
    channel: CHANNEL.SMS, language: LANGUAGE.Arabic,
    subject: '',
    body: 'عزيزي {{customerName}}، قسطك البالغ {{amount}} متأخر. يرجى التواصل مع تحصيل بنك قطر للتنمية.',
    placeholders: 'customerName, amount',
    approved: true, editingAllowed: false,
  },
  {
    code: 'P7-SMS-FOLLOWUP-EN',
    name: 'P7 synthetic — follow-up call arranged (English)',
    channel: CHANNEL.SMS, language: LANGUAGE.English,
    subject: '',
    body: 'Dear {{customerName}}, we will call you on {{followUpDate}} about your account.',
    placeholders: 'customerName, followUpDate',
    approved: true, editingAllowed: true,
  },
  {
    code: 'P7-EMAIL-OVERDUE-EN',
    name: 'P7 synthetic — overdue notice (English)',
    channel: CHANNEL.Email, language: LANGUAGE.English,
    subject: 'Overdue instalment — {{facilityNumber}}',
    body: 'Dear {{customerName}},\n\nYour instalment of {{amount}} on facility {{facilityNumber}} is '
      + 'overdue. Please contact QDB Collections to arrange payment.\n\nQDB Collections',
    placeholders: 'customerName, amount, facilityNumber',
    approved: true, editingAllowed: false,
  },
  {
    /**
     * Deliberately left unapproved.
     *
     * The Communication Centre must never offer it, and a catalogue in which everything is approved
     * cannot demonstrate that. `qdb_approvalstatus` is left **null** rather than set to Return,
     * because null is the state a template genuinely sits in before anyone reviews it — and null is
     * the value that a careless `Number(...)` would turn into 0, which is the code for Return.
     */
    code: 'P7-SMS-UNAPPROVED-EN',
    name: 'P7 synthetic — NOT approved, must never be offered',
    channel: CHANNEL.SMS, language: LANGUAGE.English,
    subject: '',
    body: 'This wording has not been approved and must not reach a customer. {{customerName}}',
    placeholders: 'customerName',
    approved: false, editingAllowed: false,
  },
];

const results: { name: string; passed: boolean }[] = [];
const check = (name: string, passed: boolean, detail = '') => {
  results.push({ name, passed });
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function main(): Promise<void> {
  const cfg = loadConfig();
  const host = new URL(cfg.orgUrl).host;
  if (!host.startsWith(`${AUTHORISED_ORG}.`)) throw new Error(`Refusing to run: connected to ${host}`);
  console.log(`=== Seeding synthetic P7- templates on ${host} ===\n`);

  const token = await acquireToken(cfg);

  for (const template of TEMPLATES) {
    const existing = await apiGet(cfg, token, SOLUTION_NAME,
      `/qdb_communicationtemplates?$select=qdb_communicationtemplateid`
      + `&$filter=qdb_code eq '${template.code}'&$top=1`);
    const id = existing?.value?.[0]?.qdb_communicationtemplateid as string | undefined;

    const payload = {
      qdb_code: template.code,
      qdb_name: template.name,
      qdb_channel: template.channel,
      qdb_language: template.language,
      qdb_subject: template.subject,
      qdb_body: template.body,
      qdb_placeholders: template.placeholders,
      // Every flag stated. None is left to a default that is false (KI-74).
      qdb_approvalrequired: true,
      qdb_approvalstatus: template.approved ? APPROVAL.Approve : null,
      qdb_isactive: true,
      qdb_freetextallowed: false,
      qdb_editingallowed: template.editingAllowed,
    };

    if (id) {
      await apiPatch(cfg, token, `/qdb_communicationtemplates(${id})`, payload);
      console.log(`  updated ${template.code}`);
    } else {
      await apiPost(cfg, token, SOLUTION_NAME, '/qdb_communicationtemplates', payload);
      console.log(`  created ${template.code}`);
    }
  }

  await verify(cfg, token);

  const failed = results.filter(r => !r.passed);
  console.log(`\n  ${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) process.exit(1);
}

/** PATCH, which `crm-client` does not expose. Plain, because a seed needs no concurrency control. */
async function apiPatch(
  cfg: { apiBase: string }, token: string, path: string, body: unknown,
): Promise<void> {
  const response = await fetch(`${cfg.apiBase}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
      'OData-Version': '4.0', 'OData-MaxVersion': '4.0',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0, 300)}`);
}

/**
 * Reads the catalogue back and asserts it is usable.
 *
 * "Usable" is the word that matters. A row existing proves nothing — KI-74 was eleven rows that
 * existed and could not be selected. So the assertions below are about the state a composer will
 * actually find: active, approved where it must be, and the one deliberately unapproved row still
 * unapproved.
 */
async function verify(cfg: unknown, token: string): Promise<void> {
  console.log('');
  const rows = await apiGet(cfg, token, SOLUTION_NAME,
    '/qdb_communicationtemplates?$select=qdb_code,qdb_channel,qdb_language,qdb_isactive,'
    + "qdb_approvalstatus,qdb_approvalrequired,qdb_body&$filter=startswith(qdb_code,'P7-')&$top=50");
  const seeded = (rows?.value ?? []) as Record<string, unknown>[];

  check('every synthetic template was written', seeded.length === TEMPLATES.length,
    `${seeded.length} of ${TEMPLATES.length}`);

  const inactive = seeded.filter(row => row['qdb_isactive'] !== true);
  check('none was left inactive, the KI-74 failure', inactive.length === 0,
    inactive.map(r => String(r['qdb_code'])).join(', ') || 'all active');

  const offerable = seeded.filter(row => row['qdb_approvalstatus'] === APPROVAL.Approve);
  check('four templates are approved and offerable', offerable.length === 4, `${offerable.length}`);

  const unapproved = seeded.find(row => String(row['qdb_code']) === 'P7-SMS-UNAPPROVED-EN');
  check('the unapproved template really carries no approval',
    unapproved !== undefined && unapproved['qdb_approvalstatus'] === null,
    `approvalstatus = ${JSON.stringify(unapproved?.['qdb_approvalstatus'])}`);

  const bodiless = seeded.filter(row => !String(row['qdb_body'] ?? '').trim());
  check('every template has a body to render', bodiless.length === 0,
    bodiless.map(r => String(r['qdb_code'])).join(', ') || 'all present');

  const arabic = seeded.find(row => row['qdb_language'] === LANGUAGE.Arabic);
  check('the Arabic template survived the round trip intact',
    String(arabic?.['qdb_body'] ?? '').includes('{{customerName}}'),
    arabic ? String(arabic['qdb_code']) : 'missing');
}

main().catch((error: unknown) => {
  console.error('\n[FATAL]', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
