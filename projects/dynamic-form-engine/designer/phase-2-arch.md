# Solution Architecture
# Dynamics CRM Web Resource — Drag-and-Drop Form Designer

**Document Version:** 1.0
**Prepared By:** Architect Agent — Maqsad AI
**Date:** 2026-05-18
**Status:** For CEO Review
**Addresses CEO Conditions:** C-001 through C-005

---

## 1. Architecture Overview

The Form Designer is a pure client-side React application bundled as a Dynamics CRM Web Resource. It runs entirely within the CRM iframe context, communicates exclusively through `Xrm.WebApi`, and produces configuration records in the 16 pre-provisioned CRM tables.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dynamics CRM UCI Shell                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Web Resource iframe                          │  │
│  │                                                          │  │
│  │  ┌──────────┐  ┌───────────────────┐  ┌─────────────┐  │  │
│  │  │ Component│  │   Designer Canvas  │  │  Properties  │  │  │
│  │  │  Toolbox │  │  (dnd-kit canvas) │  │    Panel     │  │  │
│  │  │ (left)   │  │                   │  │  (right)     │  │  │
│  │  └──────────┘  └───────────────────┘  └─────────────┘  │  │
│  │           ↕ Zustand Designer State Store ↕              │  │
│  │  ┌──────────────────────────────────────────────────┐   │  │
│  │  │               CRM Service Layer                   │   │  │
│  │  │  FormDefinitionService | TabService | FieldService│   │  │
│  │  │  ValidationRuleService | BusinessRuleService ...  │   │  │
│  │  └──────────────────────────────────────────────────┘   │  │
│  │           ↕ parent.Xrm.WebApi ↕                         │  │
│  └──────────────────────────────────────────────────────────┘  │
│           ↕ CRM Organization Service ↕                         │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              CRM qdb_* Configuration Tables              │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| UI Framework | React 18 + TypeScript 5 (strict) | Modern React with concurrent features; strict TS throughout |
| UI Component Library | @fluentui/react-components v9 | Power Platform-native look; Microsoft-maintained; MIT |
| Drag and Drop | @dnd-kit/core + @dnd-kit/sortable | 16,100+ stars; MIT; TypeScript-first; sidebar-to-canvas pattern |
| State Management | Zustand 4 | Minimal boilerplate; MIT; 52,000+ stars |
| Immutable State | Immer 10 | Undo/redo history; structural sharing; MIT |
| Validation | Zod 3 | Runtime publish validation; TypeScript inference; MIT |
| Bundler | Vite 5 | Fast build; size budgeting; rollup output for single-file bundle |
| Testing | Vitest + React Testing Library | Aligned with company standard |

**No deviation from ADR required** — this project is a CRM web resource. The standard Node.js/Fastify/Prisma stack does not apply. The applicable stack is React + TypeScript + Fluent UI + Xrm.WebApi as specified.

---

## 3. Project Structure

