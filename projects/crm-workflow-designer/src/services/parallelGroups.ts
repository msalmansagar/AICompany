import type { Node } from '@xyflow/react';

/**
 * Parallel group bands (CWFD-017 PR4): the steps that run at the same time
 * read as one grouped branch, not as loose cards that happen to share edges.
 *
 * A band is scenery derived from FINAL card positions — like the stage bands,
 * it follows the layout instead of steering it, so it can never destabilise
 * anything. It wraps the branch children (the parent stays on the spine; the
 * dashed "AT SAME TIME" edges already tie the two together) and names the
 * parent so the relationship survives greyscale export.
 *
 * Deliberately conservative: when an unrelated card lands inside the box the
 * band would need, the band is NOT drawn — a stranger inside the tint would
 * claim a concurrency that does not exist, and no band beats a wrong band.
 */

export interface GroupRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ParallelGroupData extends Record<string, unknown> {
  label: string;
  groupWidth: number;
  groupHeight: number;
}

export interface ParallelGroupStep {
  id: string;
  parentStepId: string | null;
  name: string;
}

const PAD = 16;
/** Extra headroom so the label clears the first card. */
const LABEL_H = 20;

function expand(rect: GroupRect, by: number): GroupRect {
  return { x: rect.x - by, y: rect.y - by - LABEL_H, w: rect.w + by * 2, h: rect.h + by * 2 + LABEL_H };
}

function union(a: GroupRect, b: GroupRect): GroupRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

function intersects(a: GroupRect, b: GroupRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * One band per step that has branch children, wrapping the children's cards.
 * @param steps every step with its concurrency parent, spine and branches alike
 * @param rectOf a step's laid-out card rectangle, or null when it is not on this canvas
 * @returns background nodes, ready to slot in front of the cards' z-order
 */
export function buildParallelGroupNodes(
  steps: ParallelGroupStep[],
  rectOf: (stepId: string) => GroupRect | null
): Node[] {
  const childrenOf = new Map<string, ParallelGroupStep[]>();
  for (const step of steps) {
    if (!step.parentStepId) continue;
    const siblings = childrenOf.get(step.parentStepId) ?? [];
    siblings.push(step);
    childrenOf.set(step.parentStepId, siblings);
  }
  if (childrenOf.size === 0) return [];

  const nameOf = new Map(steps.map((step) => [step.id, step.name]));
  const groups: Node[] = [];

  for (const [parentId, children] of childrenOf) {
    const memberIds = new Set(children.map((child) => child.id));
    const memberRects = children
      .map((child) => rectOf(child.id))
      .filter((rect): rect is GroupRect => rect !== null);
    if (memberRects.length === 0) continue;

    const box = expand(memberRects.reduce(union), PAD);

    // A stranger inside the tint would read as part of the group — skip.
    const intruded = steps.some((step) => {
      if (memberIds.has(step.id) || step.id === parentId) return false;
      const rect = rectOf(step.id);
      return rect !== null && intersects(box, rect);
    });
    if (intruded) continue;

    const parentName = nameOf.get(parentId) ?? 'its parent step';
    groups.push({
      id: `pgroup_${parentId}`,
      type: 'parallelGroup',
      position: { x: box.x, y: box.y },
      data: {
        label: `∥ At the same time as "${parentName}"`,
        groupWidth: box.w,
        groupHeight: box.h,
      } as ParallelGroupData,
      draggable: false,
      selectable: false,
      zIndex: -1,
    });
  }

  return groups;
}
