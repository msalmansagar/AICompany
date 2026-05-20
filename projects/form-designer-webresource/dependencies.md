# Form Designer Web Resource — Dependency Decisions

> WebSearch was unavailable during research. Evaluations are based on well-established
> library knowledge as of mid-2025. Star counts are approximate.

---

## 1. Drag-and-Drop — **dnd-kit** ✅ ADOPT

| Attribute | Value |
|---|---|
| Repo | github.com/clauderic/dnd-kit |
| Stars | ~12 000 |
| License | MIT |
| Last active | 2025 |

**Why**: Purpose-built for React. Supports sortable lists, cross-container drag (toolbox → canvas, section → section), keyboard-accessible drag, touch support. Significantly lighter than React DnD (~14 KB gzipped vs ~30 KB). No DOM manipulation outside React — safe for CRM Web Resource sandbox.

**Decision**: Already chosen in spec. Confirmed correct.

---

## 2. State Management — **Zustand** ✅ ADOPT

| Attribute | Value |
|---|---|
| Repo | github.com/pmndrs/zustand |
| Stars | ~50 000 |
| License | MIT |
| Last active | 2025 |

**Why**: Zero boilerplate, works without React context providers, tiny (~1 KB gzipped). Ideal for a CRM web resource where no external store provider wraps the app. Immer middleware for immutable updates. Temporal middleware (zundo) for undo/redo.

**Decision**: ADOPT as primary state manager.

---

## 3. Undo/Redo — **zundo** ✅ ADOPT

| Attribute | Value |
|---|---|
| Repo | github.com/charkour/zundo |
| Stars | ~1 500 |
| License | MIT |
| Last active | 2025 |

**Why**: Drop-in Zustand middleware that adds `undo()`, `redo()`, `clear()` to any store. Supports partial state tracking (only track designer canvas state, not UI state). 50-step history limit is configurable.

**Decision**: ADOPT for undo/redo. No need to build custom history stack.

---

## 4. Preview Form Rendering — **Build from scratch** (reuse existing renderer)

**Why not react-jsonschema-form (~14 000 stars)**: The existing Dynamic Form Engine already has a complete form renderer (`DynamicFormRenderer`, `TabRenderer`, `SectionRenderer`, `FieldRenderer`) that understands the exact `qdb_*` schema. Adopting rjsf would mean maintaining two renderers with different data models.

**Decision**: BUILD preview by embedding/simulating the existing Dynamic Form Engine renderer logic against the Zustand designer state. Share the `@dfe/shared` type package between the designer and the renderer.

---

## 5. CRM TypeScript Types — **@types/xrm** ✅ ADOPT

| Attribute | Value |
|---|---|
| Package | @types/xrm (DefinitelyTyped) |
| Stars | Part of ~48 000 star DT repo |
| License | MIT |

**Why**: Official TypeScript declarations for the Xrm namespace (Xrm.WebApi, Xrm.Navigation, Xrm.Utility). Required for type-safe Xrm.WebApi calls in the CRM service layer.

**Decision**: ADOPT. Install as devDependency.

---

## 6. React Form Builder Libraries — **Build from scratch**

Libraries evaluated: react-form-builder2, formio, surveyjs.

**None adopted because**:
- All assume server-side storage (REST endpoints) — incompatible with Xrm.WebApi-only constraint
- All use their own schema format — incompatible with existing qdb_* table structure
- Bundle sizes (surveyjs: ~600 KB gzipped) would blow the 4 MB budget
- None have Power Platform / Fluent UI styling

**Decision**: BUILD the designer canvas from scratch using dnd-kit + Fluent UI v9 + Zustand. This is the core value-add of the project.

---

## 7. Fluent UI v9 — **@fluentui/react-components** ✅ ADOPT

Already chosen. Aligns with Power Platform design language. Tree-shakeable — only used components are bundled.

---

## 8. Build Tool — **Vite** ✅ ADOPT

| Attribute | Value |
|---|---|
| Repo | github.com/vitejs/vite |
| Stars | ~70 000 |
| License | MIT |

**Why**: Fast HMR in development. ESBuild-based production bundle. CRM Web Resource output = single `index.html` + `assets/` folder. Vite `lib` mode or standard build with `base: './'` produces correct relative asset paths for CRM web resources.

---

## 9. Rich Text Editor — **@tiptap/react** ✅ ADOPT

| Attribute | Value |
|---|---|
| Repo | github.com/ueberdosis/tiptap |
| Stars | ~30 000 |
| License | MIT |

**Why**: Needed for the Rich Text field control in the form designer properties panel. Headless — fully styleable with Fluent UI. No server dependency.

---

## Summary Decision Table

| Need | Library | Decision |
|---|---|---|
| Drag and drop | dnd-kit | ADOPT |
| State management | Zustand | ADOPT |
| Undo/redo | zundo | ADOPT |
| Preview renderer | Existing DFE renderer | REUSE |
| CRM types | @types/xrm | ADOPT |
| Form builder base | — | BUILD |
| UI components | @fluentui/react-components | ADOPT |
| Build tool | Vite | ADOPT |
| Rich text | @tiptap/react | ADOPT |
