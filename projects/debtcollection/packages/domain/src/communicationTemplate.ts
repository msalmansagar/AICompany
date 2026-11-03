/**
 * The template model: which templates may be offered, and what a rendered message is.
 *
 * Pure decisions, like the rest of `@dcp/domain`. This module never reads CRM and never writes one;
 * it answers two questions that must be answered the same way everywhere:
 *
 *   **May this template be offered right now?** Approval, activation and the effective window are
 *   separate gates, and every one of them is a reason to withhold a template rather than to show it
 *   greyed out. Phase 6 established the rule the hard way (KI-74): *inactive configuration must not
 *   silently become selectable*.
 *
 *   **Is this message complete?** A placeholder that did not resolve is not cosmetic. Sending
 *   "Dear {{customerName}}, your payment of {{amount}} is overdue" to a real customer is worse than
 *   sending nothing, so an unresolved placeholder is a **refusal**, never a best effort.
 *
 * Option values below were read from `org5869857f` metadata on 2026-09-20, never guessed. Two of
 * them shape the model and are worth stating plainly:
 *
 *   • `qdb_approvalstatus` is **0 = Return, 1 = Approve**. There is no "Draft" or "Pending" value,
 *     so a template that has never been through approval carries **null** — which is not approval.
 *     The check is therefore "is it exactly Approve", not "is it not Return".
 *   • `qdb_isactive`, `qdb_freetextallowed`, `qdb_editingallowed` and `qdb_approvalrequired` all
 *     default to **false**. A template created without setting them is inert, and a seeder that
 *     forgets is the KI-74 defect repeating.
 */

/** Channels the template catalogue knows. Codes are the organisation's own. */
export const TEMPLATE_CHANNEL_CODES = {
  SMS: 100000100,
  WhatsApp: 100000101,
  Email: 100000102,
  Call: 100000103,
  OfficialLetter: 100000104,
} as const;

export type TemplateChannel = keyof typeof TEMPLATE_CHANNEL_CODES;

/** Languages the catalogue knows. */
export const TEMPLATE_LANGUAGE_CODES = { Arabic: 100000440, English: 100000441 } as const;

export type TemplateLanguage = keyof typeof TEMPLATE_LANGUAGE_CODES;

/**
 * Approval, as the organisation models it.
 *
 * Deliberately not named `Approved`/`Draft`: the column's own labels are Approve and Return, and
 * renaming them here would quietly invent a lifecycle the organisation does not have.
 */
export const APPROVAL_STATUS_CODES = { Return: 0, Approve: 1 } as const;

