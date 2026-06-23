═══════════════════════════════════════════════════════════════════════
GITHUB RESEARCH — CWFD-002 SOP DESIGNER
═══════════════════════════════════════════════════════════════════════
Project:        CRM Visual Workflow Designer — SOP Feature
Document:       github-research.md
Prepared by:    GitHub Researcher — Maqsad AI
Date:           2026-06-12
Feature Code:   CWFD-002
Verdict:        BUILD (with targeted ADOPT decisions per component)
═══════════════════════════════════════════════════════════════════════


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESEARCH SCOPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Three areas were researched:
1. React multi-step wizard library — for the "Create Process from SOP" wizard
2. Dataverse Custom Action / Plugin patterns — for qdb_CreateProcessFromSop
3. Zustand multi-store / slice architecture — for SOP canvas state isolation

The SOP canvas itself reuses @xyflow/react (already adopted in CWFD-001,
ADR-001). No new canvas library research is required.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AREA 1 — REACT MULTI-STEP WIZARD LIBRARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Need: The "Create Process from SOP" wizard is a three-step modal form
with per-step validation, shared state across steps, Back/Next/Submit
navigation, and React Hook Form integration (already present in CWFD-001).

─────────────────────────────────────────────────────────────────────
Candidates Evaluated
─────────────────────────────────────────────────────────────────────

| Library | Stars | Last Update | TypeScript | RHF Integration | Assessment |
|---------|-------|-------------|-----------|-----------------|------------|
| react-multistep | ~670 | Jun 2026 | Yes | Manual | Too lightweight; no shared state |
| rhf-wizard | <500 | Active | Yes | First-class | Suitable but low stars |
| react-wizardry | ~41 | Jun 2025 | Yes | Manual | Too low stars; abandoned risk |
| react-albus (Amex) | ~1,500 | Inactive | Partial | None | Abandoned by Amex |
| Formiz | ~400 | Apr 2026 | Yes | Own API | Replaces RHF — conflicts with CWFD-001 RHF adoption |
| react-step-wizard | ~1,200 | 2024 | Partial | Manual | No per-step validation; stale |

─────────────────────────────────────────────────────────────────────
VERDICT: BUILD — Native React Hook Form Multi-Step Pattern
─────────────────────────────────────────────────────────────────────

No candidate clears the 1,000-star bar with active maintenance AND
first-class RHF integration. The recommended approach — confirmed by
the React Hook Form community and multiple high-quality blog references —
is a native pattern using:

- React Hook Form `useForm` with `mode: 'onChange'` and `trigger()`
  for per-step field validation before advancing
- A local `useState` step counter within the wizard component
- React Context or Zustand local slice to persist step values across
  step navigation (preventing data loss on Back)
- Fluent UI `Stepper`-style progress indicator (custom, since
  @fluentui/react-components v9 does not ship a stepper component)

This pattern is 40–60 lines of application code. The CWFD-001 project
already has react-hook-form v7 + zod v4 + @hookform/resolvers in the
bundle. Zero new dependencies are required. This is the correct choice.

BUNDLE IMPACT: Zero — react-hook-form already in vendor-form chunk.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AREA 2 — DATAVERSE CUSTOM ACTION / PLUGIN PATTERNS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Need: qdb_CreateProcessFromSop requires a server-side C# plugin
executing within a Dataverse transaction. Evaluated whether a
reference implementation or scaffolding library exists that should
be adopted over a custom implementation.

─────────────────────────────────────────────────────────────────────
Key Finding: Custom API vs. Custom Process Action
─────────────────────────────────────────────────────────────────────

Microsoft Dataverse offers two mechanisms for custom server-side actions:

1. Custom Process Actions (legacy) — defined in the workflow designer,
   registered via Plugin Registration Tool, participates in transaction
   automatically when registered at Pre-Operation or Post-Operation stage.

2. Custom API (recommended by Microsoft from 2021 onwards) — a first-class
   developer-facing API, no workflow designer dependency, clean parameter
   schema, richer metadata. Transactional when bound to an entity and
   registered as a synchronous step.

For CWFD-002, Custom API is the correct choice:
- Cleaner parameter definition (no workflow XML)
- Callable directly from Dataverse Web API: POST to
  `{orgUrl}/api/data/v9.2/qdb_CreateProcessFromSop`
- Transaction participation confirmed: synchronous pre-operation step
  on a Custom API message participates in the platform DB transaction
- No deprecated workflow designer dependency

─────────────────────────────────────────────────────────────────────
Reference Libraries Evaluated
─────────────────────────────────────────────────────────────────────

| Library | Stars | Relevance | Assessment |
|---------|-------|-----------|------------|
| Data8/DataverseClient | ~150 | WS-Trust auth, not plugin scaffolding | Not relevant |
| Microsoft.PowerApps.TestEngine | N/A | Test engine, not plugin framework | Not relevant |
| No plugin scaffolding library found | — | — | BUILD |

