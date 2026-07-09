import dagre from '@dagrejs/dagre';

const EDIT_STEP_W = 260;
const EDIT_STEP_H = 72;

const START_ID = 'edit_start';
const END_ID = 'edit_end';

interface OutcomeEdge {
  stepId: string;
  nextStepId: string | null;
}

/**
 * Computes TB Dagre layout positions for all edit-mode nodes.
 * Returns a flat map of nodeId → {x, y} using the same key convention
 * as nodePositions in the store (`step_<id>`, `edit_start`, `edit_end`).
 */
export function computeEditLayout(
  stepIds: string[],
  outcomes: OutcomeEdge[]
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: 80, nodesep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  g.setNode(START_ID, { width: 40, height: 40 });
  g.setNode(END_ID, { width: 40, height: 40 });

  for (const id of stepIds) {
    g.setNode(`step_${id}`, { width: EDIT_STEP_W, height: EDIT_STEP_H });
  }

  if (stepIds[0]) {
    g.setEdge(START_ID, `step_${stepIds[0]}`);
  }

  const addedEdges = new Set<string>();
  for (const o of outcomes) {
    const src = `step_${o.stepId}`;
    const tgt = o.nextStepId ? `step_${o.nextStepId}` : END_ID;
    if (!g.hasNode(src) || !g.hasNode(tgt)) continue;
    const key = `${src}→${tgt}`;
    if (!addedEdges.has(key)) {
      g.setEdge(src, tgt);
      addedEdges.add(key);
    }
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const nodeId of g.nodes()) {
    const n = g.node(nodeId);
    positions[nodeId] = { x: n.x - n.width / 2, y: n.y - n.height / 2 };
  }
  return positions;
}
