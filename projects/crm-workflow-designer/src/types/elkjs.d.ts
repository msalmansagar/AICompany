declare module 'elkjs/lib/elk.bundled.js' {
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
  class ELK {
    layout(graph: ElkGraph): Promise<ElkNode>;
  }
  export default ELK;
}
