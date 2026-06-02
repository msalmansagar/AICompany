import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { LayoutService } from '@/services/LayoutService';
import { useWorkflowStore } from '@/store/workflowStore';

const layoutService = new LayoutService();

export function useAutoLayout() {
  const { getNodes, getEdges } = useReactFlow();
  const updateNodePosition = useWorkflowStore((s) => s.updateNodePosition);

  const applyAutoLayout = useCallback(async () => {
    const nodes = getNodes();
    const edges = getEdges();

    const results = await layoutService.layoutWithElk(nodes, edges);

    for (const result of results) {
      updateNodePosition(result.id, { x: result.x, y: result.y });
    }
  }, [getNodes, getEdges, updateNodePosition]);

  return { applyAutoLayout };
}
