import { describe, expect, it } from 'vitest';
import {
  APPROVAL_STATUS_CODES, composePermissions, parsePlaceholders, renderTemplate,
  selectableTemplates, templateAvailability, type CommunicationTemplate,
} from '../communicationTemplate.js';

/**
 * The template gates, and the refusal to send an incomplete message.
 *
 * Two Phase 6 lessons are load-bearing here. Inactive configuration must not become selectable —
 * eleven activity types were seeded inactive and every form offered them anyway (KI-74). And a
 * default that is `false` is a default that bites: every boolean on this entity defaults to false,
 * so "not set" and "not allowed" are the same state and must be treated as the safe one.
 */

const base: CommunicationTemplate = {
  id: 't-1',
  code: 'P7-SMS-OVERDUE',
  name: 'Overdue reminder',
  channel: 'SMS',
  language: 'English',
  subject: '',
  body: 'Dear {{customerName}}, your payment of {{amount}} is overdue.',
  placeholders: ['customerName', 'amount'],
  externalTemplateRef: '',
  approvalStatus: APPROVAL_STATUS_CODES.Approve,
  approvalRequired: true,
  freeTextAllowed: false,
  editingAllowed: false,
  isActive: true,
  effectiveFrom: null,
  effectiveTo: null,
};

const at = (iso: string) => new Date(iso);

describe('which templates may be offered', () => {
  it('offers an active, approved template', () => {
    expect(templateAvailability(base).available).toBe(true);
  });

  it('withholds an inactive template even when it is approved', () => {
    const verdict = templateAvailability({ ...base, isActive: false });
    expect(verdict.available).toBe(false);
    if (!verdict.available) expect(verdict.reason).toBe('inactive');
  });

  it('treats a never-approved template as not approved, not as approved-by-default', () => {
    // The column has no Draft value, so an untouched template carries null. Reading "not Return"
    // as approval would make every new template immediately sendable.
    const verdict = templateAvailability({ ...base, approvalStatus: null });
    expect(verdict.available).toBe(false);
    if (!verdict.available) expect(verdict.reason).toBe('notApproved');
  });

  it('treats a returned template as not approved', () => {
    const verdict = templateAvailability({ ...base, approvalStatus: APPROVAL_STATUS_CODES.Return });
    expect(verdict.available).toBe(false);
  });

  it('offers a template that does not require approval', () => {
    expect(templateAvailability({ ...base, approvalRequired: false, approvalStatus: null }).available)
      .toBe(true);
  });

  it('withholds a template before its effective date', () => {
    const verdict = templateAvailability(
      { ...base, effectiveFrom: '2026-10-01T00:00:00Z' }, at('2026-09-20T00:00:00Z'));
    expect(verdict.available).toBe(false);
    if (!verdict.available) expect(verdict.reason).toBe('notYetEffective');
  });

  it('withholds a template after its effective window', () => {
    const verdict = templateAvailability(
      { ...base, effectiveTo: '2026-09-01T00:00:00Z' }, at('2026-09-20T00:00:00Z'));
    expect(verdict.available).toBe(false);
    if (!verdict.available) expect(verdict.reason).toBe('expired');
  });

  it('offers a template inside its window', () => {
    expect(templateAvailability(
      { ...base, effectiveFrom: '2026-09-01T00:00:00Z', effectiveTo: '2026-12-01T00:00:00Z' },
      at('2026-09-20T00:00:00Z')).available).toBe(true);
  });

  it('names a distinct reason per gate, so the officer is told what to do', () => {
    const reasons = [
      templateAvailability({ ...base, isActive: false }),
      templateAvailability({ ...base, approvalStatus: null }),
      templateAvailability({ ...base, effectiveTo: '2020-01-01T00:00:00Z' }),
    ].map(v => (v.available ? 'available' : v.reason));
    expect(new Set(reasons).size).toBe(3);
  });
});

