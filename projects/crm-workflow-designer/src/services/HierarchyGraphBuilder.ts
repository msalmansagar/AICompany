import type { Node, Edge } from '@xyflow/react';
import type { CrmStep, CrmOutcome, CrmRoute } from '../types/ViewTypes';
import { getAssignToLabel } from '../types/ViewTypes';
import type { LayoutDir } from './WorkflowGraphBuilder';
import { classifyCorrectionSteps } from './correctionSteps';

/**
 * The Hierarchy view (CWFD-010): the process as an org chart.
 *
 * Modelled on the Dynamics 365 contact org chart — generous whitespace,
 * avatar cards, elbow connectors with no arrowheads, and a collapse pill on
 * every card that has reports. The flow graph is not a tree, so the view
 * draws its SPANNING tree: each step hangs under the first step that reaches
 * it going forward, corrections are left out entirely (they loop, they do
 * not descend), and orphans hang under their nearest lower-sequence step so
 * incomplete configuration still reads in business order.
 */

export const HIER_CARD_W = 280;
export const HIER_CARD_H = 104;
const H_GAP = 40;
const V_GAP = 120;

export interface HierarchyStepData extends Record<string, unknown> {
  step: CrmStep;
  assigneeName: string | null;
  assignLabel: string;
  /** True when a conditional decision routes out of this step. */
  isDecisionPoint: boolean;
  /** True when one of the step's decisions ends the process. */
  isTerminating: boolean;
  childStepIds: string[];
  descendantCount: number;
  depth: number;
  layoutDir: LayoutDir;
  /** How many of this card's decisions return to an earlier visible step. */
  returnCount: number;
  /** Injected by the canvas: whether this card's subtree is collapsed. */
  isCollapsed?: boolean;
  /** Injected by the canvas: flips the collapse state. */
  onToggleCollapse?: (stepId: string) => void;
  /** Injected by the canvas: true while this card's returns are pinned open. */
  isReturnPinned?: boolean;
  /** Injected by the canvas: hover began/ended on the ↩ badge (null = ended). */
  onReturnHover?: (stepId: string | null) => void;
  /** Injected by the canvas: the ↩ badge was clicked — pin or unpin. */
  onReturnToggle?: (stepId: string) => void;
}

export interface HierarchyReturnEdgeData extends Record<string, unknown> {
  label: string;
  /** The outer lane this return travels: an x in TB, a y in LR. */
  gutter: number;
  layoutDir: LayoutDir;
  sourceStepId: string;
  targetStepId: string;
}

interface TreeShape {
  entryId: string | null;
  childrenOf: Map<string, string[]>;
  stepById: Map<string, CrmStep>;
  isDecisionPoint: Set<string>;
  isTerminating: Set<string>;
}

/**
 * Adopts every step into a spanning tree of the forward flow.
 * First forward parent wins; branch children belong to their parent step;
 * a gateway's route destinations belong to the gateway's step.
 */
