# Phase 3 — Solution Architecture: CRM Visual Workflow Designer

**Project:** CRM Visual Workflow Designer
**Prepared by:** Maqsad AI — Architect
**Date:** 2026-04-30
**Version:** 1.0
**Status:** Approved for Build

---

## 1. Architecture Overview

The designer is a self-contained single-page React application bundled by Vite into one `.htm` file and deployed as a CRM HTML Web Resource. It runs entirely in the browser — no server-side component, no build-time CRM dependency. All runtime data flows through the CRM session that hosts the web resource.

```
┌──────────────────────────────────────────────────────────────────┐
│  Edge Chromium 110+  (CRM session, authenticated)                │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  workflow-designer.htm  (HTML Web Resource)             │    │
│  │                                                         │    │
│  │  ┌──────────────┐   ┌───────────────┐  ┌────────────┐  │    │
│  │  │  React Flow  │   │  Config Panel │  │  Toolbar   │  │    │
│  │  │  Canvas      │◄──│  (per node)   │  │  Save/Load │  │    │
│  │  └──────┬───────┘   └───────────────┘  └─────┬──────┘  │    │
│  │         │                                     │         │    │
│  │  ┌──────▼─────────────────────────────────────▼──────┐  │    │
│  │  │  Zustand Store  (nodes, edges, selection, mode)   │  │    │
│  │  └──────────────────────────┬────────────────────────┘  │    │
│  │                             │                            │    │
│  │  ┌──────────────────────────▼────────────────────────┐  │    │
│  │  │  Service Layer                                    │  │    │
│  │  │  CrmApiService  │  MetadataService  │  Serializer │  │    │
│  │  └──────────┬───────────────┬──────────────────────-─┘  │    │
│  └─────────────┼───────────────┼──────────────────────────-┘    │
│                │               │                                  │
│  ┌─────────────▼──┐   ┌────────▼────────────────────────────┐   │
│  │  Xrm JS API    │   │  CRM Web API  /api/data/v9.2/        │   │
│  │  (context)     │   │  - EntityDefinitions (metadata)      │   │
│  └────────────────┘   │  - wf_workflowdefinitions (save/load)│   │
│                        └─────────────────────────────────────┘   │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Existing CRM Plugin  (unchanged — reads workflow JSON)   │   │
│  └───────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

**Key architectural properties:**
- Zero server-side code — frontend only
- All CRM calls inherit the active session cookie (no separate auth)
- Single deployable artifact: `workflow-designer.htm` (~3–4MB gzipped in browser)
- React Flow handles all canvas rendering and interaction
- The existing execution plugin is never called by the designer

---

## 2. Component Architecture

### Layers

```
App.tsx
 └── WorkflowCanvas.tsx          ← ReactFlowProvider + canvas
      ├── TriggerNode.tsx         ← custom node renderers (5 types)
      ├── ConditionNode.tsx
      ├── ActionNode.tsx
      ├── ApprovalNode.tsx
      ├── EndNode.tsx
      ├── Toolbar.tsx             ← Add Node, Save, Load, Validate, View Mode toggle
      ├── NodeConfigPanel.tsx     ← dispatches to per-type panels
      │    ├── TriggerConfigPanel.tsx
      │    ├── ConditionConfigPanel.tsx
      │    ├── ActionConfigPanel.tsx
      │    └── ApprovalConfigPanel.tsx
      └── ValidationToast.tsx     ← error / success banner
```

### Component responsibilities

| Component | Responsibility |
|---|---|
| `App.tsx` | Reads CRM context on mount, initialises store, renders canvas or error state |
| `WorkflowCanvas.tsx` | Mounts `<ReactFlow>` with custom node types, handles node/edge callbacks |
| `*Node.tsx` (5 files) | Renders each node type on canvas; shows label, type badge, selection ring |
| `Toolbar.tsx` | Add-node dropdown, Save, Load, Validate, View Mode toggle |
| `NodeConfigPanel.tsx` | Slide-in panel; switches to correct sub-panel based on selected node type |
| `*ConfigPanel.tsx` (4 files) | Form fields for each node type; reads/writes to Zustand store |
| `ValidationToast.tsx` | Displays validation errors or save success; auto-dismisses after 5s |

---

## 3. State Management

### React Flow state (local to canvas)
`useNodesState` and `useEdgesState` from `@xyflow/react` manage the visual positions and connection topology. These are the source of truth for the graph structure.

### Zustand workflow store
One store, four slices:

```typescript
interface WorkflowStore {
  // Graph
  nodes: Node<NodeData>[];
  edges: Edge[];
  setNodes: (nodes: Node<NodeData>[]) => void;
  setEdges: (edges: Edge[]) => void;