describe('the catalogue a composer sees', () => {
  const catalogue: CommunicationTemplate[] = [
    base,
    { ...base, id: 't-2', code: 'P7-SMS-AR', language: 'Arabic' },
    { ...base, id: 't-3', code: 'P7-EMAIL', channel: 'Email' },
    { ...base, id: 't-4', code: 'P7-SMS-OFF', isActive: false },
  ];

  it('offers only the channel and language asked for', () => {
    const offered = selectableTemplates(catalogue, 'SMS', 'English');
    expect(offered.map(t => t.code)).toEqual(['P7-SMS-OVERDUE']);
  });

  it('never offers an inactive template', () => {
    expect(selectableTemplates(catalogue, 'SMS', 'English').some(t => !t.isActive)).toBe(false);
  });

  it('returns nothing rather than falling back to another language', () => {
    expect(selectableTemplates(catalogue, 'Email', 'Arabic')).toHaveLength(0);
  });
});

describe('reading the declared placeholders', () => {
  it('accepts commas, semicolons and newlines', () => {
    expect(parsePlaceholders('customerName, amount;\ndueDate')).toEqual(['customerName', 'amount', 'dueDate']);
  });

  it('tolerates the names being written in their braces', () => {
    expect(parsePlaceholders('{{customerName}},{{amount}}')).toEqual(['customerName', 'amount']);
  });

  it('ignores empty entries from trailing punctuation', () => {
    expect(parsePlaceholders('customerName,,')).toEqual(['customerName']);
  });
});

describe('rendering refuses rather than degrades', () => {
  it('substitutes every value', () => {
    const outcome = renderTemplate(base, { customerName: 'Ahmed', amount: 'QAR 5,000' });
    expect(outcome.rendered).toBe(true);
    if (outcome.rendered) expect(outcome.body).toBe('Dear Ahmed, your payment of QAR 5,000 is overdue.');
  });

  it('refuses when a placeholder has no value', () => {
    const outcome = renderTemplate(base, { customerName: 'Ahmed' });
    expect(outcome.rendered).toBe(false);
    if (!outcome.rendered) expect(outcome.unresolved).toEqual(['amount']);
  });

  it('treats an empty value as unresolved, because a blank is not an answer', () => {
    const outcome = renderTemplate(base, { customerName: 'Ahmed', amount: '   ' });
    expect(outcome.rendered).toBe(false);
  });

  it('names every unresolved placeholder, not just the first', () => {
    const outcome = renderTemplate(base, {});
    if (!outcome.rendered) expect(outcome.unresolved).toEqual(['customerName', 'amount']);
  });

  it('leaves the raw text untouched when it refuses, so nothing half-rendered can be sent', () => {
    const outcome = renderTemplate(base, {});
    expect(outcome.rendered).toBe(false);
    expect('body' in outcome).toBe(false);
  });

  it('renders the subject as well as the body', () => {
    const outcome = renderTemplate(
      { ...base, channel: 'Email', subject: 'Overdue: {{amount}}' },
      { customerName: 'Ahmed', amount: 'QAR 5,000' });
    if (outcome.rendered) expect(outcome.subject).toBe('Overdue: QAR 5,000');
  });

  it('does not mistake ordinary braces in prose for a placeholder', () => {
    const outcome = renderTemplate({ ...base, body: 'Reference { 12 } applies.', placeholders: [] }, {});
    expect(outcome.rendered).toBe(true);
  });
});

describe('what the officer is permitted to change', () => {
  it('permits nothing without a template', () => {
    expect(composePermissions(null)).toEqual({ mayEditTemplateBody: false, maySendFreeText: false });
  });

  it('keeps editing and free text as separate permissions', () => {
    expect(composePermissions({ ...base, editingAllowed: true, freeTextAllowed: false }))
      .toEqual({ mayEditTemplateBody: true, maySendFreeText: false });
    expect(composePermissions({ ...base, editingAllowed: false, freeTextAllowed: true }))
      .toEqual({ mayEditTemplateBody: false, maySendFreeText: true });
  });

  it('defaults to permitting nothing, matching the column defaults', () => {
    expect(composePermissions(base).mayEditTemplateBody).toBe(false);
  });
});
