# CMS Engine — Architecture Decision Records

Decisions taken for **CMS-ENG-001**. Each records what was decided, what was
rejected, and what evidence the decision rests on.

> **Status note.** The CMS Engine has **no approved BRD yet**. Per `CLAUDE.md`,
> the BRD is the entry gate for any work that changes what the system promises.
> ADRs here are therefore **Proposed** — they capture reasoning gathered during
> the spike so it is not lost, not decisions that have passed a gate.

| ADR | Title | Status | Rests on |
|---|---|---|---|
| [ADR-CMS-001](ADR-CMS-001-page-payload-storage.md) | Page payload storage: where a page's JSON lives, and what bounds it | Proposed | Measured payload sizes against the Dataverse Memo limit |
| [ADR-CMS-002](ADR-CMS-002-icon-storage-geometry-not-files.md) | Icons are stored as geometry, not as files | Proposed | Dependency research — no .NET SVG sanitiser clears the bar |
| [ADR-CMS-003](ADR-CMS-003-editor-adapter-boundary.md) | The editor sits behind an adapter; no Puck type crosses the boundary | Proposed | CEO condition C-7; Puck is 0.22 after three years |
| [ADR-CMS-004](ADR-CMS-004-own-the-runtime-renderer.md) | The runtime renderer is ours; Puck never reaches a visitor | Proposed | Hand-written renderer produced byte-identical output — 17,719 chars, 225 elements, zero differences |
| [ADR-CMS-005](ADR-CMS-005-tiptap-version-clash.md) | The Tiptap clash is a retirement, not an upgrade | Proposed | Tiptap 2.x reaches portal-shell through exactly one file, used by the two screens the CMS replaces |

## Inherited decisions

These were taken elsewhere and the CMS Engine follows them rather than
re-deciding:

| ADR | Where | What it means here |
|---|---|---|
| ADR-RPT-011 | Report Engine | Execute inside CRM. Web resource for UI, plugin for anything auditable, no hosted middle tier. |
| ADR-PORT-005 | Portal Shell | Auth is Auth.js v5 → JWT → Fastify → msal-node. The CMS does not invent its own. |
| DXP-P1-003 | DXP Phase 3 | Colour and typography are theme tokens. Pages store slugs, never values. |
| DXP-P1-004 | DXP Phase 4 | Versioning and snapshots. Pages are versioned content, not versioned code. |

## CEO conditions addressed here

| Condition | Status | Where |
|---|---|---|
| **C-7** — Puck adapter interface designed and enforced | Addressed | [ADR-CMS-003](ADR-CMS-003-editor-adapter-boundary.md) |
| **C-9** — RTL drag-and-drop visually confirmed | **Confirmed** | Both directions verified in the inline-canvas RTL spike: a block dropped on the visually-right zone landed right, and on the visually-left zone landed left. Not mirrored. |
| **C-8** — Tiptap v2/v3 clash | Addressed | [ADR-CMS-005](ADR-CMS-005-tiptap-version-clash.md) — not a clash to resolve but a component to retire |

## Decisions still owed

Recorded here so they are not forgotten between sessions.

| # | Question | Blocked on |
|---|---|---|
| D-1 | Puck adoption itself — the spike proved it viable, but adopting a 0.x dependency for a multi-year product is a decision, not a finding. | BRD |
| D-2 | ~~Whether icons live in code or in Dataverse.~~ **Settled**: Dataverse, stored as geometry — see ADR-CMS-002. | Closed |
| D-3 | How far business users can go without a developer — the component-builder scope. | BRD |
| D-4 | Bundling strategy for the on-premise web resource. A CDN load is blocked by CSP in a hardened CRM. | Architecture |
