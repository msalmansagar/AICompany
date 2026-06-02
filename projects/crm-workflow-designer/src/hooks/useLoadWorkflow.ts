import { useState, useCallback } from 'react';
import { useCrmAdapter } from '@/app/CrmAdapterContext';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowOutcome, WorkflowRoute } from '@/types/WorkflowTypes';

interface UseLoadWorkflowResult {
  isLoading: boolean;
  error: string | null;
  loadProcess: (processId: string) => Promise<void>;
  loadProcessList: () => Promise<Array<{ id: string; name: string; state: string }>>;
}

export function useLoadWorkflow(): UseLoadWorkflowResult {
  const adapter = useCrmAdapter();
  const { loadWorkflow } = useWorkflowStore((s) => ({ loadWorkflow: s.loadWorkflow }));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProcessList = useCallback(async () => {
    const processes = await adapter.getProcessList();
    return processes.map((p) => ({
      id: p.crmId,
      name: p.name || '(Unnamed)',
      state: p.workflowState,
    }));
  }, [adapter]);

  const loadProcess = useCallback(async (processId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [process, steps] = await Promise.all([
        adapter.getProcess(processId),
        adapter.getSteps(processId),
      ]);

      const allOutcomes: WorkflowOutcome[] = [];
      const allRoutes: WorkflowRoute[] = [];

      for (const step of steps) {
        const outcomes = await adapter.getOutcomes(step.crmId);
        allOutcomes.push(...outcomes);
        for (const outcome of outcomes) {
          const routes = await adapter.getRoutes(outcome.crmId);
          allRoutes.push(...routes);
        }
      }

      loadWorkflow(process, steps, allOutcomes, allRoutes, {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load workflow.');
    } finally {
      setIsLoading(false);
    }
  }, [adapter, loadWorkflow]);

  return { isLoading, error, loadProcess, loadProcessList };
}
