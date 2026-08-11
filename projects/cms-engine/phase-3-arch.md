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
| §2 Multi-tenancy (C-13) | **Decided — A-1/A-1b signed off** |
| §3 Plugin design | **Decided** |
| §4 Adapter specification | **Decided** |
| §9 UI/UX specification | **Decided** — separate document, [`phase-3-uiux-spec.md`](phase-3-uiux-spec.md) |
| §5 Approval workflow | ⛔ Blocked on **Q3** |
| §6 Rich text handling | **Decided — Q1 answered** |
| §7 On-premise specifics | ⛔ Blocked on **Q4** |
| §8 Content migration | ⛔ Blocked on **Q6** |

Satisfies gate finding **SR-4**, which required a UI/UX pass producing
component-level interaction patterns, a field grouping strategy and a bilingual
editor layout before any frontend implementation begins.

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
`msst_CmsGetPublishedPageJson`.

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

## §2 Multi-tenancy — and the finding that forced a company-wide convention

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

### Decision — 2026-08-11: **Option B, the company prefix `msst`**

The options above were weighed and **Option B was chosen**. The publisher exists
on `org5869857f`:

| Field | Value |
|---|---|
| Unique name | `MSST` |
| Friendly name | Muhammad Salman Sagar Technologies |
| Customization prefix | **`msst`** |
| Option value prefix | 46327 |

QDB is the first customer, not the namespace owner — that part of the reasoning
holds either way, and `msst` satisfies it. What Option B does *not* give for
free is separation between MSS products, so that has to be bought with a naming
rule.

### The rule that makes a company prefix safe

> **Entities and Custom APIs carry a product segment. Columns do not.**

A shared prefix means the CMS and the DFE would otherwise both want `msst_page`
and `msst_field`, and only one can have either.

| Kind | Name | Why |
|---|---|---|
| Entity | `msst_cmspage`, `msst_cmsicon` | Entity logical names are **org-wide** — collision is real |
| Custom API | `msst_CmsPublishPage` | Same namespace as entities |
| Column | `msst_slug`, `msst_versionnumber` | Column names are **scoped to their entity**, so `msst_slug` on `msst_cmspage` cannot clash with `msst_slug` on a DFE table |
| Web resource | `msst_cms_designer.html` | Flat namespace, needs the segment |

Applied throughout §3 below. Without it, this decision reintroduces exactly the
collision the options table warned about.

### Two consequences to accept

1. **Every MSS product shares one option-value block** (46327). Option-set values
   must be allocated per product to avoid overlap on import — the CMS should take
   a documented sub-range rather than counting up from the base.
2. **The publisher friendly name reads "Muhammad Salman Sagar Technologies"** — a
   personal name on a publisher that ships to clients. Unique name and prefix are
   permanent once components import; **the friendly name can still be changed**
   and should be, before the first import.

### ✅ Signed off — 2026-08-11 (revised to `msst`)

**A-1 and A-1b are decided.** The convention lives at [`global/PUBLISHER-AND-PREFIX.md`](../../global/PUBLISHER-AND-PREFIX.md).

| Field | Value |
|---|---|
| Customization prefix | **`msst`** |
| Publisher unique name | **`MSST`** |
| Publisher display name | Muhammad Salman Sagar Technologies — **change before first import** |
| Option value prefix | 46327 — allocate a CMS sub-range |

A publisher carries exactly one prefix. With a **company** prefix that prefix is
shared across every MSS product, which is why the product segment on entities and
Custom APIs above is not optional — it is the thing standing between this
decision and a collision with the DFE.

**Remaining checks:**

- [x] `msst` exists on `org5869857f` — publisher `MSST`, verified by query
- [ ] **`msst` is unused in every *other* target environment.** Less likely to
      clash than a generic code, but still unverified outside this org. Fold into
      question 8 to QDB IT.
- [ ] **Publisher friendly name changed** from "Muhammad Salman Sagar
      Technologies" before the first import — the only one of these four fields
      still editable afterwards.
- [ ] **CMS option-value sub-range allocated** within the shared 46327 block, so
      two MSS products cannot emit overlapping option-set values.

Nothing is provisioned, so the sign-off costs nothing to reverse **until that
check passes and the first table is created**. After that it is a migration.

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
| `msst_cmspage` | Page header | `msst_slug`, `msst_titleen`, `msst_titlear`, `msst_status` |
| `msst_cmspageversion` | Append-only versions | `msst_versionnumber`, `msst_contentfile` (File column), `msst_islatest`, `msst_schemaversion` |
| `msst_cmsrendercache` | Published output | `msst_runtimejson` (Memo, gzip+Base64), `msst_languagecode` |
| `msst_cmspublishlog` | Audit — plugin-written only | `msst_action`, `msst_versionnumber`, `msst_publishedon`, `msst_publishedby` |
| `msst_cmsmediaasset` | Media library | `msst_assetkey`, `msst_kind`, File column |
| `msst_cmsicon` | Icon library — geometry only | `msst_iconkey`, `msst_geometry` (Memo) |
| `msst_cmsthemetoken` | Design tokens | `msst_slug`, `msst_tokentype`, `msst_value`, `msst_scope` |
| `msst_cmsnavigation` | Navigation, separately versioned | `msst_versionnumber`, `msst_treejson` |

