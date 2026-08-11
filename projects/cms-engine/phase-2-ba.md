# CMS-ENG-001 — Business Requirements Document

```
═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
═══════════════════════════════════════════════════
Engagement ID:  CMS-ENG-001
Title:          Metadata-driven Content Management Engine
Prepared by:    MSS Technologies — Business Analyst
Date:           2026-08-10
Version:        1.0
Status:         DRAFT — awaiting CEO review (entry gate)
═══════════════════════════════════════════════════
```

---

## 1. Executive summary

Portal content at QDB is changed by developers. Every wording correction, every
new landing page, every seasonal campaign becomes a code change, a deployment
and a release window. Business users who own the content cannot act on it, and
developers spend their time on work that is not engineering.

CMS-ENG-001 delivers a **content management engine that runs inside Dynamics** —
a Dataverse web resource for authoring, a plugin for anything that must be
auditable, and no externally hosted component. Business users compose pages from
approved building blocks, in English and Arabic, and publish them under
approval. Developers supply the building blocks and stop being in the path of
routine content work.

The engine is **metadata-driven**: a page is data, not code. That single
property is what makes versioning, rollback, translation, per-service branding
and audit possible at all.

**This is a product**, not a one-off build. QDB/Reyada is the first customer.
Both Dataverse (cloud) and Dynamics CRM on-premise are supported targets.

### What has already been established

A technical spike (`projects/portal-shell/spikes/puck`, 11 commits) and a
15-screen UX prototype (`projects/cms-engine/prototype`) exist. Between them
they have demonstrated, with evidence rather than assertion:

| Question | Answer | Evidence |
|---|---|---|
| Can an open-source editor be adopted rather than built? | Yes — Puck, MIT, actively maintained | Adoption analysis; craft.js rejected (18 months without a release) |
| Does it support Arabic RTL? | **Yes** — runtime, editor, canvas, fields, fonts | Measured; RTL is explicit in Puck's drop-index logic |
| Does it work on our stack? | Yes, unchanged — React 18 / Next 14.2 | `peerDependencies: react ^18 \|\| ^19` |
| Will a page fit in a Dataverse column? | Yes, ~100× margin | ADR-CMS-001 — 2,000-block page = 0.90 % of the Memo limit |
| Can business users build components without code? | Yes, for ~95 % of cases | Prototype `07-builder.html`; proven pattern elsewhere |

Nothing has been written to a live organisation. No schema has been provisioned.

---

## 2. Background and problem statement

### 2.1 Current state

QDB portal content is embedded in application code. Changing a heading requires
a developer, a pull request, a review, a build and a deployment.

Consequences observed:

- **Content changes queue behind engineering.** A wording fix waits for a release.
- **Arabic drifts.** English is updated; the Arabic equivalent is a separate file
  that someone must remember. Half-translated pages ship.
- **Brand consistency erodes.** With colours written directly into components,
  nothing prevents a near-miss green. Over time a site accumulates several.
- **No content audit trail.** Version control records who changed the *code*.
  Nobody can answer "who put this text in front of a citizen, and when".
- **Rollback means redeploy.** Reverting a bad page is an engineering event.

### 2.2 Problems this engagement solves

| # | Problem | Consequence today |
|---|---|---|
| P-1 | Content changes require a developer | Weeks of latency on minute-scale work |
| P-2 | Arabic and English maintained separately | Half-translated pages reach citizens |
| P-3 | No governed design system at authoring time | Brand drift, unapproved colours |
| P-4 | No content-level audit | Cannot answer a regulator's "who published this" |
| P-5 | No rollback without deployment | A bad page stays live until the next release |
| P-6 | New page types need engineering | Business cannot respond to campaigns |

### 2.3 Why now

Two enabling pieces already exist and are otherwise under-used:
**DXP-P1-001** (component registry) and **DXP-P1-003** (theme tokens). They were
built as platform capability with no authoring surface on top. This engagement
supplies that surface.

> **Corrected 2026-08-11 (C-11).** This paragraph originally named **DXP-P1-004**
> (versioning) as a third existing piece. That was wrong twice over: its build has
> never started — only its architecture is complete — and the CMS does not use it.
> See `c-11-versioning-dependency.md`.

---

## 3. Scope

### 3.1 In scope

- Page authoring: create, compose, preview, submit, approve, publish
- Bilingual content (English / Arabic) in a single page structure
- Media library with upload and asset-key referencing
- Icon library with upload and sanitisation
- Theme tokens: define approved colours and typography; authors select, never enter
- Component builder: business users compose new reusable blocks without code
- Navigation as a separately versioned record
- Translation workbench with missing and stale detection
- Version history with rollback
- Approval workflow before publish
- Publish audit log, written by a plugin so it cannot be bypassed
- Role-based access across all capabilities
- Deployment to Dataverse (cloud) **and** Dynamics CRM on-premise

