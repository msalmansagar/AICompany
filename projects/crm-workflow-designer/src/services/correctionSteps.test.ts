import { describe, it, expect } from 'vitest';
import {
  classifyCorrectionSteps,
  placeCorrectionSteps,
  CORRECTION_PILL_W,
  CORRECTION_PILL_H,
} from './correctionSteps';

const step = (id: string, sequenceNo: number) => ({ id, sequenceNo });
const outcome = (stepId: string, nextStepId: string | null, sequenceNumber = 1) => ({
  stepId,
  nextStepId,
  sequenceNumber,
});

describe('classifyCorrectionSteps', () => {
  it('collapses a step whose only decision returns to an earlier step', () => {
    const info = classifyCorrectionSteps(
      [step('approve', 5), step('return', 6)],
      [outcome('approve', 'return'), outcome('return', 'approve')]
    );
    expect(info.correctionIds.has('return')).toBe(true);
    expect(info.returnTargetOf.get('return')).toBe('approve');
  });

  it('keeps a step on the spine when any decision moves forward', () => {
    // Step 30 in the Loan process: returns to 25 but also transitions to 31.
    const info = classifyCorrectionSteps(
      [step('a', 25), step('hybrid', 30), step('b', 31)],
      [outcome('hybrid', 'a', 1), outcome('hybrid', 'b', 2)]
    );
    expect(info.correctionIds.has('hybrid')).toBe(false);
  });

  it('keeps a step with a terminal decision on the spine', () => {
    // CEO Joint Approval returns to two directors AND can end the process —
    // that is the top of the hierarchy, not a correction loop.
    const info = classifyCorrectionSteps(
      [step('approve', 5), step('return', 6)],
      [outcome('return', 'approve', 1), outcome('return', null, 2)]
    );
    expect(info.correctionIds.has('return')).toBe(false);
  });

  it('keeps a conditional decision step on the spine even with null targets', () => {
    // A gateway source's targets live in routes; nextStepId is null on the
    // outcome. RM Review Approve collapsed to a pill for exactly this reason.
    const info = classifyCorrectionSteps(
      [step('earlier', 5), step('gateway', 6)],
      [
        { stepId: 'gateway', nextStepId: null, sequenceNumber: 1, isConditional: true },
        outcome('gateway', 'earlier', 2),
      ]
    );
    expect(info.correctionIds.has('gateway')).toBe(false);
  });

  it('never collapses the entry step', () => {
    const info = classifyCorrectionSteps(
      [step('entry', 1), step('later', 2)],
      [outcome('entry', 'entry')],
      'entry'
    );
    expect(info.correctionIds.has('entry')).toBe(false);
  });

  it('ignores pure self-loops — a smell for the validator, not a correction', () => {
    const info = classifyCorrectionSteps(
      [step('a', 1), step('self', 2)],
      [outcome('self', 'self')]
    );
    expect(info.correctionIds.has('self')).toBe(false);
  });

  it('picks the lowest-sequence back target as the resubmit destination', () => {
    const info = classifyCorrectionSteps(
      [step('early', 1), step('mid', 2), step('return', 3)],
      [outcome('return', 'mid', 2), outcome('return', 'early', 1)]
    );
    expect(info.returnTargetOf.get('return')).toBe('early');
  });

  it('collapses an orphan correction step with no incoming edge at all', () => {
    // The Loan spec has several: nothing routes in, one decision routes back.
    const info = classifyCorrectionSteps(
      [step('target', 10), step('orphanReturn', 32)],
      [outcome('orphanReturn', 'target')]
    );
    expect(info.correctionIds.has('orphanReturn')).toBe(true);
  });
});

describe('placeCorrectionSteps', () => {
  const info = classifyCorrectionSteps(
    [step('approve', 5), step('r1', 6), step('r2', 7)],
    [outcome('r1', 'approve'), outcome('r2', 'approve')]
  );
  const targetAt = (x: number, y: number) => (id: string) =>
    id === 'approve' ? { x, y, height: 120 } : null;

  it('puts pills in the left gutter of their target in TB', () => {
    const positions = placeCorrectionSteps(info, targetAt(500, 300), 'TB');
    const p1 = positions.get('r1')!;
    expect(p1.x).toBeLessThan(500 - CORRECTION_PILL_W);
    expect(p1.y).toBe(300);
  });

  it('stacks multiple pills on the same target without overlap', () => {
    const positions = placeCorrectionSteps(info, targetAt(500, 300), 'TB');
    const ys = [positions.get('r1')!.y, positions.get('r2')!.y].sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(CORRECTION_PILL_H);
  });

  it('puts pills above their target in LR', () => {
    const positions = placeCorrectionSteps(info, targetAt(500, 300), 'LR');
    expect(positions.get('r1')!.y).toBeLessThan(300 - CORRECTION_PILL_H);
  });
});
