import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 200;
const NODE_HEIGHT = 80;

export interface LayoutResult {
  id: string;
  x: number;
  y: number;
}

export class LayoutService {
  layoutWithDagre(nodes: Node[], edges: Edge[]): LayoutResult[] {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 });

    for (const node of nodes) {
      graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }

    for (const edge of edges) {
      graph.setEdge(edge.source, edge.target);
    }

    dagre.layout(graph);

    return nodes.map((node) => {
      const positioned = graph.node(node.id);
      return {
        id: node.id,
        x: positioned.x - NODE_WIDTH / 2,
        y: positioned.y - NODE_HEIGHT / 2,
      };
    });
  }

  async layoutWithElk(nodes: Node[], edges: Edge[]): Promise<LayoutResult[]> {
    try {
      const elkModule = await import('elkjs/lib/elk.bundled.js');
      const ELK = elkModule.default ?? elkModule;
      const elk = new (ELK as new () => ElkInstance)();

      const elkNodes = nodes.map((n) => ({
        id: n.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      }));

      const elkEdges = edges.map((e) => ({
        id: e.id,
        sources: [e.source],
        targets: [e.target],
      }));

      const result = await elk.layout({
        id: 'root',
        layoutOptions: {
          'elk.algorithm': 'layered',
          'elk.direction': 'DOWN',
          'elk.spacing.nodeNode': '60',
          'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        },
        children: elkNodes,
        edges: elkEdges,
      });

      return (result.children ?? []).map((n) => ({
        id: n.id,
        x: n.x ?? 0,
        y: n.y ?? 0,
      }));
    } catch {
      return this.layoutWithDagre(nodes, edges);
    }
  }
}

interface ElkNode {
  id: string;
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  edges?: ElkEdge[];
}

interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
}

interface ElkGraph {
  id: string;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  edges?: ElkEdge[];
}

interface ElkInstance {
  layout(graph: ElkGraph): Promise<ElkNode>;
}