### 3.2 Out of scope for this phase

- Migrating existing hardcoded pages (separate engagement)
- Public-facing rendering performance optimisation beyond the render cache
- Personalisation or content targeting by audience segment
- A/B testing
- Scheduled publishing beyond a single future date
- Form building — the Dynamic Form Engine owns that; the CMS embeds forms, it does not build them
- Analytics beyond a page-view count

### 3.3 Explicitly excluded, with reason

| Excluded | Reason |
|---|---|
| Authors writing raw HTML/CSS/JS | A business user pasting markup into a bank's public site is one bad paste from a security incident. Component builder covers the need safely. |
| A free colour picker | Any hex would reach a public page. Token selection preserves brand governance while keeping author choice. |
| Externally hosted rendering service | ADR-RPT-011 — no hosted middle tier. Also avoids a Qatar data-residency question that need not be asked. |

---

## 4. Stakeholders and users

| Role | Who | Primary need |
|---|---|---|
| Power Admin | Digital/brand team | Full control without waiting on engineering |
| Content Author | Marketing, product owners | Create and edit pages in both languages |
| Translator | Arabic content specialists | Translate without touching layout |
| Approver | Communications lead, Legal for regulated pages | Prevent unreviewed content reaching citizens |
| Viewer | Wider business | Preview before it goes live |
| Developer | MSS / QDB engineering | Supply new block types; stop being in the content path |
| Auditor / Compliance | QDB internal audit, regulator | Evidence of who published what, when |

---

## 5. Functional requirements

### 5.1 Authoring

| # | Requirement | Priority |
|---|---|---|
| FR-01 | An author shall create a page by supplying a title; the system derives a URL slug, editable before first publish. | Must |
| FR-02 | An author shall compose a page by placing blocks from a palette, and reorder or remove them. | Must |
| FR-03 | The system shall present English and Arabic fields together on the same block, not as separate pages. | Must |
| FR-04 | The system shall render the page as the visitor will see it, in either language, without leaving the editor. | Must |
| FR-05 | An author shall preview at desktop, tablet and mobile widths. | Must |
| FR-06 | The system shall save a draft automatically, without an explicit action. | Must |
| FR-07 | An author shall duplicate an existing page as a starting point. | Should |
| FR-08 | The system shall show, before publish, which fields have no Arabic value. | Must |

### 5.2 Design system and governance

| # | Requirement | Priority |
|---|---|---|
| FR-10 | Colour shall be selected from approved theme tokens. The system shall not accept a free-form colour value from an author. | Must |
| FR-11 | A Power Admin shall define, edit and retire theme tokens through the UI. | Must |
| FR-12 | Changing a token value shall change every page using it, without editing or re-versioning any page. | Must |
| FR-13 | Tokens shall resolve per locale, so Arabic may carry different typography from English. | Must |
| FR-14 | Images shall be referenced by asset key. A page shall never store an image binary or a `data:` URI. | Must |
| FR-15 | Replacing a media asset shall update every referencing page without editing or re-versioning it. | Must |

### 5.3 Media and icons

| # | Requirement | Priority |
|---|---|---|
| FR-20 | An author shall upload images to a shared media library with metadata and alt text in both languages. | Must |
| FR-21 | The library shall show how many pages reference each asset, and prevent deletion of one in use. | Must |
| FR-22 | A Power Admin shall upload icons, which become available to all authors without a deployment. | Must |
| FR-23 | The system shall sanitise every uploaded SVG, removing scripts, event handlers and external references, and reject any file with no drawable content remaining. | Must |
| FR-24 | The system shall record what was stripped from an upload, and log rejections rather than discarding them silently. | Must |

### 5.4 Component builder

| # | Requirement | Priority |
|---|---|---|
| FR-30 | A Power Admin shall create a reusable component by arranging existing blocks and saving that arrangement under a name. | Must |
| FR-31 | A Power Admin shall create a component from a layout template by choosing which fields it carries. | Should |
| FR-32 | A Power Admin shall define a component's fields from a fixed set of types: text, long text, image, icon, colour, link, choice, number. | Must |
| FR-33 | Text and long-text fields shall be bilingual by default. | Must |
| FR-34 | A published component shall appear in every author's palette without a deployment. | Must |
| FR-35 | The system shall show which pages use a component before it is changed or retired. | Must |

### 5.5 Translation