Per ADR-CMS-001: versions use a **File column** (unbounded), the render cache
uses a **Memo column** (single-round-trip read on every page view).

### Versioning is self-contained — decided under C-11, 2026-08-11

**`msst_cmspageversion` is the CMS's own version store. The CMS does not depend on
DXP-P1-004.** Recorded here explicitly so the dependency is not re-asserted: the
BRD originally claimed it, this architecture never used it, and the two
disagreed for three weeks before anyone noticed.

The two are different layers, not competing stores:

| | DXP-P1-004 | `msst_cmspageversion` |
|---|---|---|
| Purpose | Compliance evidence | **Operational restore (FR-63)** |
| Write path | *"without touching the operational write path"* — async, queued | Synchronous, on every save |
| Read by | Auditors | **Authors** |

If CMS content ever needs compliance snapshots, DXP-P1-004 captures it **because
it observes** — which is exactly why the CMS does not need to depend on it.

See `c-11-versioning-dependency.md` for the full reasoning.

### Custom APIs

| API | Mode | Stage | Does |
|---|---|---|---|
| `msst_CmsPublishPage` | **Async** | PostOperation (40) | Validate → set status → gzip+Base64 → write render cache → **write audit row** |
| `msst_CmsGetPublishedPageJson` | **Sync** | PostOperation (40) | Read cache, decode, return. Never generates. |
| `msst_CmsUploadIcon` | **Sync** | PostOperation (40) | Parse SVG as XML → extract geometry allowlist → reject if nothing drawable → store |

**Why publish is a plugin and not a browser write** — the same argument
ADR-RPT-011 makes for `qdb_RunReport`. If the browser both flips the live version
and writes the audit row, a user can keep the write and skip the log. Routing
publish through the plugin makes the audit row structurally unavoidable: the same
call that publishes writes it.

**Why icon upload is a plugin** — identical reasoning, applied to a security
control. Browser-side sanitisation is bypassable via a direct Web API write, so
enforcement lives where the write happens (ADR-CMS-002).

### Validation performed by `msst_CmsPublishPage`

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
| `bilingual: true` | **one** `custom` paired field | Stores `{ en, ar }` — revised by the UI/UX pass, §9 |
| `kind: 'colour'` | `custom` field, token swatches | Token constraint is ours; Puck has no concept of it |
| `kind: 'icon'` | `custom` field over icon library | Same |
| `isEditing` | `puck.isEditing` | Renamed so blocks never see a `puck` object |
| `locale` | `metadata.locale` | Puck's metadata is untyped; adapter types it |
| `schemaVersion` | *(none)* | Ours alone — see ADR-CMS-003 |

> **OQ-A is now closed.** The domain stores `{ en, ar }` and the adapter renders
> one paired control. Settled by the UI/UX pass (§9) after measuring that flat
> `…En`/`…Ar` pairs put 17–21 controls on six components — and settled **before
> the first row is written**, which was the constraint.

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

## §6 Rich text handling

**Q1 answered 2026-08-11: rich text is in scope.** Recorded as a working
assumption pending QDB's formal confirmation — it is the more permissive of the
two answers, and the asymmetry favours it: building for rich text and not
needing it is cheap, retrofitting it changes payload limits, the editor and the
security surface at once.

### Storage — re-measured, decision unchanged

ADR-CMS-001 required re-measurement with real prose before acceptance if this
answer came back yes. Done, with the harness committed:

| Case | Stored | % of Memo |
|---|---|---|
| **Typical page** — 20 rich blocks | 3.8 KB | **0.37 %** |
| **Heavy page** — 60 rich blocks | 8.4 KB | **0.82 %** |
| Pathological — 800 rich blocks | 112 KB | 10.94 % |

Rich text does not threaten the storage model. The 60 % warn / 90 % reject gates
at publish stand unchanged.

> An earlier version of this section warned that *"prose compresses at 3–4×, not
> 50×"*. **That was asserted, not measured, and it is wrong** for a page payload:
> measured compression is 10–35×, because JSON keys, HTML markup and bilingual
> structure repeat even when the words do not. The fear that motivated the
> re-measurement did not survive the re-measurement.

### The editor