function buildTree(steps: CrmStep[], outcomes: CrmOutcome[], routes: CrmRoute[]): TreeShape {
  const correctionInfo = classifyCorrectionSteps(
    steps.map((s) => ({ id: s.id, sequenceNo: s.sequenceNo })),
    outcomes.map((o) => ({
      stepId: o.stepId,
      nextStepId: o.nextStepId,
      sequenceNumber: o.sequenceNumber,
      isConditional: o.applyFilter,
    }))
  );
  const visible = steps
    .filter((s) => !correctionInfo.correctionIds.has(s.id))
    .sort((a, b) => a.sequenceNo - b.sequenceNo);
  const stepById = new Map(visible.map((s) => [s.id, s]));
  const sequenceOf = new Map(visible.map((s) => [s.id, s.sequenceNo]));

  const isForward = (from: string, to: string) => {
    const a = sequenceOf.get(from);
    const b = sequenceOf.get(to);
    return a !== undefined && b !== undefined && b > a;
  };

  const routesByOutcome = new Map<string, CrmRoute[]>();
  for (const r of routes) {
    routesByOutcome.set(r.outcomeId, [...(routesByOutcome.get(r.outcomeId) ?? []), r]);
  }

  const isDecisionPoint = new Set<string>();
  const isTerminating = new Set<string>();
  const candidateChildren = new Map<string, string[]>();
  const push = (parent: string, child: string) => {
    const list = candidateChildren.get(parent) ?? [];
    if (!list.includes(child)) list.push(child);
    candidateChildren.set(parent, list);
  };

  for (const o of outcomes) {
    if (!stepById.has(o.stepId)) continue;
    if (o.applyFilter) {
      isDecisionPoint.add(o.stepId);
      for (const r of routesByOutcome.get(o.id) ?? []) {
        if (!r.nextStepId) isTerminating.add(o.stepId);
        else if (isForward(o.stepId, r.nextStepId)) push(o.stepId, r.nextStepId);
      }
      continue;
    }
    if (!o.nextStepId) isTerminating.add(o.stepId);
    else if (isForward(o.stepId, o.nextStepId)) push(o.stepId, o.nextStepId);
  }
  for (const s of visible) {
    if (s.parentStepId && stepById.has(s.parentStepId)) push(s.parentStepId, s.id);
  }

  // Entry: the lowest-sequence step no forward link reaches.
  const reached = new Set([...candidateChildren.values()].flat());
  const entry = visible.find((s) => !reached.has(s.id)) ?? visible[0] ?? null;

  // Adopt breadth-first from the entry — the first parent to reach a step
  // keeps it, every later link is a cross-edge the tree does not draw.
  const childrenOf = new Map<string, string[]>();
  const adopted = new Set<string>(entry ? [entry.id] : []);
  const queue = entry ? [entry.id] : [];
  while (queue.length > 0) {
    const parent = queue.shift() as string;
    for (const child of candidateChildren.get(parent) ?? []) {
      if (adopted.has(child)) continue;
      adopted.add(child);
      childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), child]);
      queue.push(child);
    }
  }

  // Orphans hang under their nearest lower-sequence adopted step.
  for (const s of visible) {
    if (adopted.has(s.id)) continue;
    const anchor = [...visible]
      .reverse()
      .find((p) => p.sequenceNo < s.sequenceNo && adopted.has(p.id));
    const parent = anchor?.id ?? entry?.id;
    if (!parent || parent === s.id) continue;
    adopted.add(s.id);
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), s.id]);
    // Its own subtree may now be adoptable.
    const localQueue = [s.id];
    while (localQueue.length > 0) {
      const q = localQueue.shift() as string;
      for (const child of candidateChildren.get(q) ?? []) {
        if (adopted.has(child)) continue;
        adopted.add(child);
        childrenOf.set(q, [...(childrenOf.get(q) ?? []), child]);
        localQueue.push(child);
      }
    }
  }

  return { entryId: entry?.id ?? null, childrenOf, stepById, isDecisionPoint, isTerminating };
}

function assigneeOf(step: CrmStep): string | null {
  const label = getAssignToLabel(step.assignToCode);
  if (label === 'Team') return step.teamName?.trim() || null;
  if (label === 'Round Robin') return step.roundRobinTeamName?.trim() || null;
  if (label === 'Read From Parent') return 'From the parent record';
  return step.assignedUserName?.trim() || null;
}

/**
 * Classic tidy-tree layout: a leaf takes one slot, a parent takes the width
 * of its children and sits centred above them. Collapsed subtrees take one
 * slot — the chart tightens the way the Dynamics org chart does.
 */
export function layoutHierarchy(
  tree: Pick<TreeShape, 'entryId' | 'childrenOf'>,
  collapsedIds: ReadonlySet<string>,
  dir: LayoutDir
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (!tree.entryId) return positions;

  const widthOf = (id: string): number => {
    const children = collapsedIds.has(id) ? [] : (tree.childrenOf.get(id) ?? []);
    if (children.length === 0) return HIER_CARD_W + H_GAP;
    return Math.max(
      HIER_CARD_W + H_GAP,
      children.reduce((sum, child) => sum + widthOf(child), 0)
    );
  };

  const place = (id: string, crossStart: number, depth: number) => {
    const width = widthOf(id);
    const crossCentre = crossStart + width / 2 - HIER_CARD_W / 2;
    const main = depth * (HIER_CARD_H + V_GAP);
    positions.set(id, dir === 'TB' ? { x: crossCentre, y: main } : { x: main, y: crossCentre });
    let cursor = crossStart;
    const children = collapsedIds.has(id) ? [] : (tree.childrenOf.get(id) ?? []);
    for (const child of children) {
      place(child, cursor, depth + 1);
      cursor += widthOf(child);
    }
  };

  place(tree.entryId, 0, 0);
  return positions;
}

/** Every step in or below a collapsed card, for hiding and for the pill count. */
function descendantsOf(id: string, childrenOf: Map<string, string[]>): string[] {
  const out: string[] = [];
  const queue = [...(childrenOf.get(id) ?? [])];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    out.push(current);
    queue.push(...(childrenOf.get(current) ?? []));
  }
  return out;
}

