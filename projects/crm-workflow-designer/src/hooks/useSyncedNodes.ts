import { useCallback, useEffect, useState } from 'react';
import { applyNodeChanges } from '@xyflow/react';
import type { Node, NodeChange } from '@xyflow/react';

interface UseSyncedNodesResult {
  nodes: Node[];
  onNodesChange: (changes: NodeChange[]) => void;
}

/**
 * Merges a freshly derived node blueprint with the dimensions React Flow has
 * already measured for the previous render of the same node ids.
 *
 * Why: React Flow only reports a node's size once, through a 'dimensions'
 * NodeChange. A blueprint rebuilt by useMemo starts every node without
 * `measured` again, so anything gated on nodeHasDimensions() — the minimap,
 * fit-on-init — sees an unmeasured graph even though the canvas renders fine.
 */
export function mergeMeasuredNodes(previous: Node[], blueprint: Node[]): Node[] {
  const previousById = new Map(previous.map((node) => [node.id, node]));
  return blueprint.map((node) => {
    const before = previousById.get(node.id);
    if (!before?.measured) return node;
    return { ...node, measured: before.measured, width: before.width, height: before.height };
  });
}

/**
 * Owns the node array a controlled React Flow canvas renders, rebuilding it
 * from `blueprint` while preserving measured dimensions, and applying every
 * NodeChange React Flow emits. Callers that persist positions (or anything
 * else) pass `onChanges` and react to the same change list.
 */
export function useSyncedNodes(
  blueprint: Node[],
  onChanges?: (changes: NodeChange[]) => void
): UseSyncedNodesResult {
  const [nodes, setNodes] = useState<Node[]>(blueprint);

  useEffect(() => {
    setNodes((previous) => mergeMeasuredNodes(previous, blueprint));
  }, [blueprint]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((previous) => applyNodeChanges(changes, previous));
      onChanges?.(changes);
    },
    [onChanges]
  );

  return { nodes, onNodesChange };
}