| # | Requirement | Priority |
|---|---|---|
| FR-40 | The system shall list every translatable string with its state: translated, missing, or stale. | Must |
| FR-41 | A string shall be marked stale when its English source changes after the Arabic was written. | Must |
| FR-42 | A Translator shall edit Arabic values without the ability to change layout or structure. | Must |
| FR-43 | The system shall export and re-import strings for external translation. | Should |

### 5.6 Structure

| # | Requirement | Priority |
|---|---|---|
| FR-50 | Navigation shall be a separately versioned record, not a property of any page. | Must |
| FR-51 | The system shall report navigation entries pointing at deleted pages, and published pages absent from navigation. | Must |
| FR-52 | Navigation labels shall be maintained in both languages. | Must |

### 5.7 Publishing, versioning and audit

| # | Requirement | Priority |
|---|---|---|
| FR-60 | An author shall submit a page for review; the system shall not allow an author to publish alone. | Must |
| FR-61 | An Approver shall approve or return a page with comments. | Must |
| FR-62 | Every save shall create a new version. No version shall be edited in place. | Must |
| FR-63 | A user with rights shall restore any prior version, which shall be copied forward as a new version rather than deleting history. | Must |
| FR-64 | Publishing shall write an append-only audit record, in the same operation that makes the content live, such that publishing without a log entry is not possible. | Must |
| FR-65 | Publishing shall reject a payload containing a `data:` URI, and reject a payload exceeding the configured size ceiling, with the measured size in the message. | Must |
| FR-66 | A visitor shall see the last published version. A draft in progress shall never be served. | Must |
| FR-67 | An unpublished page viewed internally shall be visibly marked as a draft. | Must |

### 5.8 Access control

| # | Requirement | Priority |
|---|---|---|
| FR-70 | Every capability shall be governed by a Dataverse security role. The system shall not implement a parallel permission model. | Must |
| FR-71 | The system shall support at minimum: Power Admin, Content Author, Translator, Approver, Viewer. | Must |
| FR-72 | Editing the page shell — header, navigation, footer — shall be separable from editing page content. | Must |

---

## 6. Non-functional requirements

| # | Requirement | Target |
|---|---|---|
| NFR-01 | A published page shall render from a pre-built cache, not by generating at request time. | p95 < 200 ms server time |
| NFR-02 | The editor shall load within a working timeframe on a standard QDB workstation. | < 5 s to interactive |
| NFR-03 | The engine shall run with no externally hosted component. | Zero non-Dataverse runtime dependencies |
| NFR-04 | The engine shall function in a CRM with a restrictive content security policy. | No CDN or external font loads at runtime |
| NFR-05 | All content shall remain within the approved data region. | Qatar / GCC |
| NFR-06 | The authoring UI shall be usable in Arabic, right-to-left. | See OQ-4 |
| NFR-07 | Published pages shall meet WCAG 2.1 AA. | Audited before go-live |
| NFR-08 | The solution shall import to both Dataverse cloud and Dynamics CRM on-premise. | Both, from one solution where possible |
| NFR-09 | Page payload storage shall not silently truncate. | ADR-CMS-001 |

---

## 7. Assumptions

Stated so they can be overturned rather than discovered.

| # | Assumption | If wrong |
|---|---|---|
| A-1 | This is a product for multiple clients, with QDB/Reyada as pilot. | Multi-tenant considerations drop out; scope shrinks. |
| A-2 | Business users should reach every capability without a developer. | Component builder and icon upload leave scope. |
| A-3 | Both cloud and on-premise are required targets. | On-premise dropping removes the Custom-API-vs-Process-Action dual path and the bundling constraint. |
| A-4 | English and Arabic only. | More languages need the token and translation model re-examined, though both were designed for it. |
| A-5 | Puck is the editor foundation. | A 0.x dependency is a standing upgrade cost; see Risk R-1. |
| A-6 | Existing page migration is a later engagement. | Migration tooling enters scope and changes the estimate materially. |

---

## 8. Open questions requiring sign-off

**These block CEO approval. They cannot be answered by the delivery team.**

| # | Question | Owner | Why it matters |
|---|---|---|---|
| OQ-1 | Is long-form rich text in scope? | QDB Digital | Changes payload sizing (ADR-CMS-001), the editor toolset, and the sanitisation surface. |
| OQ-2 | Which pages require Legal approval before publish, and who are the named approvers? | QDB Legal / Comms | Determines whether one approval chain suffices or several are needed. |
| OQ-3 | Is the Arabic authoring UI required, or is Arabic *content* enough? | QDB Digital | Puck's own interface is English-only. Translating it is real scope (see Risk R-2). |
| OQ-4 | Which on-premise CRM version, and does it support Custom API and File columns? | QDB IT | 9.x may require Process Actions instead of Custom API, and File column limits differ. |
| OQ-5 | Confirmation that page content is not personal data under PDPPL, or the controls required if it is. | QDB Compliance | Gates production, as on prior engagements. |
| OQ-6 | Font licensing — is GE Dinar licensed for web embedding, on which domains, at what page-view tier? | QDB Brand / Legal | Proprietary (Boutros International). A desktop licence does not cover web serving. |

