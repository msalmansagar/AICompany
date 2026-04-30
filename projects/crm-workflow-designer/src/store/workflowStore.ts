import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Node, Edge } from '@xyflow/react';
import type { CrmContext, EntityMetadata } from '../types/CrmTypes';

type RfNode = Node;

interface WorkflowStore {
  // pending load — set when a workflow is loaded from CRM, consumed once by WorkflowCanvas
  pendingLoad: { nodes: RfNode[]; edges: Edge[] } | null;
  setPendingLoad: (payload: { nodes: RfNode[]; edges: Edge[] } | null) => void;

  // node data patches — applied to RF nodes via updateNodeData
  nodeDataPatches: Record<string, Record<string, unknown>>;
  updateNodeData: (id: string, data: Record<string, unknown>) => void;
  clearNodeDataPatch: (id: string) => void;

  // node deletion queue — consumed by WorkflowCanvas
  pendingDelete: string | null;
  deleteNode: (id: string) => void;
  clearPendingDelete: () => void;

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
    pendingLoad: null,
    setPendingLoad: (payload) => set({ pendingLoad: payload, dirtyFlag: false }),

    nodeDataPatches: {},
    updateNodeData: (id, data) =>
      set((state) => ({
        nodeDataPatches: {
          ...state.nodeDataPatches,
          [id]: { ...(state.nodeDataPatches[id] ?? {}), ...data },
        },
        dirtyFlag: true,
      })),
    clearNodeDataPatch: (id) =>
      set((state) => {
        const patches = { ...state.nodeDataPatches };
        delete patches[id];
        return { nodeDataPatches: patches };
      }),

    pendingDelete: null,
    deleteNode: (id) =>
      set((state) => ({
        pendingDelete: id,
        selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
        dirtyFlag: true,
      })),
    clearPendingDelete: () => set({ pendingDelete: null }),

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
