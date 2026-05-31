# GitHub Research Report
# Dynamics CRM Web Resource — Drag-and-Drop Form Designer
**Date:** 2026-05-18
**Researcher:** GitHub Research Agent — Maqsad AI

---

## Search Scope

Three research axes were investigated:
1. Visual drag-and-drop form builder libraries with toolbox + properties panel pattern
2. dnd-kit based canvas form builder implementations
3. Dynamics CRM / Dataverse web resource form builder patterns

---

## Candidates Evaluated

### 1. SurveyJS survey-creator
- **URL:** https://github.com/surveyjs/survey-creator
- **Stars:** 1,300+
- **Language:** TypeScript
- **License:** Form Library — MIT (free). Survey Creator (drag-drop designer) — COMMERCIAL LICENSE REQUIRED for production use.
- **Maintained:** Actively maintained as of May 2026.
- **Fit Assessment:**
  - Closest feature match to what is required: drag-drop designer, property panel, conditional logic, theme editor, JSON schema output.
  - BLOCKER: The drag-and-drop designer component (survey-creator) requires a paid commercial license. This makes it ineligible for direct adoption without procurement.
  - Does not use Fluent UI — uses its own theme system. Fluent UI integration requires custom work.
  - JSON schema output is SurveyJS-proprietary format; does not map to the 16 CRM tables required.
  - Even if licensed, the schema would need a translation layer to write to qdb_* tables — significant adaptation effort.
- **Verdict:** REJECT — commercial license required; schema mismatch with qdb_* tables.

### 2. FormEngine (optimajet/formengine)
- **URL:** https://github.com/optimajet/formengine
- **Stars:** 205+
- **Language:** TypeScript + React
- **License:** Core — MIT. Drag-and-drop Form Builder — COMMERCIAL.
- **Maintained:** Active.
- **Fit Assessment:**
  - MIT core handles form rendering only; the visual drag-drop designer is commercial.
  - Claims Fluent UI component support in commercial tier.
  - Same pattern as SurveyJS: free renderer, paid designer.
  - Cannot adopt the designer without purchasing a license.
- **Verdict:** REJECT — commercial license required for the designer surface.

### 3. react-form-builder2 (visif/react-form-builder2)
- **URL:** https://github.com/visif/react-form-builder2
- **Stars:** Low (<100 on this fork; main repo visif has limited activity)
- **Language:** JavaScript with partial TypeScript typings
- **License:** MIT
- **Dependencies:** react-dnd (not dnd-kit), Bootstrap 4, Font Awesome
- **Fit Assessment:**
  - MIT licensed and free.
  - Uses react-dnd, not dnd-kit (spec mandates dnd-kit).
  - No Fluent UI — Bootstrap 4 styling, incompatible with Power Platform look and feel.
  - No TypeScript-first codebase — partial typings only.
  - Last significant activity appears dated; community activity low.
  - 16 generic field types — missing many required types (Rich Text, Repeating Grid, Child Entity Grid, Document Upload Block, Declaration Block, etc.).
  - No CRM/Xrm.WebApi integration layer.
  - No tab/section hierarchy — flat field list only.
- **Verdict:** REJECT — wrong DnD library, Bootstrap styling (incompatible), missing field types, no tab/section model.

### 4. dnd-kit (clauderic/dnd-kit)
- **URL:** https://github.com/clauderic/dnd-kit
- **Stars:** 16,100+
- **Language:** TypeScript (first-class)
- **License:** MIT
- **Maintained:** Actively maintained; last release August 2025.
- **Fit Assessment:**
  - This IS the mandated drag-and-drop primitive for this project.
  - Not a form builder — it is the drag-and-drop toolkit layer.
  - Provides DndContext, useDraggable, useDroppable, SortableContext, useSortable.
  - Fully TypeScript-first, framework agnostic with React first-class support.
  - 16,100+ stars — battle-tested and production-ready.
  - The sidebar-to-canvas pattern (drag from toolbox, drop onto canvas, reorder within canvas) is a documented and community-validated use pattern.
  - Accessibility built in: keyboard navigation, ARIA live region announcements.
  - ADOPT: dnd-kit as the drag-and-drop primitive layer.
