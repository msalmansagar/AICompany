import { describe, expect, it } from 'vitest';
import {
  describeAdvancedProcesses, type AdvancedProcessEvidence, type ProcessAspect,
} from './advancedProcessState.js';

/**
 * WP6 — every advanced process, and what an officer can actually do with it, stated once.
 *
 * The property protected here is that the matrix is **derived from evidence**, never written to look
 * finished: an aspect is Actionable only where the capability exists, configuration-dependent aspects
 * follow the live outcome catalogue, and an answer that could not be read stays *not known*.
 */

/** What org5869857f actually holds today. */
const TODAY: AdvancedProcessEvidence = {
  outcomeCounts: { legal: 0, deceased: 0, dispute: 0 },
  legalQualificationConfigured: false,
};

const aspect = (evidence: AdvancedProcessEvidence, id: string): ProcessAspect => {
  const found = describeAdvancedProcesses(evidence).find(row => row.id === id);
  if (!found) throw new Error(`no aspect ${id}`);
  return found;
};

describe('the organisation as it stands', () => {
  it.each([
    ['legal-conclude'], ['deceased-conclude'], ['dispute-conclude'],
  ])('%s depends on configuration QDB has not supplied', id => {
    expect(aspect(TODAY, id).capability).toBe('ConfigurationDependent');
  });

  it('keeps the Legal hand-off blocked while no qualification rule exists', () => {
    expect(aspect(TODAY, 'legal-handoff').capability).toBe('Blocked');
  });

  it.each([
    ['legal-record'], ['deceased-review'], ['dispute-record'],
  ])('%s is something an officer can do now', id => {
    expect(aspect(TODAY, id).capability).toBe('Actionable');
  });

  it.each([['legal-follow'], ['complaint-follow']])('%s is read-only', id => {
    expect(aspect(TODAY, id).capability).toBe('ReadOnly');
  });

  it.each([
    ['legal-handoff'], ['deceased-treatment'], ['dispute-effect'], ['complaint-raise'],
  ])('%s waits on a QDB decision', id => {
    expect(aspect(TODAY, id).capability).toBe('Blocked');
  });

  it('defers insurance claims, because no process for them was found', () => {
    expect(aspect(TODAY, 'insurance-claims').capability).toBe('Deferred');
  });

  it.each([['restructuring'], ['field-visit']])('%s is parked', id => {
    expect(aspect(TODAY, id).capability).toBe('Parked');
  });
});

describe('when QDB supplies configuration', () => {
  it('lets a type with outcomes be concluded, and only that type', () => {
    const evidence = { ...TODAY, outcomeCounts: { ...TODAY.outcomeCounts, deceased: 2 } };

    expect(aspect(evidence, 'deceased-conclude').capability).toBe('Actionable');
    expect(aspect(evidence, 'legal-conclude').capability).toBe('ConfigurationDependent');
  });

  /**
   * A qualification rule unblocks the *decision*, not a button: no officer hand-off exists in the
   * product, so the aspect moves to configuration-dependent and never to Actionable.
   */
  it('never makes the Legal hand-off Actionable, even with a qualification rule', () => {
    const evidence = { ...TODAY, legalQualificationConfigured: true };

    expect(aspect(evidence, 'legal-handoff').capability).not.toBe('Actionable');
  });
});

describe('a catalogue that could not be read', () => {
  it('is not known — never Actionable and never configuration-dependent', () => {
    const evidence = { ...TODAY, outcomeCounts: { ...TODAY.outcomeCounts, dispute: undefined } };

    expect(aspect(evidence, 'dispute-conclude').capability).toBe('NotKnown');
  });
});

describe('every aspect', () => {
  const rows = describeAdvancedProcesses(TODAY);

  it('has a unique id', () => {
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  });

  it('explains itself in an officer sentence', () => {
    expect(rows.every(row => row.explanation.length > 20)).toBe(true);
  });

  it('names no known issue, column or option value', () => {
    expect(rows.filter(row => /KI-|qdb_|\d{6,}/.test(row.explanation))).toEqual([]);
  });

  it('never calls a customer deceased', () => {
    expect(rows.filter(row => /is deceased|has died|confirmed dea/i.test(row.explanation))).toEqual([]);
  });
});
