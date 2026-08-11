# CMS-ENG-001 — Phase 3 Architecture

```
═══════════════════════════════════════════════════
ARCHITECTURE DOCUMENT
Engagement ID:  CMS-ENG-001
Date:           2026-08-10
Version:        0.1 — PARTIAL
Status:         IN PROGRESS — sections awaiting QDB answers are marked
═══════════════════════════════════════════════════
```

## §0 What this document currently covers

Architecture was authorised at the Phase 1 gate. Five of the ten questions in
`client-actions-required.md` block parts of it. This version covers everything
that does **not** depend on those answers, so the blocked work is the only work
waiting.

| Section | Status |
|---|---|
| §1 Deployment topology | **Decided** |
| §2 Multi-tenancy (C-13) | **Decided — carries a significant finding** |
| §3 Plugin design | **Decided** |
| §4 Adapter specification | **Decided** |
| §5 Approval workflow | ⛔ Blocked on **Q3** |
| §6 Rich text handling | ⛔ Blocked on **Q1** |
| §7 On-premise specifics | ⛔ Blocked on **Q4** |
| §8 Content migration | ⛔ Blocked on **Q6** |

---

## §1 Deployment topology

### Two bundles, not one

Per ADR-CMS-004 the runtime renderer is ours, so the editor and the visitor path
ship separately. Both were built and measured, not estimated.

| Bundle | Contents | Raw | Gzipped | Loaded by |
|---|---|---|---|---|
| **Editor** | React + Puck + adapter + block library | 1.07 MB | **331 KB** | Authors |
| **Runtime** | React + our renderer + block library | 0.17 MB | **53 KB** | Every visitor |

**The visitor bundle is 84 % smaller.** That is the concrete value of ADR-CMS-004
— and more importantly, Puck is absent from the citizen-facing path entirely, so
a breaking change in a 0.x dependency cannot break a published page.

### The bundling proof (was the largest open technical risk)

A hardened CRM blocks CDN loads by CSP, so the editor must be entirely
self-contained. Verified by bundling and scanning the output:

| Check | Result |
|---|---|
| Dynamic `import()` | **0** |
| `fetch()` calls | **0** |
| `importScripts` | **0** |
| `eval()` / `new Function()` | **0** — no CSP hazard |
| Node-only APIs | **none** |
| Absolute URLs | 12, all XML namespace identifiers (`w3.org/2000/svg`) and one React error-doc link — identifiers, not fetched resources |

**Puck bundles cleanly for an on-premise CSP-hardened web resource.** This was
the risk most likely to invalidate the foundation, and it is retired.

### Where a visitor's page is served from

The editor is a Dataverse web resource. **The visitor path is not** — published
CMS content reaches citizens through **portal-shell's Next.js application**
(`[locale]/(portal)/pages/[slug]`), which reads the render cache via
`cms_GetPublishedPageJson`.

This was unstated until the C-10 assessment needed it, and it matters: it means
portal-shell's dependency surface is part of the CMS's delivery surface. See
`c-10-nextjs-vulnerability-assessment.md`.

> ⚠️ While portal-shell runs Next.js 14.x, **middleware must never carry
> authorisation**. The C-10 assessment downgrades a CVSS 9.1 middleware bypass to
> low impact *solely* because today's middleware does locale routing and nothing
> else. Adding an auth check there would silently make it critical again.

### Solution components

> ⚠️ **Every web resource must be declared individually in `solution.xml`
> `RootComponents`.** Folder wildcards cause import failure. This has already
> cost this organisation a failed import on a previous engagement.

---

## §2 Multi-tenancy — and a finding that needs a decision now

CEO condition **C-13** requires multi-tenancy decisions in Phase 3 precisely
because retrofitting them is expensive. Working through it surfaced a conflict
that has to be resolved before the first table is created.

### The finding

