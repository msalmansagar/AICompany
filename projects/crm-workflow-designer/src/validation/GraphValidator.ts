import type { WorkflowNode, WorkflowEdge } from '../types/WorkflowTypes';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult {
  const errors: string[] = [];

  const triggers = nodes.filter((n) => n.type === 'trigger');
  if (triggers.length === 0) errors.push('A Trigger node is required.');
  if (triggers.length > 1) errors.push('Only one Trigger node is allowed.');
  if (errors.length > 0) return { valid: false, errors };

  const trigger = triggers[0];

  const unreachable = findUnreachableNodes(trigger.id, nodes, edges);
  if (unreachable.length > 0) {
    errors.push(`Disconnected nodes detected (${unreachable.length}). All nodes must connect to the workflow.`);
  }

  for (const conditionNode of nodes.filter((n) => n.type === 'condition')) {
    const outgoing = edges.filter((e) => e.source === conditionNode.id);
    if (outgoing.length !== 2) {
      errors.push(`Condition node must have exactly two branches (True and False).`);
    } else {
      const labels = outgoing.map((e) => e.label);
      if (!labels.includes('true') || !labels.includes('false')) {
        errors.push(`Condition node branches must be labelled "true" and "false".`);
      }
    }
  }

  if (hasCycle(trigger.id, edges)) {
    errors.push('Workflow contains a loop. All branches must terminate at an End node.');
  }

  if (!allPathsTerminate(trigger.id, nodes, edges, new Set())) {
    errors.push('One or more branches do not terminate at an End node.');
  }

  return { valid: errors.length === 0, errors };
}

function findUnreachableNodes(
  startId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): WorkflowNode[] {
  const reachable = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    edges.filter((e) => e.source === current).forEach((e) => queue.push(e.target));
  }
  return nodes.filter((n) => !reachable.has(n.id));
}

function hasCycle(startId: string, edges: WorkflowEdge[]): boolean {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const colour: Record<string, number> = {};

  function dfs(nodeId: string): boolean {
    colour[nodeId] = GRAY;
    for (const edge of edges.filter((e) => e.source === nodeId)) {
      const state = colour[edge.target] ?? WHITE;
      if (state === GRAY) return true;
      if (state === WHITE && dfs(edge.target)) return true;
    }
    colour[nodeId] = BLACK;
    return false;
  }

  return dfs(startId);
}

function allPathsTerminate(
  nodeId: string,
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  visited: Set<string>
): boolean {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return false;
  if (node.type === 'end') return true;
  if (visited.has(nodeId)) return false;

  const outgoing = edges.filter((e) => e.source === nodeId);
  if (outgoing.length === 0) return false;

  return outgoing.every((e) =>
    allPathsTerminate(e.target, nodes, edges, new Set([...visited, nodeId]))
  );
}