- **Verdict:** ADOPT — use dnd-kit as the DnD engine. This is already in the spec.

### 5. dnd-kit-based form builder implementations (community)
- **ALonghi/dnd_forms_builder** — Next.js + TypeScript + dnd-kit + Prisma. ~50 stars. Basic field types only (text, number, select, checkbox). No tab/section hierarchy. No properties panel beyond label/placeholder. No theming. Too simple.
- **maesterfox/fs-form-builder** — Similar stack. Educational project, not production-ready.
- **Verdict:** REFERENCE ONLY — useful as implementation pattern references for dnd-kit sidebar-to-canvas interaction, but not adoptable as-is.

### 6. Dynamics CRM / Dataverse Web Resource patterns
- **andnilsson/generator-react-crm** — Yeoman generator for React CRM web resources. Useful scaffold pattern but not a form designer.
- No GitHub repository found that implements a drag-and-drop form designer as a CRM web resource writing to Dataverse/CRM tables.
- The DEV Community article "Form-based Dataverse Web Resources with React, TypeScript, and FluentUI" confirms the pattern is viable but no complete designer exists publicly.
- **Verdict:** No adoptable CRM-specific form designer exists. Custom build required.

---

## Verdict Summary

| Candidate | Stars | License | Verdict |
|-----------|-------|---------|---------|
| SurveyJS survey-creator | 1,300+ | Commercial (designer) | REJECT |
| FormEngine (optimajet) | 205+ | Commercial (designer) | REJECT |
| react-form-builder2 | <100 | MIT | REJECT |
| **dnd-kit** | **16,100+** | **MIT** | **ADOPT (DnD primitive)** |
| dnd-kit community form builders | <100 | MIT | REFERENCE only |
| CRM web resource form designers | None found | N/A | BUILD |

---

## Final Decision: BUILD

**Rationale:**
Every production-grade drag-and-drop form builder with a designer surface (toolbox + properties panel + theming) is either commercially licensed (SurveyJS, FormEngine) or lacks the required:
- Tab/Section/Field hierarchy
- Fluent UI styling
- CRM Xrm.WebApi integration
- qdb_* table schema alignment
- Advanced field types (Repeating Grid, Child Entity Grid, Declaration Block, etc.)

No open source solution covers even 50% of the required feature surface without significant schema transformation work that would exceed the cost of building clean.

**ADOPT:**
- `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities` — MIT, 16,100+ stars — as the drag-and-drop engine (already mandated by spec).
- `@fluentui/react-components` (v9) — Microsoft's official Fluent UI library — for Power Platform-compatible UI components.
- `zustand` — lightweight React state management for the designer local state model.
- `immer` — immutable state updates for the undo/redo history stack.
- `zod` — runtime validation at publish-time validation gate.
- `vite` — build tool for bundled web resource output with size budgeting.

These adoptions replace build effort for well-solved primitive problems and all carry MIT licenses with 1,000+ GitHub stars.

---

## Dependencies Rationale

| Library | Stars | License | Role |
|---------|-------|---------|------|
| @dnd-kit/core | 16,100+ | MIT | Drag-and-drop engine |
| @fluentui/react-components | 19,000+ | MIT | UI component system |
| zustand | 52,000+ | MIT | Designer state management |
| immer | 27,000+ | MIT | Immutable undo/redo history |
| zod | 36,000+ | MIT | Publish-time form validation |
| vite | 73,000+ | MIT | Bundler with size budget enforcement |

All adoptions documented. Custom build for: designer shell, toolbox, canvas, properties panel, CRM service layer, all 16 screens.

---

*Research complete. Proceeding to architecture.*