**Everything designed so far uses the `qdb_` publisher prefix.** Every entity in
the BRD, both ADR-CMS-001 tables, the plugin names, the prototype's mock data:
`qdb_cmspage`, `qdb_cmspageversion`, `qdb_PublishPage`.

That is correct for a QDB engagement. **It is wrong for a product sold to other
clients.** A second customer cannot import a solution whose tables are branded
for a different bank — and a Dataverse publisher prefix cannot be changed after
records exist without recreating every table and migrating every row.

### This is not hypothetical — the Dynamic Form Engine already hit it

The DFE is this organisation's closest analogue: the same idea, the same
platform, the same product-sold-to-clients ambition. Its shipped solutions show
exactly what happens when the question is not answered up front.

| Observed in DFE | Value |
|---|---|
| Entity prefix (`crm-solution/src`) | **`dfe_`** — `dfe_formdefinition`, `dfe_field`, `dfe_displayorder` |
| Designer web-resource solution prefix | **`qdb`** |
| Publisher unique name, solution 1 | `maqsad_ai` |
| Publisher unique name, solution 2 | `maqsadai` |
| Publisher display name, both | "Maqsad AI" |

Three problems in one product:

1. **The prefix is split.** Entities are on the product prefix, web resources on
   the client prefix. One product, two namespaces.
2. **Two publisher unique names for one publisher.** In Dataverse `maqsad_ai` and
   `maqsadai` are *different publisher records*, each owning a different subset of
   the product's components.
3. **The publisher name is stale.** It still says "Maqsad AI" after the rebrand to
   MSS Technologies, and a publisher's unique name and prefix cannot be changed
   once components are imported against it.

> ⚠️ Observed in the solution manifests in this repository. Whether both
> publishers were actually imported into the same organisation has **not** been
> verified against a live org — that check belongs with the DFE, not here. The
> point that matters for the CMS Engine is that the split exists in source.

### What DFE's `dfe_` prefix teaches

It also answers the question the split obscures. DFE reached for a **product**
prefix, not a company one — and that is the right instinct. A company prefix
(`mss_`) puts every MSS product in one namespace, so the CMS and the DFE would
compete for `mss_page`, `mss_field`, `mss_version`. A product prefix does not.

### Options

| Option | Consequence |
|---|---|
| **A — Product prefix** (`cms_`) | One codebase, one solution, every client. Matches the `dfe_` precedent. Requires renaming what is designed so far — cheap now, since nothing is provisioned. |
| **B — Company prefix** (`mss_`) | Same benefits, but every MSS product shares a namespace and collides on generic table names. |
| **C — Per-client prefix at build time** | Solution generated per customer. Real tooling cost, and every client becomes a separate artefact to test and support. |
| **D — Keep `qdb_`** | Only defensible if this is a QDB-only system, which contradicts the product framing the CEO gate accepted conditionally. |

### Decision

**Option A — a single product prefix, `cms_`, across every component.**

QDB is the first customer, not the namespace owner. Entities, plugins, web
resources and the solution itself all sit on one prefix — the thing DFE did not
do.

Renaming now costs an afternoon. Renaming after go-live costs a migration of
every page, version and audit row in every customer environment.

**Two checks before this is final:**

- [ ] `cms` is unused as a prefix in every target environment — it is generic
      enough that another vendor may hold it
- [ ] The publisher record is settled — **one** unique name, correct display name
      after the MSS rebrand, used by every CMS solution. This is as irreversible
      as the prefix and DFE got it wrong twice.

**Consequences for existing artefacts:** the BRD, ADR-CMS-001, ADR-CMS-002 and
the prototype all use `qdb_` names. They stay as written — they record reasoning,
not schema — and §3 below carries the canonical names.

### Isolation model

One Dataverse environment per customer, which is how Dynamics is licensed and
deployed in practice. **No row-level tenant discriminator**, because a shared
environment is not a scenario for this product and a `tenantid` column that is
never varied is a permanent tax on every query and index.