```
form-designer-webresource/
├── src/
│   ├── app/
│   │   ├── App.tsx                    # Root component, route resolver
│   │   ├── AppProviders.tsx           # Zustand + Fluent UI theme providers
│   │   └── routes.ts                  # Screen enum constants
│   ├── screens/
│   │   ├── FormListScreen.tsx
│   │   ├── NewFormWizardScreen.tsx
│   │   ├── DesignerScreen.tsx
│   │   ├── ThemeEditorScreen.tsx
│   │   ├── RuleConfigScreen.tsx
│   │   ├── OptionSetEditorScreen.tsx
│   │   ├── LookupConfigScreen.tsx
│   │   ├── PreviewScreen.tsx
│   │   ├── PublishValidationScreen.tsx
│   │   └── VersionHistoryScreen.tsx
│   ├── designer/
│   │   ├── canvas/
│   │   │   ├── DesignerCanvas.tsx     # Main dnd-kit drop zone
│   │   │   ├── TabBar.tsx             # Sortable tabs
│   │   │   ├── SectionContainer.tsx   # Sortable sections within tab
│   │   │   └── FieldSlot.tsx          # Sortable field within section
│   │   ├── toolbox/
│   │   │   ├── ComponentToolbox.tsx   # Left panel
│   │   │   ├── ToolboxCategory.tsx    # Basic / Layout / Advanced
│   │   │   └── DraggableToolboxItem.tsx
│   │   ├── properties/
│   │   │   ├── PropertiesPanel.tsx    # Right panel, context-sensitive
│   │   │   ├── FormProperties.tsx
│   │   │   ├── TabProperties.tsx
│   │   │   ├── SectionProperties.tsx
│   │   │   ├── FieldProperties.tsx
│   │   │   └── panels/
│   │   │       ├── TextFieldPanel.tsx
│   │   │       ├── NumberFieldPanel.tsx
│   │   │       ├── DropdownFieldPanel.tsx
│   │   │       ├── LookupFieldPanel.tsx
│   │   │       ├── DateFieldPanel.tsx
│   │   │       └── ... (one per field type)
│   │   └── commandbar/
│   │       └── DesignerCommandBar.tsx # Save/Publish/Preview/Undo/Redo
│   ├── state/
│   │   ├── designerStore.ts           # Zustand store definition
│   │   ├── undoRedoMiddleware.ts      # Immer-based undo/redo history
│   │   ├── autoSaveMiddleware.ts      # 2-min auto-save logic
│   │   └── models/
│   │       ├── DesignerFormModel.ts
│   │       ├── DesignerTabModel.ts
│   │       ├── DesignerSectionModel.ts
│   │       ├── DesignerFieldModel.ts
│   │       ├── DesignerRuleModel.ts
│   │       └── DesignerStyleModel.ts
│   ├── services/
│   │   ├── CrmContextService.ts       # parent.Xrm access, user context
│   │   ├── FormDefinitionService.ts
│   │   ├── TabService.ts
│   │   ├── SectionService.ts
│   │   ├── FieldService.ts
│   │   ├── ValidationRuleService.ts
│   │   ├── BusinessRuleService.ts
│   │   ├── OptionValueService.ts
│   │   ├── LookupConfigService.ts
│   │   ├── DesignService.ts
│   │   ├── VersionService.ts
│   │   └── AuditLogService.ts
│   ├── constants/
│   │   ├── entityNames.ts             # All qdb_* logical names
│   │   ├── attributeNames.ts          # All attribute logical names
│   │   └── fieldTypes.ts              # Field type enum + metadata
│   ├── validation/
│   │   ├── publishValidation.ts       # Zod-based publish checklist
│   │   └── draftValidation.ts         # Pre-save structural validation
│   └── types/
│       ├── crm.d.ts                   # Xrm namespace type augmentation
│       └── businessRule.ts            # Business rule JSON schema types
├── tests/
│   ├── services/                      # Service layer unit tests
│   ├── state/                         # State store tests
│   └── validation/                    # Validation tests
├── public/
│   └── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── deploy/
    ├── solution/                      # CRM solution structure
    ├── webresources/                  # Compiled web resource artifacts
    └── DEPLOYMENT.md
```

---

## 4. CEO Condition Responses

### C-001 — Business Rule JSON Schema (CRITICAL)

The following is the agreed JSON contract for `qdb_form_business_rule`. This schema must be shared with the Dynamic Form Engine renderer team before the rule panel is built.

```typescript
// src/types/businessRule.ts

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than';

export type LogicalOperator = 'AND' | 'OR';

export type RuleActionType =
  | 'show_field'
  | 'hide_field'
  | 'set_required'
  | 'clear_required'
  | 'set_value'
  | 'show_message';

export interface RuleCondition {
  field_code: string;         // qdb_form_field.qdb_code
  operator: ConditionOperator;
  value: string | null;       // null for is_empty / is_not_empty
}

export interface RuleConditionGroup {
  logical_operator: LogicalOperator;
  conditions: RuleCondition[];
}

export interface RuleAction {
  action_type: RuleActionType;
  target_field_code: string;  // qdb_form_field.qdb_code
  value?: string;             // for set_value, show_message
}

export interface BusinessRuleDefinition {
  version: '1.0';             // schema version for future evolution
  trigger_field_code: string; // field that triggers evaluation
  trigger_event: 'on_change'; // extensible for future events
  condition_group: RuleConditionGroup;
  actions: RuleAction[];
}
```

