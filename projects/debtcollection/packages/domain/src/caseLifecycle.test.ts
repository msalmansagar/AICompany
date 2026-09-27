import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CASE_STATUS_CODES,
  CASE_TRANSITIONS,
  CaseStatus,
  UNIVERSAL_TARGETS,
  caseStatusFromCode,
  isActiveCaseStatus,
  isCaseTransitionAllowed,
  isTerminalCaseStatus,
} from './caseLifecycle.js';

const ALL_STATUSES = Object.keys(CASE_STATUS_CODES) as CaseStatus[];

describe('case transitions — the approved matrix', () => {
  it('opens a new case towards assignment', () => {
    expect(isCaseTransitionAllowed('New', 'Assigned')).toBe(true);
  });

  it('refuses a jump from New to Settled-then-Closed shortcuts', () => {
    expect(isCaseTransitionAllowed('New', 'Closed')).toBe(false);
  });

  it('refuses reopening from a working state', () => {
    expect(isCaseTransitionAllowed('InProgress', 'Reopened')).toBe(false);
  });

  it('allows a closed case to be reopened, and a reopened case to resume work', () => {
    expect(isCaseTransitionAllowed('Closed', 'Reopened')).toBe(true);
    expect(isCaseTransitionAllowed('Reopened', 'InProgress')).toBe(true);
  });

  it('keeps Kept-style terminal promises out of the case matrix: Settled leads only to Closed', () => {
    expect(CASE_TRANSITIONS.Settled).toEqual(['Closed']);
  });
});

describe('universal targets — Deceased/Insurance Review and Settled', () => {
  const nonTerminalWorkingStates = ALL_STATUSES.filter(s =>
    !['UnderLegalAction', 'DeceasedInsuranceReview', 'Settled', 'Closed', 'WrittenOff'].includes(s));

  it.each(nonTerminalWorkingStates)('%s can move to Deceased/Insurance Review', (from) => {
    expect(isCaseTransitionAllowed(from, 'DeceasedInsuranceReview')).toBe(true);
  });

  it.each(nonTerminalWorkingStates)('%s can settle when MIS reports a cure', (from) => {
    expect(isCaseTransitionAllowed(from, 'Settled')).toBe(true);
  });

  it('does not add the universal targets to terminal or already-there states', () => {
    expect(isCaseTransitionAllowed('Closed', 'Settled')).toBe(false);
    expect(isCaseTransitionAllowed('WrittenOff', 'DeceasedInsuranceReview')).toBe(false);
    expect(isCaseTransitionAllowed('Settled', 'DeceasedInsuranceReview')).toBe(false);
  });

  it('declares exactly the two universal targets', () => {
    expect(UNIVERSAL_TARGETS).toEqual(['DeceasedInsuranceReview', 'Settled']);
  });
});

describe('status classification', () => {
  it('treats only Closed and Written Off as terminal', () => {
    expect(ALL_STATUSES.filter(isTerminalCaseStatus)).toEqual(['Closed', 'WrittenOff']);
  });

  it('counts a Settled case as still active for the one-active-case rule', () => {
    expect(isActiveCaseStatus('Settled')).toBe(true);
  });

  it('maps provisioned status codes back to names', () => {
    expect(caseStatusFromCode(100000600)).toBe('New');
    expect(caseStatusFromCode(100000616)).toBe('Reopened');
    expect(caseStatusFromCode(1)).toBeUndefined();
  });
});

describe('parity with the plugin matrix (StatusTransitionMatrix.cs)', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const csharpPath = resolve(here, '../../../crm/plugins/Qdb.DebtCollection.Plugins/Domain/StatusTransitionMatrix.cs');
  const csharp = readFileSync(csharpPath, 'utf8');

  /** Parses `[CaseStatus.X] = new HashSet<int> { CaseStatus.A, CaseStatus.B },` blocks. */
  function parseCaseMatrix(source: string): Record<string, string[]> {
    const body = source.slice(source.indexOf('CaseAllowed ='), source.indexOf('PtpAllowed ='));
    const matrix: Record<string, string[]> = {};
    const entry = /\[CaseStatus\.(\w+)\]\s*=\s*new HashSet<int>\s*\{([^}]*)\}/g;
    for (const match of body.matchAll(entry)) {
      const targets = [...match[2]!.matchAll(/CaseStatus\.(\w+)/g)].map(m => m[1]!);
      matrix[match[1]!] = targets;
    }
    return matrix;
  }

  function parseCaseCodes(source: string): Record<string, number> {
    const body = source.slice(source.indexOf('class CaseStatus'), source.indexOf('class ActivityStatus'));
    const codes: Record<string, number> = {};
    for (const match of body.matchAll(/public const int (\w+) = (\d+);/g)) codes[match[1]!] = Number(match[2]);
    return codes;
  }

  it('has the same status codes as the plugin', () => {
    expect(parseCaseCodes(csharp)).toEqual(CASE_STATUS_CODES);
  });

  it('has the same allowed transitions as the plugin, state by state', () => {
    const plugin = parseCaseMatrix(csharp);
    expect(Object.keys(plugin).sort()).toEqual([...ALL_STATUSES].sort());
    for (const from of ALL_STATUSES) {
      expect([...plugin[from]!].sort(), `transitions from ${from}`).toEqual([...CASE_TRANSITIONS[from]].sort());
    }
  });
});
