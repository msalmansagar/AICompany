import {
  parsePlaceholders, TEMPLATE_CHANNEL_CODES, TEMPLATE_LANGUAGE_CODES,
  type CommunicationTemplate, type TemplateChannel, type TemplateLanguage,
} from '@dcp/domain';
import type { XrmCrmAdapter } from '../platform/XrmCrmAdapter.js';
import { COMMUNICATION_TEMPLATE_COLUMNS, ENTITY_SETS } from './schema.js';

/**
 * Reading the template catalogue.
 *
 * The catalogue is configuration, so it is read from the organisation rather than declared in
 * React — the Phase 6 rule that Activity Type and Outcome come from configuration applies here for
 * the same reason. **No message text is ever hard-coded in a component.**
 *
 * What this module does *not* do is decide which templates may be offered. That is
 * `templateAvailability` in `@dcp/domain`, and keeping the decision there means a bulk run and a
 * single send apply the same gates. This layer only turns rows into domain objects.
 *
 * Reading every template is deliberate and safe: the catalogue is bounded configuration, a few
 * dozen rows at most, unlike the case book the large-data rule is about. It is still `$top`-bounded
 * so a misconfigured organisation cannot turn it into an unbounded read.
 */

/** A catalogue big enough for every real configuration and small enough to be a bounded read. */
const CATALOGUE_LIMIT = 500;

const channelFromCode = (code: number): TemplateChannel | null =>
  (Object.keys(TEMPLATE_CHANNEL_CODES) as TemplateChannel[])
    .find(name => TEMPLATE_CHANNEL_CODES[name] === code) ?? null;

const languageFromCode = (code: number): TemplateLanguage | null =>
  (Object.keys(TEMPLATE_LANGUAGE_CODES) as TemplateLanguage[])
    .find(name => TEMPLATE_LANGUAGE_CODES[name] === code) ?? null;

const text = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

const nullableDate = (value: unknown): string | null =>
  value === null || value === undefined || value === '' ? null : String(value);

/**
 * Turns a row into a template, or discards it.
 *
 * A row whose channel or language code is not one the organisation declares is **dropped rather
 * than defaulted**. Defaulting an unknown channel to SMS would put a template in front of an
 * officer for a channel it was never written for, and defaulting a language would be worse.
 */
export function toTemplate(row: Record<string, unknown>): CommunicationTemplate | null {
  const channel = channelFromCode(Number(row['qdb_channel']));
  const language = languageFromCode(Number(row['qdb_language']));
  if (!channel || !language) return null;

  const approvalStatus = row['qdb_approvalstatus'];

  return {
    id: text(row['qdb_communicationtemplateid']),
    code: text(row['qdb_code']),
    name: text(row['qdb_name']),
    channel,
    language,
    subject: text(row['qdb_subject']),
    body: text(row['qdb_body']),
    placeholders: parsePlaceholders(text(row['qdb_placeholders'])),
    externalTemplateRef: text(row['qdb_externaltemplateref']),
    // Never coerced to a number: a template that has never been through approval carries null, and
    // `Number(null)` is 0 — which is the organisation's code for **Return**. That coercion would
    // silently turn "not yet reviewed" into "rejected".
    approvalStatus: approvalStatus === null || approvalStatus === undefined ? null : Number(approvalStatus),
    approvalRequired: row['qdb_approvalrequired'] === true,
    freeTextAllowed: row['qdb_freetextallowed'] === true,
    editingAllowed: row['qdb_editingallowed'] === true,
    isActive: row['qdb_isactive'] === true,
    effectiveFrom: nullableDate(row['qdb_effectivefrom']),
    effectiveTo: nullableDate(row['qdb_effectiveto']),
  };
}

/** Loads the whole catalogue, including the templates that are not currently offerable. */
export async function loadTemplateCatalogue(
  adapter: XrmCrmAdapter,
): Promise<readonly CommunicationTemplate[]> {
  const rows = await adapter.retrieveMultiple(ENTITY_SETS.communicationTemplate, {
    select: [...COMMUNICATION_TEMPLATE_COLUMNS, 'qdb_approvalrequired'],
    orderBy: { field: 'qdb_code' },
    top: CATALOGUE_LIMIT,
  });

  return rows.map(row => toTemplate(row)).filter((t): t is CommunicationTemplate => t !== null);
}