  // Selection
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  updateNodeData: (id: string, data: Partial<NodeData>) => void;

  // Metadata cache
  metadataCache: Record<string, EntityMetadata>;
  setEntityMetadata: (entity: string, meta: EntityMetadata) => void;

  // UI state
  viewMode: boolean;
  dirtyFlag: boolean;
  setViewMode: (on: boolean) => void;
  setDirty: (dirty: boolean) => void;

  // CRM context
  crmContext: CrmContext | null;
  setCrmContext: (ctx: CrmContext) => void;
}
```

**Why Zustand over useReducer:** Zustand adds ~3KB gzip to the bundle (within 5MB budget), eliminates prop-drilling between canvas and config panels without action boilerplate, and its `subscribeWithSelector` allows the config panel to subscribe only to `selectedNodeId` changes — avoiding full re-renders on every graph edit.

---

## 4. CRM Integration Design

### 4.1 Context on load

```typescript
// useCrmContext.ts — priority order:
// 1. Xrm.Page (opened from CRM form button)
// 2. window.parent.Xrm (opened in iframe)
// 3. URL params ?recordId=&entityName= (opened directly)

function readCrmContext(): CrmContext {
  const xrm = window.Xrm ?? window.parent?.Xrm;
  if (xrm?.Page?.data) {
    return {
      recordId: xrm.Page.data.entity.getId(),
      entityName: xrm.Page.data.entity.getEntityName(),
      userId: xrm.Page.context.getUserId(),
    };
  }
  const params = new URLSearchParams(window.location.search);
  return {
    recordId: params.get('recordId') ?? null,
    entityName: params.get('entityName') ?? null,
    userId: null,
  };
}
```

### 4.2 Metadata loading

```
GET /api/data/v9.2/EntityDefinitions(LogicalName='{entity}')/Attributes
    ?$filter=IsValidForAdvancedFind eq true
    &$select=LogicalName,DisplayName,AttributeType
Headers:
  OData-Version: 4.0
  OData-MaxVersion: 4.0
  Accept: application/json
  Prefer: odata.include-annotations="*"
```

Cached per entity logical name in Zustand `metadataCache`. No TTL needed — metadata does not change during a designer session.

### 4.3 Save workflow

```
// New record
POST /api/data/v9.2/wf_workflowdefinitions
Body: { wf_name: string, wf_definition: string (JSON), wf_targetentity: string }

// Existing record
PATCH /api/data/v9.2/wf_workflowdefinitions({id})
Body: { wf_definition: string (JSON) }
```

Pre-save: byte-size check (`new Blob([json]).size`). Warn at 90KB, block at 100KB.

### 4.4 Load workflow

```
GET /api/data/v9.2/wf_workflowdefinitions({id})
    ?$select=wf_name,wf_definition,wf_targetentity
```

`wf_definition` is parsed, validated as `WorkflowDefinition`, then deserialized into React Flow nodes/edges via `WorkflowSerializer.deserialize()`.

---

## 5. JSON Schema

This is the contract between the designer and the existing execution plugin. **All field names must be verified against the plugin source before build starts (BRD Risk R1).**

```typescript
// types/WorkflowTypes.ts

