import type { Node, Edge } from '@xyflow/react';
import type { WorkflowDefinition, WorkflowNode, WorkflowEdge, NodeType } from '../types/WorkflowTypes';

export function serialize(nodes: Node[], edges: Edge[]): WorkflowDefinition {
  return {
    version: '1.0',
    nodes: nodes.map(serializeNode),
    edges: edges.map(serializeEdge),
  };
}

export function deserialize(definition: WorkflowDefinition): {
  nodes: Node[];
  edges: Edge[];
} {
  return {
    nodes: definition.nodes.map(deserializeNode),
    edges: definition.edges.map(deserializeEdge),
  };
}

function serializeNode(node: Node): WorkflowNode {
  return {
    id: node.id,
    type: (node.type ?? 'end') as NodeType,
    position: node.position,
    data: node.data as WorkflowNode['data'],
  };
}

function deserializeNode(node: WorkflowNode): Node {
  return {
    id: node.id,
    type: node.type,
    position: node.position,
    data: node.data as Record<string, unknown>,
  };
}

function serializeEdge(edge: Edge): WorkflowEdge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label as WorkflowEdge['label'],
  };
}

function deserializeEdge(edge: WorkflowEdge): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
  };
}