Puck bundles **Tiptap 3.x** as a hard dependency (20 packages, 5.8 MB), imported
at module level — it is present whether or not the rich-text field is used. So
the field costs nothing extra in bundle terms, which the 331 KB editor
measurement in §1 already includes.

This settles ADR-CMS-005 favourably: portal-shell's `RichTextEditor` is retired
onto Puck's Tiptap 3.x, **one major, no duplication, and no capability
regression.** Its OQ-D closes with it.

### Toolset — a closed set, not "rich text"

"Rich text" is unbounded; a governed CMS cannot be. The field permits exactly:

| Allowed | Deliberately excluded | Why |
|---|---|---|
| bold, italic | font family, size, colour | Typography and colour come from theme tokens (DXP-P1-003). An author choosing a colour bypasses the palette. |
| ordered / unordered lists | tables | A table is a block with its own field contract, not prose |
| inline links | images | Images are asset-key references (FR-14), never inline |
| paragraph, H2–H4 | H1 | H1 is the page title, one per page, owned by the page not the prose |
| — | raw HTML / embeds | The whole point of a governed surface |

**H1 exclusion is not cosmetic** — it is what keeps the document outline valid
for WCAG 2.1 AA (NFR-07).

### Sanitisation — server-side, at publish

The editor constrains what an author can *type*. It cannot constrain what an
author can *write to the API*, so the control lives in `msst_CmsPublishPage`:

1. Parse the stored HTML fragment
2. Strip every element and attribute outside the allowlist above
3. Reject `javascript:` and `data:` URIs in `href`
4. Reject if the content contains markup but no text after sanitisation

This is the same reasoning as ADR-CMS-002 for icons: **browser-side sanitisation
is bypassable via a direct Web API write, so enforcement sits where the write
happens.** The visitor renderer receives only sanitised content and never
re-sanitises at render time — sanitising on read would put the cost on every
page view for a guarantee already made at publish.

### Bilingual and RTL

A rich-text field is bilingual like any other (§9, `{ en, ar }`), rendered as one
paired control. The Arabic editing surface sets `dir="rtl"` on the editable
region only — **not on the toolbar**, which stays in the interface direction.

**Mixed-direction content inside a paragraph** — an Arabic sentence containing an
English product name — is wrapped in `<bdi>` at render. This was found in the
spike: `"10:00 AM - 6:00 PM"` inside Arabic reordered to `"AM - 6:00 PM 10:00"`
without it.

### Translation interaction

A rich-text value is one translatable string carrying markup, not a set of
strings per element. It participates in FR-40/41 unchanged, with one rule
inherited from the DFE:

> **Markup-only changes must not mark a translation stale.** Re-wrapping a
> paragraph without altering its words is not a content change. The DFE flagged
> padded labels as stale and trained translators to ignore the signal
> (AC-41.3).

### Acceptance criteria this adds

**Folded into `acceptance-criteria.md` as FR-03b** (9 criteria). Listed here for readability; that file is the contract.

- A tag outside the allowlist, submitted directly to the API, is stripped at publish
- `javascript:` and `data:` URIs in `href` are rejected
- An Arabic rich-text value renders RTL with `<bdi>` isolation on embedded Latin text
- A markup-only change does not raise the stale flag
- H1 cannot be produced by the editor

---

## §5, §7, §8 — still blocked

| Section | Blocked on | What cannot be designed without it |
|---|---|---|
| §5 Approval workflow | **Q3** | Number of approval chains, routing rules, whether regulated content needs a separate path. A single chain will be routed around. |
| §7 On-premise specifics | **Q4** | Custom API vs Process Action, File column availability and limits, browser baseline for `CompressionStream` |
| §8 Content migration | **Q6** | Whether existing `bodyHtml` content is migrated or re-authored |

---

## Decisions requiring ratification at the architecture gate

| # | Decision | Where |
|---|---|---|
| A-1 | Company prefix **`msst`**, with a product segment on entities and Custom APIs | §2 — **DECIDED 2026-08-11** (Option B; supersedes the earlier `cms` sign-off) |
| A-1b | One publisher record `msstechnologies_cmsengine`, display "MSS Technologies" | §2 — **SIGNED OFF 2026-08-11** |
| A-2 | One environment per customer, no row-level tenant discriminator | §2 |
| A-3 | Two bundles: editor 331 KB, runtime 53 KB | §1 |
| A-4 | ~~ADR-CMS-001 through 005 move to Accepted~~ **Partially done — 1 of 5.** ADR-CMS-004 accepted; the other four have build-time or client-gated verification items and close at the Phase 4 exit gate. | [`adrs/RATIFICATION.md`](adrs/RATIFICATION.md) |
| A-5 | Renderer comparison harness runs in CI as a merge gate | §4 — **built**, `cms-renderer-parity.yml` |
