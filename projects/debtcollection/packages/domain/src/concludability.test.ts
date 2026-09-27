import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  concludability, NO_OUTCOMES_CONFIGURED, planCompleteActivity,
} from './activityOperations.js';

/**
 * An advanced-process activity can be started and, today, never finished.
 *
 * `qdb_activityoutcome` holds thirty rows and every one is bound to an activity type. Legal
 * Recommendation, Deceased Review and Collection Dispute have **none between them** (KI-131), so
 * there is nothing an officer could record as the conclusion.
 *
 * The rule under test is deliberately **one generic rule about configuration**, not three rules
 * about three processes. What these tests therefore guard is as much what the code *does not* do —
 * it does not name an outcome, does not fall back to a generic success, and does not let a
 * completion through with nothing recorded against it.
 */

const COMPLETE = { currentStatus: 'Open' as const, notes: 'n' };

describe('whether a type can be concluded at all', () => {
  it('cannot, when its catalogue is empty', () => {
    const answer = concludability(0);

    expect(answer.available).toBe(false);
    expect(answer.available === false && answer.reason).toBe(NO_OUTCOMES_CONFIGURED);
  });

  it('can, as soon as QDB configures even one', () => {
    expect(concludability(1).available).toBe(true);
    expect(concludability(7).available).toBe(true);
  });

  /**
   * Silence is not emptiness. A caller that never loaded the catalogue has not established that it
   * is empty, and blocking it would turn "we did not ask" into "you may not finish this".
   */
  it('does not block a caller that never stated the catalogue', () => {
    expect(concludability(undefined).available).toBe(true);
  });
});

describe('completing an activity whose type has no configured outcome', () => {
  it('is refused, rather than completing with nothing recorded', () => {
    const result = planCompleteActivity({ ...COMPLETE, configuredOutcomeCount: 0 });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusals[0]!.code).toBe('CompletionUnavailable');
  });

  /**
   * The defect this replaces: the outcome was optional, so a completion with none simply went
   * through. The status changed, no conclusion was recorded, and the Deceased card then still read
   * *Under review* — because `resolveState` asks for an outcome, not for a status.
   */
  it('does not fabricate an outcome to get past the refusal', () => {
    const result = planCompleteActivity({ ...COMPLETE, configuredOutcomeCount: 0 });

    expect(JSON.stringify(result)).not.toMatch(/confirmed|approved|resolved|completed successfully/i);
    expect(result.ok).toBe(false);
  });

  /**
   * "Nothing is configured" and "the read failed" are different answers, and an officer acts on
   * them differently: one waits for QDB, the other retries. The refusal names the configuration.
   */
  it('says the configuration is missing, not that something went wrong', () => {
    const result = planCompleteActivity({ ...COMPLETE, configuredOutcomeCount: 0 });
    const message = !result.ok ? result.refusals[0]!.message : '';

    expect(message).toBe(NO_OUTCOMES_CONFIGURED);
    expect(message).not.toMatch(/error|failed|unavailable right now|try again/i);
  });

  it('is asked before the transition rule, so the accurate reason is the one given', () => {
    // A completed activity is also immutable. The configuration answer is the more useful one.
    const result = planCompleteActivity({
      ...COMPLETE, currentStatus: 'Completed', configuredOutcomeCount: 0,
    });

    expect(!result.ok && result.refusals[0]!.code).toBe('CompletionUnavailable');
  });
});

describe('a configured outcome still completes through the one generic mechanism', () => {
  const outcome = {
    id: 'o1', code: 'P6-CALL-CONTACTED', name: 'Contacted',
    requiresFollowUp: false, requiresNotes: false, escalationRequired: false,
  };

  it('saves when the catalogue has one and it was chosen', () => {
    const result = planCompleteActivity({ ...COMPLETE, configuredOutcomeCount: 7, outcome });

    expect(result.ok).toBe(true);
  });

  it('needs no process-specific branch — the same call serves every type', () => {
    for (const count of [1, 2, 7, 30]) {
      expect(planCompleteActivity({ ...COMPLETE, configuredOutcomeCount: count, outcome }).ok)
        .toBe(true);
    }
  });
});

/**
 * The taxonomy guard.
 *
 * DCP must not decide, in code, what concluding a deceased review or a legal recommendation means.
 * That is the question KI-124 and KI-109 put to QDB, and a helpful-looking constant here would
 * answer it quietly.
 */
describe('no outcome taxonomy is introduced by DCP', () => {
  /**
   * Comments are stripped first, deliberately.
   *
   * The rule's own documentation names the outcomes it refuses to invent — that is the point it is
   * making — and a sweep that cannot tell prose from code would fail on the explanation while a
   * real constant slipped past in a file that happened to carry no comments.
   */
  const ruleCode = (): string => {
    const source = readFileSync(new URL('./activityOperations.ts', import.meta.url), 'utf8');
    let code = source;
    for (;;) {
      const start = code.indexOf('/*');
      const end = start < 0 ? -1 : code.indexOf('*/', start + 2);
      if (start < 0 || end < 0) break;
      code = code.slice(0, start) + code.slice(end + 2);
    }
    return code
      .split('\n')
      .map(line => { const at = line.indexOf('//'); return at < 0 ? line : line.slice(0, at); })
      .join('\n');
  };

  const INVENTED = [
    'confirmed deceased', 'not deceased', 'verified death',
    'approved for legal', 'rejected for legal',
    'dispute accepted', 'dispute rejected',
  ];

  it('strips comments but keeps the code, so the sweep has something to read', () => {
    const code = ruleCode();

    expect(code).toContain('export function concludability');
    expect(code).not.toContain('Confirmed deceased');
    expect(code.length).toBeGreaterThan(2000);
  });

  it('names no business outcome in code', () => {
    const code = ruleCode().toLowerCase();

    for (const phrase of INVENTED) expect(code, phrase).not.toContain(phrase);
  });

  it('branches on no specific activity type', () => {
    // A rule that names a type is a rule that needs editing for the next one.
    const code = ruleCode();

    for (const type of ['P6-DECEASED', 'P6-LEGALREC', 'P6-DISPUTE']) {
      expect(code, type).not.toContain(type);
    }
  });
});