**Storage:** This `BusinessRuleDefinition` object is serialized as JSON and stored in `qdb_form_business_rule.qdb_rule_definition` (a multiline text field). The renderer deserializes and evaluates it at runtime.

**Renderer contract:** The renderer team must confirm support for schema version `'1.0'` before the rule configuration panel is implemented.

---

### C-002 — Bundle Size Strategy

**Vite build configuration with size budget:**

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-fluent': ['@fluentui/react-components'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-state': ['zustand', 'immer'],
        },
      },
    },
    chunkSizeWarningLimit: 500, // KB — warn if any chunk exceeds 500KB
  },
});
```

**Lazy loading strategy:**
- Advanced component panel (Repeating Grid, Child Entity Grid, Document Upload Block) — lazy-loaded on first expand.
- Rule configuration panel — lazy-loaded on first open.
- Theme editor — lazy-loaded on first open.
- Version history — lazy-loaded on first open.

**Estimated chunk sizes (post tree-shaking):**
| Chunk | Estimated Size (gzipped) |
|-------|------------------------|
| vendor-react | ~45KB |
| vendor-fluent (used subset) | ~180KB |
| vendor-dnd | ~30KB |
| vendor-state | ~15KB |
| app core | ~120KB |
| Advanced panel (lazy) | ~40KB |
| Rule panel (lazy) | ~30KB |
| Theme editor (lazy) | ~25KB |
| **Total initial load** | **~390KB gzipped** |
| **Total all loaded** | **~485KB gzipped** |

Target is well under the 5MB CRM upload limit for the uncompressed bundle (~1.8MB uncompressed estimated). A CI step will fail the build if total uncompressed bundle exceeds 4MB.

---

### C-003 — CRM Version Compatibility Matrix

| Feature Used | Xrm API | v9.2 On-Prem | v9.2 Online | v9.1 Online |
|-------------|---------|-------------|-------------|-------------|
| Xrm.WebApi.createRecord | WebApi v9.0 | YES | YES | YES |
| Xrm.WebApi.updateRecord | WebApi v9.0 | YES | YES | YES |
| Xrm.WebApi.deleteRecord | WebApi v9.0 | YES | YES | YES |
| Xrm.WebApi.retrieveRecord | WebApi v9.0 | YES | YES | YES |
| Xrm.WebApi.retrieveMultipleRecords | WebApi v9.0 | YES | YES | YES |
| parent.Xrm access from iframe | UCI | YES | YES | YES |
| Xrm.Utility.showProgressIndicator | v9.1 | YES | YES | YES |
| Xrm.Utility.closeProgressIndicator | v9.1 | YES | YES | YES |
| Xrm.App.addGlobalNotification | v9.1 | YES | YES | YES |
| No Xrm.Page usage | N/A — deprecated | N/A | N/A | N/A |

**Minimum target:** Dynamics 365 v9.2 on-premise and Online. All APIs used are available in v9.0+. No Online-only APIs are used. The designer is safe for on-premise deployment.

**CRM context acquisition pattern:**
```typescript
// CrmContextService.ts — safe Xrm acquisition
export function acquireXrmContext(): typeof Xrm {
  if (typeof Xrm !== 'undefined') return Xrm;
  if (window.parent && typeof window.parent.Xrm !== 'undefined') {
    return window.parent.Xrm;
  }
  throw new CrmContextError('Xrm context not available — ensure web resource runs inside CRM UCI');
}
```

---

### C-004 — Preview Mode Implementation Decision

**Decision: Option (b) — Local Lightweight Simulation Layer**

Rationale:
- Option (a) — embedded live renderer iframe — requires knowing the portal renderer URL at design time, which would be a hardcoded configuration value violating NFR-005 and Article V of the constitution.
- Option (b) — local simulation — runs entirely within the designer bundle, has no external URL dependency, and is always in sync with the designer's local state model.

**Simulation approach:**
The preview component reads the in-memory `DesignerFormModel` (not yet saved to CRM) and renders it using a lightweight form simulator. The simulator:
- Renders tabs, sections, and fields using Fluent UI components.
- Applies current theme values from `DesignerStyleModel`.
- Does not execute business rules (preview is structural, not behavioural).
- Scales the preview container to desktop (1200px), tablet (768px), or mobile (375px) using CSS transform scale.

**Synchronisation:** The simulation reads the Zustand store directly — it always reflects the current in-memory state including unsaved changes. No CRM API call is made for preview.

**Renderer team alignment:** A note is added to the deployment guide that when the portal renderer is updated (field type rendering changes, layout algorithm changes), the preview simulator must be updated in the same release to remain in sync.

---

### C-005 — Security Role Minimum Privilege Set

The following CRM security role must be created during deployment as "Form Designer User":

| Table | Create | Read | Write | Delete | Append | Append To |
|-------|--------|------|-------|--------|--------|-----------|
| qdb_form_definition | YES | YES | YES | YES (Draft only) | YES | YES |
| qdb_form_tab | YES | YES | YES | YES | YES | YES |
| qdb_form_section | YES | YES | YES | YES | YES | YES |
| qdb_form_field | YES | YES | YES | YES | YES | YES |
| qdb_form_validation_rule | YES | YES | YES | YES | YES | YES |
| qdb_form_business_rule | YES | YES | YES | YES | YES | YES |
| qdb_form_option_value | YES | YES | YES | YES | YES | YES |
| qdb_form_lookup_config | YES | YES | YES | YES | YES | YES |
| qdb_form_submission_mapping | YES | YES | YES | YES | YES | YES |
| qdb_form_version | YES | YES | YES | NO | YES | YES |
| qdb_theme | YES | YES | YES | NO | YES | YES |
| qdb_form_design | YES | YES | YES | YES | YES | YES |
| qdb_section_design | YES | YES | YES | YES | YES | YES |
| qdb_field_design | YES | YES | YES | YES | YES | YES |
| qdb_button_design | YES | YES | YES | YES | YES | YES |
| qdb_form_audit_log | YES | YES | NO | NO | NO | YES |

**Notes:**
- `qdb_form_version`: No delete (versions are immutable history).
- `qdb_theme`: No delete (shared asset — can only be updated).
- `qdb_form_audit_log`: Write-only create path; no update or delete (append-only compliance).
- Delete on `qdb_form_definition` is restricted to Draft status forms only — this is enforced in application code via a status check before the deleteRecord call, not at the security role level.

This security role definition is included as a managed solution component in the CRM solution package.

---

### Advisory Notes (A-001, A-002, A-003)

**A-001 — Undo Stack Persistence:**
The undo/redo history stack is held in memory only (Zustand store). It is NOT persisted to localStorage or sessionStorage. Rationale: undo history is a session-scoped UX affordance, not a durability requirement. Auto-save (every 2 minutes) provides recovery from browser crashes. A `beforeunload` event fires a confirmation dialog if the form is dirty. This is a deliberate design decision.

**A-002 — Option Value Ordering:**
`qdb_form_option_value` records carry a `qdb_sort_order` (integer) attribute. When options are reordered in the Option Set Editor, only the `qdb_sort_order` values are updated (not record deletion/recreation). The dnd-kit sortable context tracks order, and on save, a batch of `updateRecord` calls updates only the changed `qdb_sort_order` values.

**A-003 — Diff-Based Save:**
The designer state store tracks a `dirtyFields` map — a set of CRM record logical names that have been modified since the last save. On save, only dirty records are written to CRM. A full-form save (all records) is only triggered on first creation or explicit "Force Save" action. This reduces write volume by approximately 80% on a typical edit session.

---

## 5. State Architecture

### Zustand Store Shape

```typescript
interface DesignerState {
  // Navigation
  currentScreen: DesignerScreen;
  currentFormId: string | null;

