import { useState, useCallback, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { WorkflowDataService } from '../services/WorkflowDataService';
import type { CrmProcess, WorkflowData } from '../types/ViewTypes';
import type { ViewMode } from '../types/ViewMode';
import type { LayoutDir } from '../services/WorkflowGraphBuilder';

export type LoadPhase =
  | 'idle'
  | 'loading-list'
  | 'loading-workflow'
  | 'ready'
  | 'error';

export interface WorkflowViewState {
  phase: LoadPhase;
  error: string | null;
  processList: CrmProcess[];
  data: WorkflowData | null;
  nodes: Node[];
  edges: Edge[];
  selectedId: string | null;
  viewMode: ViewMode;
  layoutDir: LayoutDir;
}

export interface WorkflowViewActions {
  loadProcessList(): Promise<void>;
  loadWorkflow(processId: string): Promise<void>;
  refresh(): Promise<void>;
  selectElement(id: string | null): void;
  setNodes(updater: (prev: Node[]) => Node[]): void;
  setEdges(updater: (prev: Edge[]) => Edge[]): void;
  setViewMode(mode: ViewMode): void;
  setLayoutDir(dir: LayoutDir): void;
}

export type WorkflowView = WorkflowViewState & WorkflowViewActions;

export function useWorkflowView(service: WorkflowDataService): WorkflowView {
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [processList, setProcessList] = useState<CrmProcess[]>([]);
  const [data, setData] = useState<WorkflowData | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('business');
  const [layoutDir, setLayoutDir] = useState<LayoutDir>('TB');

  const lastProcessId = useRef<string | null>(null);

  const loadProcessList = useCallback(async () => {
    setPhase('loading-list');
    setError(null);
    try {
      const list = await service.getProcesses();
      setProcessList(list);
      setPhase('idle');
    } catch (err) {
      setError(toErrorMessage(err));
      setPhase('error');
    }
  }, [service]);

  const loadWorkflow = useCallback(async (processId: string) => {
    setPhase('loading-workflow');
    setError(null);
    setSelectedId(null);
    setNodes([]);
    setEdges([]);
    lastProcessId.current = processId;

    try {
      const [process, steps] = await Promise.all([
        service.getProcessById(processId),
        service.getStepsByProcess(processId),
      ]);

      const outcomes = await service.getOutcomesByStepIds(steps.map((s) => s.id));

      const workflowData: WorkflowData = { process, steps, outcomes, routes: [] };
      setData(workflowData);
      setPhase('ready');
      // Graph building is handled by WorkflowCanvas which watches data + viewMode + layoutDir.
    } catch (err) {
      setError(toErrorMessage(err));
      setPhase('error');
    }
  }, [service]);

  const refresh = useCallback(async () => {
    if (lastProcessId.current) {
      await loadWorkflow(lastProcessId.current);
    } else {
      await loadProcessList();
    }
  }, [loadWorkflow, loadProcessList]);

  const selectElement = useCallback((id: string | null) => {
    setSelectedId(id);
  }, []);

  return {
    phase,
    error,
    processList,
    data,
    nodes,
    edges,
    selectedId,
    viewMode,
    layoutDir,
    loadProcessList,
    loadWorkflow,
    refresh,
    selectElement,
    setNodes,
    setEdges,
    setViewMode,
    setLayoutDir,
  };
}

function toErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null) {
    const obj = err as Record<string, unknown>;
    if (typeof obj['message'] === 'string') return obj['message'];
    return JSON.stringify(obj);
  }
  return String(err);
}