export function buildHierarchyGraph(
  steps: CrmStep[],
  outcomes: CrmOutcome[],
  dir: LayoutDir = 'TB',
  routes: CrmRoute[] = [],
  collapsedIds: ReadonlySet<string> = new Set()
): { nodes: Node[]; edges: Edge[] } {
  const tree = buildTree(steps, outcomes, routes);
  if (!tree.entryId) return { nodes: [], edges: [] };

  const positions = layoutHierarchy(tree, collapsedIds, dir);
  const depthOf = new Map<string, number>();
  const walkDepth = (id: string, depth: number) => {
    depthOf.set(id, depth);
    for (const child of tree.childrenOf.get(id) ?? []) walkDepth(child, depth + 1);
  };
  walkDepth(tree.entryId, 0);

  const hidden = new Set<string>();
  for (const id of collapsedIds) {
    for (const d of descendantsOf(id, tree.childrenOf)) hidden.add(d);
  }

  // Direct return decisions between two VISIBLE cards. The tree hides them by
  // default; each one gets its own lane in the outer gutter so that showing
  // all of them never braids into one cable, and never crosses the tree.
  const isRendered = (id: string) => positions.has(id) && !hidden.has(id);
  const sequenceOf = new Map(steps.map((s) => [s.id, s.sequenceNo]));
  const returnLinks = outcomes
    .filter((o) => {
      if (!o.nextStepId || o.applyFilter) return false;
      if (o.nextStepId === o.stepId) return false;
      if (!isRendered(o.stepId) || !isRendered(o.nextStepId)) return false;
      const from = sequenceOf.get(o.stepId);
      const to = sequenceOf.get(o.nextStepId);
      return from !== undefined && to !== undefined && to <= from;
    })
    .sort((a, b) => {
      const posOf = (id: string) => positions.get(id) ?? { x: 0, y: 0 };
      const main = (id: string) => (dir === 'TB' ? posOf(id).y : posOf(id).x);
      return main(a.nextStepId as string) - main(b.nextStepId as string) ||
        main(a.stepId) - main(b.stepId);
    });

  const returnCountOf = new Map<string, number>();
  for (const link of returnLinks) {
    returnCountOf.set(link.stepId, (returnCountOf.get(link.stepId) ?? 0) + 1);
  }

  const renderedPositions = [...positions.entries()].filter(([id]) => !hidden.has(id));
  const gutterBase =
    renderedPositions.length > 0
      ? Math.min(...renderedPositions.map(([, p]) => (dir === 'TB' ? p.x : p.y))) - 70
      : -70;

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  for (const [id, position] of positions) {
    if (hidden.has(id)) continue;
    const step = tree.stepById.get(id);
    if (!step) continue;
    nodes.push({
      id: `step_${id}`,
      type: 'hierStep',
      position,
      data: {
        step,
        assigneeName: assigneeOf(step),
        assignLabel: getAssignToLabel(step.assignToCode),
        isDecisionPoint: tree.isDecisionPoint.has(id),
        isTerminating: tree.isTerminating.has(id),
        childStepIds: tree.childrenOf.get(id) ?? [],
        descendantCount: descendantsOf(id, tree.childrenOf).length,
        depth: depthOf.get(id) ?? 0,
        layoutDir: dir,
        returnCount: returnCountOf.get(id) ?? 0,
      } as HierarchyStepData,
      draggable: true,
      selectable: true,
    });

    if (!collapsedIds.has(id)) {
      for (const child of tree.childrenOf.get(id) ?? []) {
        if (hidden.has(child)) continue;
        edges.push({
          id: `h_e_${id}_${child}`,
          source: `step_${id}`,
          target: `step_${child}`,
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'smoothstep',
          pathOptions: { borderRadius: 16 },
          // The org chart draws quiet elbows with no arrowheads — direction
          // is carried by the hierarchy itself.
          style: { stroke: 'var(--border-strong)', strokeWidth: 1.6 },
          selectable: false,
        } as Edge);
      }
    }
  }

  returnLinks.forEach((link, laneIndex) => {
    edges.push({
      id: `h_ret_${link.id}`,
      source: `step_${link.stepId}`,
      target: `step_${link.nextStepId}`,
      sourceHandle: 'return-out',
      targetHandle: 'return-in',
      type: 'hierReturn',
      data: {
        label: link.name,
        gutter: gutterBase - laneIndex * 18,
        layoutDir: dir,
        sourceStepId: link.stepId,
        targetStepId: link.nextStepId as string,
      } as HierarchyReturnEdgeData,
      selectable: false,
      // Hidden until a mode, a hover, or a pin asks for it — the canvas flips
      // this flag; the builder only declares the geometry.
      hidden: true,
    } as Edge);
  });

  return { nodes, edges };
}
