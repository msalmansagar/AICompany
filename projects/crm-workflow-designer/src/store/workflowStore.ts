import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Node, Edge } from '@xyflow/react';
import type { CrmContext, EntityMetadata } from '../types/CrmTypes';

// React Flow requires data to extend Record<string,unknown>.
// We use unparameterised Node here and cast to our typed interfaces at read points.
type RfNode = Node;

interface WorkflowStore {
  nodes: RfNode[];
  edges: Edge[];
  setNodes: (nodes: RfNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;

  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;

  metadataCache: Record<string, EntityMetadata>;
  setEntityMetadata: (entity: string, meta: EntityMetadata) => void;

  viewMode: boolean;
  setViewMode: (on: boolean) => void;

  dirtyFlag: boolean;
  setDirty: (dirty: boolean) => void;

  crmContext: CrmContext | null;
  setCrmContext: (ctx: CrmContext) => void;

  toastMessage: string | null;
  toastType: 'error' | 'success' | null;
  showToast: (message: string, type: 'error' | 'success') => void;
  clearToast: () => void;
}

export const useWorkflowStore = create<WorkflowStore>()(
  subscribeWithSelector((set) => ({
    nodes: [],
    edges: [],
    setNodes: (nodes) => set({ nodes, dirtyFlag: true }),
    setEdges: (edges) => set({ edges, dirtyFlag: true }),
    updateNodeData: (id, data) =>
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        ),
        dirtyFlag: true,
      })),

    selectedNodeId: null,
    setSelectedNodeId: (id) => set({ selectedNodeId: id }),

    metadataCache: {},
    setEntityMetadata: (entity, meta) =>
      set((state) => ({
        metadataCache: { ...state.metadataCache, [entity]: meta },
      })),

    viewMode: false,
    setViewMode: (on) => set({ viewMode: on }),

    dirtyFlag: false,
    setDirty: (dirty) => set({ dirtyFlag: dirty }),

    crmContext: null,
    setCrmContext: (ctx) => set({ crmContext: ctx }),

    toastMessage: null,
    toastType: null,
    showToast: (message, type) => set({ toastMessage: message, toastType: type }),
    clearToast: () => set({ toastMessage: null, toastType: null }),
  }))
);