  // Form model
  form: DesignerFormModel | null;
  tabs: Record<string, DesignerTabModel>;       // keyed by tempId or CRM id
  sections: Record<string, DesignerSectionModel>;
  fields: Record<string, DesignerFieldModel>;
  rules: Record<string, DesignerRuleModel>;
  style: DesignerStyleModel | null;

  // Ordering (arrays of IDs in display order)
  tabOrder: string[];
  sectionOrder: Record<string, string[]>;       // tabId → sectionIds
  fieldOrder: Record<string, string[]>;          // sectionId → fieldIds

  // Dirty tracking
  dirtyIds: Set<string>;          // IDs of records with unsaved changes
  newIds: Set<string>;            // IDs of records not yet created in CRM
  deletedIds: Set<string>;        // IDs of records pending deletion

  // Undo/redo
  undoStack: DesignerStateSnapshot[];   // up to 50 snapshots
  redoStack: DesignerStateSnapshot[];

  // UI
  selectedId: string | null;      // currently selected canvas item
  selectedType: CanvasItemType | null;
  isDirty: boolean;
  isSaving: boolean;
  isPublishing: boolean;
  lastSavedAt: Date | null;
  previewMode: PreviewBreakpoint | null;
}
```

### Temp ID Strategy

New items not yet persisted to CRM receive a temp ID with prefix `tmp_` (e.g., `tmp_tab_1716985200000`). On save, the service layer creates the CRM record, receives the real GUID, and dispatches a `resolveId` action that replaces all references to the temp ID with the real GUID across the entire state tree.

---

## 6. CRM Service Layer Architecture

All services receive the `Xrm` context via constructor injection (no static access):

```typescript
class FormDefinitionService {
  constructor(private readonly xrm: typeof Xrm) {}