---

## §3 Plugin design

### Entities (canonical names)

| Entity | Purpose | Key columns |
|---|---|---|
| `cms_page` | Page header | `cms_slug`, `cms_titleen`, `cms_titlear`, `cms_status` |
| `cms_pageversion` | Append-only versions | `cms_versionnumber`, `cms_contentfile` (File column), `cms_islatest`, `cms_schemaversion` |
| `cms_rendercache` | Published output | `cms_runtimejson` (Memo, gzip+Base64), `cms_languagecode` |
| `cms_publishlog` | Audit — plugin-written only | `cms_action`, `cms_versionnumber`, `cms_publishedon`, `cms_publishedby` |
| `cms_mediaasset` | Media library | `cms_assetkey`, `cms_kind`, File column |
| `cms_icon` | Icon library — geometry only | `cms_iconkey`, `cms_geometry` (Memo) |
| `cms_themetoken` | Design tokens | `cms_slug`, `cms_tokentype`, `cms_value`, `cms_scope` |
| `cms_navigation` | Navigation, separately versioned | `cms_versionnumber`, `cms_treejson` |

Per ADR-CMS-001: versions use a **File column** (unbounded), the render cache
uses a **Memo column** (single-round-trip read on every page view).

### Custom APIs

| API | Mode | Stage | Does |
|---|---|---|---|
| `cms_PublishPage` | **Async** | PostOperation (40) | Validate → set status → gzip+Base64 → write render cache → **write audit row** |
| `cms_GetPublishedPageJson` | **Sync** | PostOperation (40) | Read cache, decode, return. Never generates. |
| `cms_UploadIcon` | **Sync** | PostOperation (40) | Parse SVG as XML → extract geometry allowlist → reject if nothing drawable → store |

**Why publish is a plugin and not a browser write** — the same argument
ADR-RPT-011 makes for `qdb_RunReport`. If the browser both flips the live version
and writes the audit row, a user can keep the write and skip the log. Routing
publish through the plugin makes the audit row structurally unavoidable: the same
call that publishes writes it.

**Why icon upload is a plugin** — identical reasoning, applied to a security
control. Browser-side sanitisation is bypassable via a direct Web API write, so
enforcement lives where the write happens (ADR-CMS-002).

### Validation performed by `cms_PublishPage`

| Rule | Action | Source |
|---|---|---|
| Payload contains a `data:` URI | **Reject** | ADR-CMS-001 |
| Base64 length > 60 % of Memo limit | Warn | ADR-CMS-001 |
| Base64 length > 90 % of Memo limit | **Reject**, with measured size | ADR-CMS-001 |
| Props fail the component's schema | **Reject** | Prevents the `defaultProps` gap reaching a citizen |
| Referenced asset key or token slug does not resolve | **Reject** | Prevents a broken reference going live |

That fourth rule exists because of a defect found in the spike: Puck's
`defaultProps` apply only when a component is dragged in, never when stored data
is rendered. A page saved without a prop renders `undefined` silently. Publish is
where that must be caught.

### On-premise registration

Dynamics 9.x may lack the Custom API entity. The Dynamic Form Engine already
solved this — the same dual path applies:

| Target | Mechanism |
|---|---|
| Dataverse cloud | Custom API, unbound |
| On-premise 9.x | Process (Action), category Action, entity None — plugin step registered on the Action's message |

Argument names must match exactly across both, since the plugin reads
`context.InputParameters` either way.

> ⛔ Confirmation of which path applies is **blocked on Q4**.

---

## §4 Adapter specification

Implements ADR-CMS-003. One module imports Puck; everything else uses domain
types. Enforced by lint rule plus CI check.

### Module boundary

```
src/
  domain/          PageTree, BlockDefinition, FieldDefinition
  blocks/          block definitions and render functions
  runtime/         our renderer — no Puck (ADR-CMS-004)
  adapters/puck/   THE ONLY place @puckeditor/core is imported
  editor/          uses EditorPort
```