export interface WorkflowDefinition {
  version: '1.0';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowNode {
  id: string;                          // UUID v4
  type: NodeType;
  position: { x: number; y: number };  // canvas coordinates (designer use only)
  data: NodeData;
}

export type NodeType = 'trigger' | 'condition' | 'action' | 'approval' | 'end';

export interface WorkflowEdge {
  id: string;
  source: string;                      // node id
  target: string;                      // node id
  label?: 'true' | 'false';           // required on Condition node outgoing edges
}

// --- Node data types ---

export interface TriggerNodeData {
  entity: string;                      // CRM entity logical name
  event: 'created' | 'updated' | 'deleted';
  filterField?: string;
  filterOperator?: CompareOperator;
  filterValue?: string;
}

export interface ConditionNodeData {
  field: string;
  operator: CompareOperator;
  value?: string;
}

export type CompareOperator =
  | 'eq' | 'ne' | 'gt' | 'lt' | 'ge' | 'le'
  | 'contains' | 'beginswith' | 'null' | 'notnull';

export type ActionNodeData =
  | UpdateFieldAction
  | CreateRecordAction
  | SendEmailAction
  | AssignAction
  | WaitAction;

export interface UpdateFieldAction {
  actionType: 'updateField';
  entity: string;
  field: string;
  value: string;
}

export interface CreateRecordAction {
  actionType: 'createRecord';
  entity: string;
  fieldMappings: Array<{ field: string; value: string }>;
}

export interface SendEmailAction {
  actionType: 'sendEmail';
  templateId: string;
  recipientField: string;
}

export interface AssignAction {
  actionType: 'assign';
  assignToType: 'user' | 'team';
  assignToId: string;
  assignToName: string;
}

export interface WaitAction {
  actionType: 'wait';
  durationMinutes: number;
}

export interface ApprovalNodeData {
  assignToType: 'user' | 'team';
  assignToId: string;
  assignToName: string;
  approvalField: string;
  approvedValue: string;
  rejectedValue: string;
}

export type NodeData =
  | TriggerNodeData
  | ConditionNodeData
  | ActionNodeData
  | ApprovalNodeData
  | Record<string, never>;  // End node has no data
```

---

## 6. Build Pipeline

### vite.config.ts strategy

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,   // inline everything
    rollupOptions: {
      output: {
        inlineDynamicImports: true,   // single JS chunk
        entryFileNames: 'workflow-designer.js',
        assetFileNames: 'workflow-designer.[ext]',
      },
    },
    target: 'es2020',                 // Edge 110+ supports ES2020
  },
  // Post-build: rename dist/index.html → dist/workflow-designer.htm
});
```

### Bundle composition estimate

| Package | Gzip size |
|---|---|
| react + react-dom | ~45KB |
| @xyflow/react v12 | ~90KB |
| zustand | ~3KB |
| Application code | ~50KB |
| React Flow CSS (inlined) | ~20KB |
| **Total estimate** | **~210KB gzip / ~700KB raw** |

Well within the 5MB limit. No tree-shaking exceptions needed.

### Single-file output

After build, `dist/index.html` contains all JS and CSS inlined. A post-build script renames it to `workflow-designer.htm`. This file is the CRM web resource artifact.

---

## 7. Validation Engine

```typescript
// validation/GraphValidator.ts

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateGraph(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): ValidationResult {
  const errors: string[] = [];

  // Rule 1: exactly one Trigger node
  const triggers = nodes.filter(n => n.type === 'trigger');
  if (triggers.length === 0) errors.push('A Trigger node is required.');
  if (triggers.length > 1) errors.push('Only one Trigger node is allowed.');
  if (errors.length > 0) return { valid: false, errors };

  const trigger = triggers[0];

  // Rule 2: all nodes reachable from trigger (BFS)
  const reachable = new Set<string>();
  const queue = [trigger.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    edges.filter(e => e.source === current).forEach(e => queue.push(e.target));
  }
  const unreachable = nodes.filter(n => !reachable.has(n.id));
  if (unreachable.length > 0) {
    errors.push(`Disconnected nodes: ${unreachable.map(n => n.id).join(', ')}`);
  }

  // Rule 3: Condition nodes must have exactly 2 outgoing edges (true + false)
  nodes.filter(n => n.type === 'condition').forEach(node => {
    const outgoing = edges.filter(e => e.source === node.id);
    if (outgoing.length !== 2) {
      errors.push(`Condition node "${node.id}" must have exactly 2 branches (True and False).`);
    } else {
      const labels = outgoing.map(e => e.label);
      if (!labels.includes('true') || !labels.includes('false')) {
        errors.push(`Condition node "${node.id}" branches must be labelled "true" and "false".`);
      }
    }
  });

  // Rule 4: cycle detection (DFS with colour marking)
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const colour: Record<string, number> = {};
  nodes.forEach(n => { colour[n.id] = WHITE; });

  function dfs(nodeId: string): boolean {
    colour[nodeId] = GRAY;
    for (const edge of edges.filter(e => e.source === nodeId)) {
      if (colour[edge.target] === GRAY) return true;  // back edge = cycle
      if (colour[edge.target] === WHITE && dfs(edge.target)) return true;
    }
    colour[nodeId] = BLACK;
    return false;
  }
  if (dfs(trigger.id)) {
    errors.push('Workflow contains a cycle. All branches must terminate at an End node.');
  }

  // Rule 5: every branch path terminates at an End node
  function pathTerminates(nodeId: string, visited: Set<string>): boolean {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return false;
    if (node.type === 'end') return true;
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);
    const outgoing = edges.filter(e => e.source === nodeId);
    if (outgoing.length === 0) return false;
    return outgoing.every(e => pathTerminates(e.target, new Set(visited)));
  }
  if (!pathTerminates(trigger.id, new Set())) {
    errors.push('One or more branches do not terminate at an End node.');
  }

  return { valid: errors.length === 0, errors };
}
```

---

## 8. Architecture Decision Records

### ADR-001: Adopt @xyflow/react v12 over alternatives

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-04-30 |
| **Context** | Need a React node-graph editor. GitHub researcher evaluated: reaviz/reaflow (Apache-2, WASM/ELK.js dependency blocks single-file bundle), nocode-js/sequential-workflow-designer (MIT dual-tier, sequential layout only — wrong topology for free-form CRM graph). |
| **Decision** | Adopt `@xyflow/react` v12.10.2. MIT, 24k+ stars, actively maintained, zero non-React runtime dependencies, first-class TypeScript, embeddable React component. |
| **Consequences** | ~90KB gzip added to bundle (well within 5MB). React Flow CSS must be inlined via Vite config. Use `proOptions={{ hideAttribution: true }}` — MIT-permitted, no subscription required. |

---

### ADR-002: Vite over esbuild/webpack

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-04-30 |
| **Context** | CRM web resources are single files — no CDN, no external assets, no module loader at runtime. The build output must be one `.htm` file with all JS, CSS, and assets inlined. |
| **Decision** | Vite with `inlineDynamicImports: true`, `assetsInlineLimit: 100_000_000`, `cssCodeSplit: false`. Vite's Rollup-based output handles HTML generation and asset inlining with less configuration than webpack. Raw esbuild CLI lacks HTML-with-inlining support. |
| **Consequences** | Build is ~5s (acceptable). Output is a single `workflow-designer.htm` ready for CRM import. No CDN dependency at runtime. |

---

### ADR-003: Zustand over useReducer

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-04-30 |
| **Context** | State must be shared across WorkflowCanvas, NodeConfigPanel (slide-in), Toolbar, and ValidationToast — components that are not in a direct parent-child relationship. |
| **Decision** | Zustand (~3KB gzip). One store with four logical slices: graph state, selection, metadata cache, UI flags. `subscribeWithSelector` avoids unnecessary re-renders. |
| **Consequences** | 3KB bundle addition (negligible). No Redux boilerplate. Config panel subscribes only to `selectedNodeId` — avoids re-render on every canvas drag. |

---

### ADR-004: Direct fetch() over Xrm.WebApi for metadata

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-04-30 |
| **Context** | `Xrm.WebApi` exposes only data CRUD operations. The `EntityDefinitions` metadata endpoint (`/api/data/v9.2/EntityDefinitions(...)`) is not accessible via `Xrm.WebApi`. |
| **Decision** | Use direct `fetch('/api/data/v9.2/EntityDefinitions...')`. Browser inherits the CRM session cookie automatically. Headers: `OData-Version: 4.0`, `Accept: application/json`, `Prefer: odata.include-annotations="*"`. |
| **Consequences** | Bypasses Xrm SDK for metadata calls only. Acceptable — calls are read-only and session-scoped. Data save/load still uses the same fetch pattern for consistency. |

---

### ADR-005: Inline CSS via Vite assetsInlineLimit

| | |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-04-30 |
| **Context** | React Flow ships its own CSS (`@xyflow/react/dist/style.css`). CRM web resources cannot load external stylesheets at runtime. CSS modules produce separate `.css` files by default. |
| **Decision** | Import React Flow CSS directly in `main.tsx`. Set `assetsInlineLimit: 100_000_000` and `cssCodeSplit: false` in Vite config. Vite injects all CSS into the HTML `<style>` tag. |
| **Consequences** | Slightly larger HTML file. All styles are self-contained — no external CSS dependency at runtime. |

---

## 9. Risk Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **R1: Plugin JSON schema undocumented** | HIGH | `WorkflowDefinition` TypeScript interface (Section 5) defines the contract. Delivery team must obtain the execution plugin source or schema documentation and verify that `version`, node `type` strings, edge `label` values, and all `data` field names match exactly. Add `version: '1.0'` as a forward-compatibility marker. |
| **R2: JSON field size unknown** | HIGH | `WorkflowSerializer.serialize()` returns the JSON string. `CrmApiService.save()` checks `new Blob([json]).size` before the PATCH call: warn toast at 90KB, block with error at 100KB. |
| **R3: Allowed-list config entity unknown** | HIGH | `MetadataService.loadAllowedEntities()` attempts to read from a config entity. If the entity name is not provided, fall back to `config/allowedEntities.ts` (hardcoded array). Config entity name is a single constant — easy to update when client provides it. |
| **R4: CSP blocks inline scripts** | MEDIUM | CRM on-premise v9.1 does not enforce strict CSP by default. React 18 does not use `eval()`. Vite ES2020 output is CSP-safe. If CSP is enforced in the client's environment, the web resource requires a `nonce` attribute — raise with IT before deployment. |

---

## 10. Directory Structure

```
projects/crm-workflow-designer/
├── phase-2-ba.md
├── phase-3-arch.md                        ← this document
├── dependencies.md                         ← @xyflow/react adoption record
├── src/
│   ├── main.tsx                            ← Vite entry, imports RF CSS, mounts <App>
│   ├── App.tsx                             ← reads CRM context, init store, render
│   ├── config/
│   │   └── allowedEntities.ts              ← fallback allowed-list
│   ├── types/
│   │   ├── WorkflowTypes.ts                ← all interfaces from Section 5
│   │   └── CrmTypes.ts                     ← EntityMetadata, AttributeMetadata, CrmContext
│   ├── store/
│   │   └── workflowStore.ts                ← Zustand store
│   ├── services/
│   │   ├── CrmApiService.ts                ← fetch wrapper: save, load, context headers
│   │   ├── MetadataService.ts              ← entity/attribute loading + cache
│   │   └── WorkflowSerializer.ts           ← WorkflowDefinition ↔ RF nodes/edges
│   ├── validation/
│   │   └── GraphValidator.ts               ← DFS validation engine (Section 7)
│   ├── hooks/
│   │   └── useCrmContext.ts                ← Xrm / URL param context reader
│   ├── nodes/
│   │   ├── nodeTypes.ts                    ← RF nodeTypes map
│   │   ├── TriggerNode.tsx
│   │   ├── ConditionNode.tsx
│   │   ├── ActionNode.tsx
│   │   ├── ApprovalNode.tsx
│   │   └── EndNode.tsx
│   ├── panels/
│   │   ├── NodeConfigPanel.tsx             ← dispatcher
│   │   ├── TriggerConfigPanel.tsx
│   │   ├── ConditionConfigPanel.tsx
│   │   ├── ActionConfigPanel.tsx
│   │   └── ApprovalConfigPanel.tsx
│   └── components/
│       ├── WorkflowCanvas.tsx              ← <ReactFlow> provider + canvas
│       ├── Toolbar.tsx
│       └── ValidationToast.tsx
├── index.html                              ← Vite HTML template
├── vite.config.ts
├── tsconfig.json
└── package.json
```