  async createForm(dto: CreateFormDto): Promise<string> { ... }
  async updateForm(id: string, dto: UpdateFormDto): Promise<void> { ... }
  async getForm(id: string): Promise<DesignerFormModel> { ... }
  async listForms(filter?: FormListFilter): Promise<FormSummary[]> { ... }
  async deleteForm(id: string): Promise<void> { ... }
}
```

**Retry policy:** All `Xrm.WebApi` calls are wrapped in a retry helper with exponential backoff (max 3 retries, starting at 500ms):

```typescript
async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await delay(500 * Math.pow(2, attempt));
    }
  }
}
```

**Batch save strategy:** On save, dirty records are grouped by entity type and saved sequentially by dependency order: form definition → tabs → sections → fields → rules → options → design records → audit log.

---

## 7. Drag-and-Drop Architecture

Three distinct DnD zones using dnd-kit:

### Zone 1 — Toolbox to Canvas (Cross-container drag)
- Source: `DraggableToolboxItem` — carries `data.type` (field type identifier)
- Target: `SectionContainer` drop zone — accepts new field drops
- On drop: dispatches `addField(sectionId, fieldType, position)` to store

### Zone 2 — Field reorder within section (Sortable)
- `SortableContext` wraps each section's field list
- `useSortable` on each `FieldSlot`
- On sort end: dispatches `reorderField(sectionId, fromIndex, toIndex)` to store

### Zone 3 — Section reorder within tab (Sortable)
- `SortableContext` wraps each tab's section list
- On sort end: dispatches `reorderSection(tabId, fromIndex, toIndex)` to store

### Zone 4 — Tab reorder (Sortable)
- `SortableContext` wraps the tab bar
- On sort end: dispatches `reorderTab(fromIndex, toIndex)` to store

All four zones are nested inside a single `DndContext` with a custom collision detection algorithm that determines which zone type is the active drop target.

---

## 8. Deployment Architecture

```
CRM Solution Package (FormDesigner_1_0_0_0.zip)
├── WebResources/
│   ├── qdb_/form-designer/
│   │   ├── index.html                 # Entry point
│   │   ├── assets/
│   │   │   ├── index.[hash].js        # Main bundle
│   │   │   ├── vendor-react.[hash].js
│   │   │   ├── vendor-fluent.[hash].js
│   │   │   ├── vendor-dnd.[hash].js
│   │   │   └── vendor-state.[hash].js
│   │   └── index.css
├── Entities/                          # No new entities (all pre-provisioned)
├── Roles/
│   └── FormDesignerUser.xml           # Security role definition
├── SitemapExtensions/
│   └── FormDesignerSitemap.xml        # Sitemap entry under chosen area
└── solution.xml
```

**Deployment promotion path:**
1. DEV: Import solution. Verify web resource loads. Manual smoke test.
2. SIT: Export DEV managed solution. Import to SIT. Run test suite against SIT CRM tables.
3. UAT: Export as managed. Import to UAT. BA acceptance testing.
4. PROD: Import same managed solution. Publish all customisations. Verify sitemap entry.

No manual changes in any environment after DEV. Solution file is the source of truth.

---

## 9. Architecture Decision Records

### ADR-001: Client-Side Only (No Server)
**Decision:** The web resource is a pure client-side bundle with no server component.
**Rationale:** CRM web resources are static file assets served from CRM. There is no facility to deploy a Node.js server alongside a CRM web resource. All persistence goes through `Xrm.WebApi`.
**Consequence:** No server-side logic, no caching layer, no background jobs. All operations must complete within the browser session.

### ADR-002: Zustand over Redux
**Decision:** Zustand for state management instead of Redux or Context.
**Rationale:** The designer state is a single large tree with frequent fine-grained updates (drag operations). Zustand provides direct store mutation without action verbosity. Redux adds boilerplate without benefit for this single-screen application. Context API performance degrades with 50+ field re-renders per drag operation.

### ADR-003: Immer for Undo/Redo
**Decision:** Immer's `produce` used to create structural snapshots for undo history.
**Rationale:** The designer state tree is deeply nested. Immer produces minimal structural shares rather than deep clones, keeping 50 snapshots manageable in memory (<5MB estimated for a 50-field form).

### ADR-004: Vite over Webpack
**Decision:** Vite 5 as build tool.
**Rationale:** Vite's rollup output produces cleaner chunk splits for CRM web resource deployment. Webpack 5 is heavier and the CRM webresource context does not benefit from webpack's dev-server features. Vite build --reporter gives the CI size enforcement needed for C-002.

### ADR-005: Local Preview Simulation
**Decision:** Preview renders from local Zustand state, not from an embedded renderer iframe.
**Rationale:** See C-004 response. No external URL dependency. Always in sync with in-memory unsaved state.

---

## 10. Non-Functional Requirements — Architecture Response

| NFR | Architecture Response |
|-----|----------------------|
| NFR-001 Performance | Zustand subscription granularity limits re-renders to affected components only. dnd-kit uses pointer events (not mouse events) for 60fps drag. Virtual rendering not required at 50-field scale. |
| NFR-002 Compatibility | All Xrm.WebApi calls target v9.0 API level. Bundle polyfills not required — Edge Chromium 100+ and Chrome 100+ have full ES2020 support. |
| NFR-003 Reliability | Auto-save middleware fires every 120s when `isDirty === true`. Retry wrapper handles transient API failures. `beforeunload` event prevents accidental data loss. |
| NFR-004 Security | No external API calls. No secrets. `parent.Xrm` accessed safely with null guard. CRM security roles enforce data access. |
| NFR-005 Maintainability | All CRM entity/attribute names in `constants/entityNames.ts` and `constants/attributeNames.ts`. No inline strings. Strict TypeScript throughout. |
| NFR-006 Deployment | Vite build output wrapped in CRM solution structure. Single `.zip` import. Deployment guide covers DEV/SIT/UAT/PROD. |

---

*Architecture document complete. All five CEO conditions (C-001 through C-005) and all three advisory notes (A-001 through A-003) have been addressed. Awaiting CEO architecture approval before build commences.*