### Mapping table

| Domain | Puck | Notes |
|---|---|---|
| `BlockInstance.children` | slot fields | Puck's legacy `zones` normalised away at the boundary |
| `bilingual: true` | two fields, `…En` / `…Ar` | Expanded on write, collapsed on read |
| `kind: 'colour'` | `custom` field, token swatches | Token constraint is ours; Puck has no concept of it |
| `kind: 'icon'` | `custom` field over icon library | Same |
| `isEditing` | `puck.isEditing` | Renamed so blocks never see a `puck` object |
| `locale` | `metadata.locale` | Puck's metadata is untyped; adapter types it |
| `schemaVersion` | *(none)* | Ours alone — see ADR-CMS-003 |

> **OQ-A remains open**: does the adapter own bilingual expansion, or does the
> domain store `{ en, ar }`? The latter is cleaner but changes the stored shape,
> so it must be settled **before the first row is written**.

### Renderer agreement

Two renderers now exist — Puck's inside the editor canvas, ours at runtime. They
must agree, or a page previews one way and publishes another.

**Built and running** — `.github/workflows/cms-renderer-parity.yml`.

The renderer lives in one module, `spikes/puck/runtime/renderTree.tsx`, imported
by the browser harness, the bundle measurement and the CI gate alike. A gate
testing its own private copy would prove nothing about what ships.

| Gate | Checks |
|---|---|
| **Parity** | Four pages × two locales rendered through both renderers; identical output required. Reports the first diverging character on failure. |
| **Type-check** | `renderTree.tsx` under `strict`. |
| **Visitor budget** | Bundle ≤ 80 KB gzip. Currently 53 KB; it reaches 331 KB if Puck leaks into the runtime path. |
| **CSP hazards** | Editor bundle must contain zero dynamic imports, `fetch`, `importScripts`, `eval` or `new Function`. |

Ten tests, all passing. **The gate was verified to fail**, not merely to pass: a
one-word change to the renderer (a slot wrapper `div` → `span`) was injected and
every corpus entry failed with the divergence located. A merge gate that has
never been seen failing is not known to be a gate.

> The wider spike carries **24 pre-existing type errors**, all from annotating
> Puck's `Config` without type parameters so custom root slots do not type. They
> are spike-quality debt for the Phase 4 rewrite, not absorbed silently by this
> gate — which is why the type-check is scoped to the runtime module rather than
> the whole directory.

---

## §5–§8 Blocked sections

| Section | Blocked on | What cannot be designed without it |
|---|---|---|
| §5 Approval workflow | **Q3** | Number of approval chains, routing rules, whether regulated content needs a separate path. A single chain will be routed around. |
| §6 Rich text | **Q1** | Editor toolset, payload sizing re-measurement (prose compresses at 3–4×, not 50×), sanitisation surface, and whether the Tiptap retirement in ADR-CMS-005 causes a capability regression |
| §7 On-premise specifics | **Q4** | Custom API vs Process Action, File column availability and limits, browser baseline for `CompressionStream` |
| §8 Content migration | **Q6** | Whether existing `bodyHtml` content is migrated or re-authored |

---

## Decisions requiring ratification at the architecture gate

| # | Decision | Where |
|---|---|---|
| A-1 | Single product prefix `cms_` across every component, not `qdb_` | §2 — **new, needs sign-off** |
| A-1b | One publisher record, named correctly after the MSS rebrand | §2 — **new, needs sign-off** |
| A-2 | One environment per customer, no row-level tenant discriminator | §2 |
| A-3 | Two bundles: editor 331 KB, runtime 53 KB | §1 |
| A-4 | ADR-CMS-001 through 005 move from Proposed to Accepted | `adrs/` |
| A-5 | Renderer comparison harness runs in CI as a merge gate | §4 — **built**, `cms-renderer-parity.yml` |
