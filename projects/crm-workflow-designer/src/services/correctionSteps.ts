/**
 * Correction-loop detection — the CWFD-009 P1/P2 core.
 *
 * A real approval process is full of "Return to X by Y" steps whose only job
 * is to loop work back to an approver. Structurally they are ordinary steps;
 * visually they are exceptions. Treating them as first-class cards is what
 * turned the 35-step Loan Application Process into a hairball: the pure-return
 * steps have no forward edges, so Dagre ranks them at the very top and the
 * diagram opens on its corrections instead of its entry step.
 *
 * The classifier is deliberately conservative: only a step whose EVERY
 * connected decision loops backwards collapses. A step with even one forward
 * transition stays on the spine, because it genuinely advances the process.
 */

export interface CorrectionStepShape {
  id: string;
  sequenceNo: number;
}

export interface CorrectionOutcomeShape {
  stepId: string;
  nextStepId: string | null;
  sequenceNumber: number;
  /**
   * True for a conditional decision. Its targets live in routes, not on the
   * outcome, so `nextStepId` is null — without this flag a gateway source
   * looks like a dead end and can misclassify as a correction. RM Review
   * Approve in the Loan process collapsed to a pill for exactly that reason.
   */
  isConditional?: boolean;
}

export interface CorrectionInfo {
  /** Steps that are pure correction loops. */
  correctionIds: Set<string>;
  /** Correction step id → the step it resubmits to (its primary back target). */
  returnTargetOf: Map<string, string>;
}

/**
 * Finds the pure correction loops in a process graph.
 *
 * A step is a correction step only when EVERY one of its decisions is a plain
 * transition back to an earlier step. A forward transition, a conditional
 * decision, or an end-the-process decision each make it a genuine decision
 * point that belongs on the spine — CEO Joint Approval returns to two
 * directors *and* can end the process, and collapsing it would hide the top
 * of the hierarchy. The entry step never collapses, whatever its wiring,
 * because the canvas must always show where the process begins.
 */
export function classifyCorrectionSteps(
  steps: CorrectionStepShape[],
  outcomes: CorrectionOutcomeShape[],
  entryStepId: string | null = null
): CorrectionInfo {
  const sequenceOf = new Map(steps.map((s) => [s.id, s.sequenceNo]));

  const backTargets = new Map<string, Array<{ target: string; sequenceNumber: number }>>();
  const hasForward = new Set<string>();

  for (const outcome of outcomes) {
    const from = sequenceOf.get(outcome.stepId);
    if (from === undefined) continue;
    // A conditional decision routes elsewhere and a terminal one ends the
    // process — both advance the flow, whatever nextStepId says.
    if (outcome.isConditional || !outcome.nextStepId) {
      hasForward.add(outcome.stepId);
      continue;
    }
    const to = sequenceOf.get(outcome.nextStepId);
    if (to === undefined) continue;
    if (to <= from) {
      const list = backTargets.get(outcome.stepId) ?? [];
      list.push({ target: outcome.nextStepId, sequenceNumber: outcome.sequenceNumber });
      backTargets.set(outcome.stepId, list);
    } else {
      hasForward.add(outcome.stepId);
    }
  }

  const correctionIds = new Set<string>();
  const returnTargetOf = new Map<string, string>();

  for (const [stepId, targets] of backTargets) {
    if (hasForward.has(stepId)) continue;
    if (stepId === entryStepId) continue;
    // A self-loop is a modelling smell, not a correction pattern — leave the
    // card visible so the validator's warning has something to point at.
    const external = targets.filter((t) => t.target !== stepId);
    if (external.length === 0) continue;
    correctionIds.add(stepId);
    const primary = [...external].sort((a, b) => a.sequenceNumber - b.sequenceNumber)[0];
    returnTargetOf.set(stepId, primary.target);
  }

  return { correctionIds, returnTargetOf };
}

/** Dimensions of the collapsed correction pill, shared by layout and render. */
export const CORRECTION_PILL_W = 210;
export const CORRECTION_PILL_H = 44;

export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Slides a pill out of any card it landed on. The gutter beside a target is
 * usually free, but a multi-column rank can put a neighbouring card exactly
 * there — the pill then walks away from the flow (left in TB, up in LR) until
 * it stops intersecting anything.
 */
export function nudgeClearOfObstacles(
  position: { x: number; y: number },
  obstacles: LayoutRect[],
  dir: 'TB' | 'LR'
): { x: number; y: number } {
  const MARGIN = 10;
  const STEP = 48;
  const collides = (p: { x: number; y: number }) =>
    obstacles.some(
      (r) =>
        p.x < r.x + r.w + MARGIN &&
        p.x + CORRECTION_PILL_W + MARGIN > r.x &&
        p.y < r.y + r.h + MARGIN &&
        p.y + CORRECTION_PILL_H + MARGIN > r.y
    );
  const nudged = { ...position };
  for (let attempt = 0; attempt < 24 && collides(nudged); attempt += 1) {
    if (dir === 'TB') nudged.x -= STEP;
    else nudged.y -= STEP;
  }
  return nudged;
}

/**
 * Places each collapsed correction step beside the step it resubmits to.
 *
 * TB: pills sit in the left gutter of their target card (the right side is
 * where gateways branch). LR: pills sit above their target. Multiple pills on
 * one target stack away from the flow. Returns a position map keyed like the
 * node ids the caller uses (`step_<id>`).
 */
export function placeCorrectionSteps(
  info: CorrectionInfo,
  targetPositionOf: (stepId: string) => { x: number; y: number; height: number } | null,
  dir: 'TB' | 'LR'
): Map<string, { x: number; y: number }> {
  const GAP = 56;
  const STACK = CORRECTION_PILL_H + 14;
  const byTarget = new Map<string, string[]>();
  for (const [correctionId, targetId] of info.returnTargetOf) {
    const list = byTarget.get(targetId) ?? [];
    list.push(correctionId);
    byTarget.set(targetId, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [targetId, correctionIds] of byTarget) {
    const target = targetPositionOf(targetId);
    if (!target) continue;
    correctionIds.sort();
    correctionIds.forEach((correctionId, index) => {
      if (dir === 'TB') {
        positions.set(correctionId, {
          x: target.x - CORRECTION_PILL_W - GAP,
          y: target.y + index * STACK,
        });
      } else {
        positions.set(correctionId, {
          x: target.x + index * (CORRECTION_PILL_W + 14),
          y: target.y - CORRECTION_PILL_H - GAP,
        });
      }
    });
  }
  return positions;
}