No open-source plugin scaffolding library with sufficient star count
exists for Dataverse Custom API plugins. Microsoft's approach is to
use the Plugin Registration Tool + standard IOrganizationService SDK.
CWFD-001 already has a C# plugin infrastructure in place.

─────────────────────────────────────────────────────────────────────
VERDICT: BUILD — Custom API Plugin using existing CWFD-001 plugin infra
─────────────────────────────────────────────────────────────────────

The existing C# plugin project in CWFD-001 provides the assembly and
registration foundation. CWFD-002 adds a new plugin class implementing
the Custom API message handler. No new C# library adoption required.

Key architectural confirmation (from Microsoft Learn + community blog):
- Custom APIs registered as synchronous steps participate in the
  Dataverse platform transaction.
- All IOrganizationService.Create() calls within the plugin execute
  within this transaction.
- If any call throws, the platform rolls back all changes automatically.
- This confirms FR-SOP-07j is achievable without manual rollback logic.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AREA 3 — ZUSTAND MULTI-STORE / SLICE ARCHITECTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Need: COND-SOP-03 (CEO condition) requires the SOP canvas state to be
isolated from the existing workflowStore. Evaluated the Zustand
community consensus on multiple stores vs. slices.

─────────────────────────────────────────────────────────────────────
Zustand Official Guidance (pmndrs/zustand, ~53k stars, actively maintained)
─────────────────────────────────────────────────────────────────────

From Zustand GitHub wiki and discussion #2496 (community consensus):
- If two domains are truly independent, separate stores is correct.
- If two domains share state (e.g., a cross-canvas selection ID), slices
  within one store is correct.
- Slices pattern: create separate slice functions, merge into one
  create() call. Full TypeScript support confirmed.

For CWFD-002:
- SOP canvas and Process canvas are independent domain concerns.
- They do not share nodes, edges, dirty tracking, or undo history.
- They may share: the selected SOP to derive from (passed as a prop,
  not shared store state), and the ICrmAdapter instance (injected
  via context — not stored in Zustand).
- Recommendation: TWO separate stores — `workflowStore` (existing) and
  `sopStore` (new, mirroring the workflowStore structure for SOP domain).

BUNDLE IMPACT: Zustand store definitions are pure TypeScript — negligible
bundle addition (~2–5 KB for the sopStore module).

─────────────────────────────────────────────────────────────────────
VERDICT: BUILD — Separate sopStore mirroring workflowStore pattern
─────────────────────────────────────────────────────────────────────

No new library required. Standard Zustand pattern. Architect to define
the sopStore interface in the Architecture document with explicit
justification for two-store vs. slices decision (ADR required).


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY TABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Component | Decision | Rationale |
|-----------|----------|-----------|
| Wizard step management | BUILD (native RHF pattern) | No qualifying library found (>1k stars + active + RHF-first); zero new deps; already have RHF v7 + Zod v4 in bundle |
| Dataverse Custom Action | BUILD (Custom API + existing plugin infra) | No scaffolding library relevant; Custom API preferred over Custom Process Action; CWFD-001 C# plugin project is the base |
| Zustand SOP store | BUILD (separate sopStore) | Zustand official pattern for independent domain concerns; mirrors workflowStore; no new deps |
| SOP Canvas (ReactFlow) | REUSE — @xyflow/react already adopted (ADR-001) | Direct reuse of existing canvas architecture; no new canvas library |
| React Hook Form + Zod | REUSE — already in vendor-form chunk | Wizard validation uses existing form infrastructure |
| Auto-layout (ELK/Dagre) | REUSE — already adopted (ADR-004) | SOP canvas reuses the same layout engine |

Overall verdict: BUILD on all three new areas. All decisions build
on already-adopted libraries from CWFD-001. No new npm dependencies
are introduced by this feature.


━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROCEED-TO-ARCHITECTURE RECOMMENDATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

There are no ADOPT or ADAPT candidates that require user confirmation
before proceeding. The architect may begin the architecture phase
immediately. Key inputs from this research:

1. Use Custom API (not Custom Process Action) for qdb_CreateProcessFromSop.
   This is a meaningful architecture recommendation — the BRD says
   "Custom Action" which in Dataverse terminology covers both types.
   The architect must confirm Custom API as the registration mechanism.

2. Implement the three-step wizard natively using react-hook-form
   `trigger()` for per-step validation. Do not introduce a wizard library.

3. Implement a separate `sopStore` using Zustand (two stores, not slices),
   matching the structure of the existing `workflowStore`. An ADR must
   justify this decision (reference: Zustand discussion #2496).

═══════════════════════════════════════════════════════════════════════
END OF GITHUB RESEARCH — CWFD-002
Prepared by: GitHub Researcher — Maqsad AI | 2026-06-12
═══════════════════════════════════════════════════════════════════════