export interface CommunicationTemplate {
  id: string;
  code: string;
  name: string;
  channel: TemplateChannel;
  language: TemplateLanguage;
  subject: string;
  body: string;
  /** Declared placeholder names, as the catalogue records them. */
  placeholders: readonly string[];
  /** The provider-registered WhatsApp template name, when the channel needs one. */
  externalTemplateRef: string;
  /** `null` where the template has never been through approval — which is not approval. */
  approvalStatus: number | null;
  approvalRequired: boolean;
  freeTextAllowed: boolean;
  editingAllowed: boolean;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

/**
 * Why a template is not on offer.
 *
 * One reason per gate rather than a single boolean, because the officer-facing wording differs:
 * "this template is awaiting approval" and "this template expired last week" call for different
 * next actions, and collapsing them into "unavailable" makes both un-actionable.
 */
export type TemplateAvailability =
  | { available: true }
  | { available: false; reason: 'inactive' | 'notApproved' | 'notYetEffective' | 'expired'; message: string };

/**
 * Decides whether a template may be offered for selection.
 *
 * Every gate is evaluated against the template's own recorded state and the current time; none of
 * them is inferred from another. An inactive template that is also approved is still withheld.
 */
export function templateAvailability(
  template: CommunicationTemplate,
  now: Date = new Date(),
): TemplateAvailability {
  if (!template.isActive) {
    return { available: false, reason: 'inactive', message: 'This template is not active.' };
  }
  if (template.approvalRequired && template.approvalStatus !== APPROVAL_STATUS_CODES.Approve) {
    return { available: false, reason: 'notApproved', message: 'This template has not been approved.' };
  }

  const moment = now.getTime();
  const from = template.effectiveFrom ? Date.parse(template.effectiveFrom) : null;
  const to = template.effectiveTo ? Date.parse(template.effectiveTo) : null;

  if (from !== null && !Number.isNaN(from) && moment < from) {
    return { available: false, reason: 'notYetEffective', message: 'This template is not in use yet.' };
  }
  if (to !== null && !Number.isNaN(to) && moment > to) {
    return { available: false, reason: 'expired', message: 'This template is no longer in use.' };
  }
  return { available: true };
}

/** The templates a composer may offer, for one channel and language. */
export function selectableTemplates(
  templates: readonly CommunicationTemplate[],
  channel: TemplateChannel,
  language: TemplateLanguage,
  now: Date = new Date(),
): readonly CommunicationTemplate[] {
  return templates.filter(template =>
    template.channel === channel
    && template.language === language
    && templateAvailability(template, now).available);
}

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * The placeholder syntax.
 *
 * `{{name}}`, with the name restricted to word characters. Declared here rather than inherited,
 * because the catalogue held **zero rows** at the time this was written: there was no existing QDB
 * convention to honour, so this is DCP's, stated once and used everywhere. The restriction keeps a
 * stray brace in ordinary Arabic or English prose from being read as a placeholder.
 */
const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Reads the declared placeholder list.
 *
 * Accepts commas, semicolons and newlines because a configuration column is typed by a person, and
 * refusing a trailing comma would be a rule about punctuation rather than about messages.
 */
export function parsePlaceholders(declared: string): readonly string[] {
  return declared
    .split(/[,;\n]/)
    .map(token => token.trim().replace(/^\{\{|\}\}$/g, ''))
    .filter(token => token.length > 0);
}

export type RenderOutcome =
  | { rendered: true; subject: string; body: string }
  | { rendered: false; unresolved: readonly string[]; message: string };

/**
 * Substitutes values into a template.
 *
 * Refuses rather than degrades. An unresolved placeholder reaches the customer verbatim, and a
 * message reading "your payment of {{amount}} is overdue" is worse than no message at all — so the
 * names that could not be resolved are returned for the composer to show, and nothing is sent.
 *
 * A value that is present but empty counts as unresolved. An empty string is almost never a correct
 * answer to "what is this customer's name", and treating it as one is how a blank lands in a live
 * message.
 */
export function renderTemplate(
  template: CommunicationTemplate,
  values: Readonly<Record<string, string>>,
): RenderOutcome {
  const unresolved = new Set<string>();

  const substitute = (text: string): string => text.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name];
    if (value === undefined || value.trim() === '') {
      unresolved.add(name);
      return match;
    }
    return value;
  });

  const subject = substitute(template.subject);
  const body = substitute(template.body);

  if (unresolved.size > 0) {
    const names = [...unresolved];
    return {
      rendered: false,
      unresolved: names,
      message: names.length === 1
        ? `This message still needs ${names[0]}.`
        : `This message still needs ${names.join(', ')}.`,
    };
  }
  return { rendered: true, subject, body };
}

/**
 * Whether the officer may change the message before sending it.
 *
 * Two separate permissions, because they are separate decisions: `editingAllowed` is "you may alter
 * this template's wording", and `freeTextAllowed` is "you may send without a template at all". A
 * template may permit one and not the other, and conflating them would let approved wording be
 * rewritten because free text happened to be permitted somewhere else.
 */
export interface ComposePermissions {
  mayEditTemplateBody: boolean;
  maySendFreeText: boolean;
}

export function composePermissions(template: CommunicationTemplate | null): ComposePermissions {
  if (!template) return { mayEditTemplateBody: false, maySendFreeText: false };
  return {
    mayEditTemplateBody: template.editingAllowed,
    maySendFreeText: template.freeTextAllowed,
  };
}