---

## 9. Risks

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| R-1 | Puck is pre-1.0 (v0.22). Breaking changes across minor versions. | High | High | Pin the exact version. Wrap it behind an internal adapter so the editor is replaceable. Budget upgrade work each year. |
| R-2 | Puck's editor UI is English-only; no i18n API. | Medium | Certain | Scope UI localisation via `overrides` if OQ-3 requires it. Affects admins only, not citizens. |
| R-3 | Editor bundle is ~644 KB JS + 100 KB CSS against a 52 KB runtime. On-premise ships as a web resource. | Medium | High | Bundle for offline. Only authors load the editor; visitors load the runtime. |
| R-4 | Business users can now break the public site. | High | Medium | Approval before publish, versioning with rollback, plugin-written audit. All three must ship together — removing any one is what makes this dangerous. |
| R-5 | Uploaded SVG is an execution vector. | High | Medium | Sanitise on write (FR-23). Never trust the file extension. |
| R-6 | Component sprawl — 200 near-identical components after two years. | Medium | High | Usage counts, retirement workflow, and a named owner for the design system. |
| R-7 | On-premise CRM 9.x may lack Custom API. | Medium | Medium | Dual registration path, already proven in the Dynamic Form Engine. |
| R-8 | "Complete CMS for both audiences" is a product, not a project. | High | Certain | Phase it (§11). Resist building the component builder before authoring works. |

---

## 10. Success criteria

The engagement succeeds if, six months after go-live:

| # | Measure | Target |
|---|---|---|
| SC-1 | Content changes requiring a developer | < 10 % of all changes |
| SC-2 | Median time from content request to live | < 1 day, from weeks |
| SC-3 | Published pages with complete Arabic | > 95 % |
| SC-4 | Unapproved colours on published pages | Zero, by construction |
| SC-5 | Published pages with a complete audit record | 100 % |
| SC-6 | Rollbacks achieved without a deployment | 100 % |
| SC-7 | Pages authored by business users unaided | > 80 % |

---

## 11. Recommended phasing

Sequenced by value, not by interest.

| Phase | Delivers | Rationale |
|---|---|---|
| **1** | Authoring, media, translation, approval, publish, audit, versioning | Where nearly all the value is, and what business users wait on today |
| **2** | Theme tokens UI, component registry surface, navigation | Governance and the developer-facing half |
| **3** | Component builder, icon upload, editable page shell | Highest capability, highest risk — only safe once Phase 1's guardrails are proven |

**Phase 3 must not precede Phase 1.** Component building is the most
interesting work and the least valuable until authors can publish a page at all.

---

## 12. Dependencies

| Dependency | Status |
|---|---|
| DXP-P1-001 Component Registry | Delivered — CMS surfaces it |
| DXP-P1-003 Theme Tokens | Delivered — CMS authors token values |
| ~~DXP-P1-004 Versioning & Snapshots~~ | **Not a dependency — removed 2026-08-11 (C-11).** The CMS owns `cms_pageversion`. P1-004 is an async *compliance audit* layer that by design does not touch the operational write path; FR-63's author-facing restore is an operational capability, not a compliance one. |
| ADR-RPT-011 in-CRM execution | Accepted — CMS follows it |
| ADR-CMS-001 payload storage | Proposed — accept alongside this BRD |
| Dataverse environment (Qatar region) | Existing gate from prior engagements |
| GE Dinar web font licence | OQ-6, unresolved |

---

## 13. Recommendation to the CEO

**Approve for Phase 1, subject to OQ-1 through OQ-6.**

The technical risk that would normally justify caution has already been retired
by the spike: RTL works, the stack needs no upgrade, storage has a hundredfold
margin, and the editor is adopted rather than built.

The remaining risk is not technical. It is **scope** (R-8) and **governance**
(R-4). Both are managed by phasing and by insisting that approval, versioning
and audit ship in Phase 1 rather than being deferred as "controls to add later".

**Do not approve Phase 3 at this gate.** Component building should be
re-assessed once Phase 1 is live and the guardrails have been observed working
with real authors.
