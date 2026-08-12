# CMS-PLAT-001 — Business Requirements Document

```
═══════════════════════════════════════════════════
BUSINESS REQUIREMENTS DOCUMENT
Engagement ID:  CMS-PLAT-001
Date:           2026-08-12
Version:        0.1 — DRAFT, awaiting CEO gate
Status:         BA phase. Not approved. Nothing may be built from this.
Builds on:      CMS-ENG-001 (QDB portal CMS, Phase A foundation live)
═══════════════════════════════════════════════════
```

## 1. Executive summary

The instruction is *"a CMS platform that can compete with any CMS available in the
market today."* This document takes that seriously enough to say where it is
achievable and where it is not.

**It is not achievable head-on.** Contentful, Sanity, Storyblok, Sitecore, Adobe
Experience Manager and Optimizely have a decade of engineering and hundreds of
people each. A feature-for-feature race is lost before it starts, and any plan
that implies otherwise is selling a fantasy.

**It is achievable on a wedge.** There is one thing none of them can do, because
their architecture forbids it: **run inside the customer's Dynamics tenant, under
the customer's existing security model, with content never leaving it.** Every
competitor is a separate system with a separate identity store, a separate
permission model, a separate data residency question and a separate procurement.
For a regulated buyer — a bank, a ministry, a healthcare provider — that is not a
detail. It is the reason CMS projects stall in security review for six months.

So the recommendation is not *"build everything they have."* It is **"reach
credible parity on the table stakes, and be structurally unbeatable on
governance, residency and CRM-native content."**

CMS-ENG-001 already proves the hard part works: a page composed, compressed,
published through a plugin that writes an unbypassable audit row, and read back —
all inside Dataverse. That is the asset. This engagement asks what it takes to
turn it into a product.

---

## 2. What changes from CMS-ENG-001

| | CMS-ENG-001 | CMS-PLAT-001 |
|---|---|---|
| Buyer | QDB | Any regulated enterprise on Dynamics |
| Content shape | Pages made of blocks | **Content types with typed fields**; pages are one consumer |
| Locales | English + Arabic, hardcoded | N locales, configurable |
| Sites | One | Many, per tenant |
| Delivery | One portal reads the render cache | **A content API with a stated SLA** |
| Storage | One JSON blob per page | Blob for pages, **queryable rows for structured entries** |
| Success | QDB stops waiting on developers | A second customer buys it without us present |

### 2.1 The finding that forces this document

The engineering audit that prompted it is worth recording, because it is
checkable rather than rhetorical.

**Ten tables do not cover the 43 approved requirements, let alone a platform.**
Two gaps in the *signed-off* scope:

- **AC-41.2** requires that re-entered Arabic causes *"the new English source to
  be snapshotted."* There is no table for translation state or source snapshots.
  This is the exact defect that hit the Dynamic Form Engine — 221 of 226
  translations had no source snapshot, so staleness was never computable and
  translators were trained to ignore the flag.
- **FR-30 to FR-35** (component builder) have **no component definition table**.
  Delivery Phase C was deferred, but the model was never designed.

**The structural gap is larger than either.** Today a page is a gzipped JSON blob.
A blob cannot answer *"the ten most recent articles tagged financing, in Arabic."*
Every competitor is content-model-first for exactly this reason. **This is not a
missing table; it is a second storage mode**, and it reopens ADR-CMS-001.

---

## 3. The market baseline

Derived from what the incumbents actually ship, not from invention. Sources at
the end.

### 3.1 Table stakes — absent any of these, we are not in the evaluation

| # | Capability | Why it is non-negotiable |
|---|---|---|
| T-1 | Structured content modelling — types, typed fields, relationships | The defining feature of every modern CMS |
| T-2 | API-first delivery, REST and GraphQL | Buyers assume the front end is theirs |
| T-3 | Granular permissions and audit-ready workflow | The first thing security review asks for |
| T-4 | Localisation — N locales, fallback chains, translation state | Bilingual is not multilingual |
| T-5 | Multi-site from one instance | Enterprises never have one site |
| T-6 | Redirect management and slug history | Renaming a page must not break inbound links |
| T-7 | Versioning, rollback, scheduling across time zones | Already partly built |
| T-8 | Media management with renditions | Not one binary per asset |
| T-9 | SEO — meta per locale, canonical, sitemap, structured data | Marketing will not sign off without it |
| T-10 | Integrations — CRM, analytics, commerce, DAM | Rarely the system of record for everything |

### 3.2 Differentiators — where the incumbents compete

Personalisation and experimentation (Sitecore, Optimizely, Adobe), an
industry-leading visual editor (Storyblok), a real-time content lake with a
custom query language (Sanity), and full ecosystem lock-in (Adobe).

**We should contest exactly one of these and ignore the rest for now**: the
visual editor, because Puck already gives us a credible starting point and
because it is what business users judge a CMS on in a demo.

### 3.3 Where we can be structurally unbeatable

| # | Claim | Why a competitor cannot match it |
|---|---|---|
| W-1 | Content governed by Dataverse security roles — no second permission model | They are separate systems by construction |
| W-2 | Content never leaves the customer's tenant or region | SaaS CMS vendors host it; that is their model |
| W-3 | Publishing audit inseparable from publishing | Ours is a plugin in the same transaction |
| W-4 | Content authored against live CRM data | They integrate with CRM; we are *in* it |
| W-5 | On-premise **and** cloud from one solution | Almost none of the modern CMS field does on-premise at all |
| W-6 | No new servers, no new vendor, no new procurement | The whole point of a SaaS CMS is a new vendor |

**W-4 is the one worth building the pitch on.** A page that renders a customer's
own loan status, product eligibility or case history — governed by the same roles
that govern the CRM record — is something no headless CMS can do without building
an integration layer the customer then owns forever.

---

## 4. The strategic tension, stated plainly

**W-2 and W-6 are the differentiators. They are also the ceiling.**

Dataverse is not a content delivery network. A public marketing site serving
millions of anonymous page views needs edge caching, and no amount of render-cache
design inside Dynamics changes that. So the product has three possible shapes:

| Shape | Consequence |
|---|---|
| **A — Dynamics only, no exceptions** | Honest to the promise. Caps the addressable market at authenticated portals and low-traffic sites. Rules out marketing-site buyers entirely. |
| **B — Dynamics is the system of record; an optional edge tier publishes outward** | Keeps authoring, governance and residency inside the tenant while making public sites viable. **Weakens "no new servers"** — the edge tier is a new server. |
| **C — Full DXP** | Competes head-on. Not credible at our size. |

**This is the single decision that determines everything below it**, and it is not
mine to make. It is **OQ-1**.

---

## 5. Scope

### 5.1 In scope (subject to OQ-1)

- Structured content modelling: content types, typed fields, relationships, validation
- Taxonomy: hierarchical terms, assignment, per-locale labels
- Multi-site and multi-locale, with fallback chains
- Content delivery API — REST, with GraphQL as a stated intention
- URL management: routes, redirects, slug history
- Scheduling: publish, unpublish, embargo, expiry, review dates
- SEO metadata per entry per locale, sitemap generation, structured data
- Media: renditions, focal point, folders, tags, usage tracking
- Reusable content: snippets and blocks shared across pages
- Component and template definitions as data (closes the FR-30–35 gap)
- Translation state as data: units, source snapshots, jobs (closes the AC-41.2 gap)
- Collaboration: comments, assignment, content locking, notifications
- Webhooks and cache invalidation events
- Preview tokens and shareable draft links
- Per-tenant configuration, quotas and API keys

### 5.2 Out of scope for this engagement

- Personalisation, segmentation and A/B testing — a product in itself; revisit after v1
- Commerce, PIM, marketing automation, campaign management
- A proprietary query language
- Analytics beyond page-view counts and content usage
- Migration tooling from competitor platforms
- Form building — the Dynamic Form Engine owns it

### 5.3 Explicitly excluded, with reason

| Excluded | Reason |
|---|---|
| Authors writing raw HTML, CSS or JS | Unchanged from CMS-ENG-001. A business user pasting markup into a bank's public site is one bad paste from an incident. |
| Free-form colour entry | Token selection preserves brand governance and is the same argument. |
| Competing on personalisation in v1 | Sitecore and Adobe have spent a decade there. Entering late and shallow is worse than not entering. |

---

## 6. Functional requirements

Numbered `PFR-` to keep them distinct from CMS-ENG-001's `FR-`.

### 6.1 Content modelling

| # | Requirement | Priority |
|---|---|---|
| PFR-01 | A modeller shall define a content type with a name, an API identifier and a set of typed fields. | Must |
| PFR-02 | Field types shall include text, long text, rich text, number, boolean, date, media reference, entry reference, taxonomy reference, choice, and JSON. | Must |
| PFR-03 | A field shall declare validation: required, length, pattern, range, allowed types on a reference. | Must |
| PFR-04 | Any field shall be markable localisable; non-localisable fields hold one value across all locales. | Must |
| PFR-05 | A content type shall support a reference field pointing at one or many entries of declared types. | Must |
| PFR-06 | The system shall prevent deletion of a content type or field that has entries, and state how many. | Must |
| PFR-07 | A content type change shall be versioned, and its effect on existing entries reported before it is applied. | Must |
| PFR-08 | Entries shall be queryable by type, field value, taxonomy term, locale and status without decompressing a payload. | Must |
| PFR-09 | A content type shall be exportable and importable as a definition, so a model can move between environments. | Should |

### 6.2 Taxonomy

| # | Requirement | Priority |
|---|---|---|
| PFR-10 | A Power Admin shall define taxonomies with hierarchical terms. | Must |
| PFR-11 | Term labels shall be maintained per locale. | Must |
| PFR-12 | An entry shall carry terms from one or more taxonomies. | Must |
| PFR-13 | The system shall report how many entries use a term before it is retired. | Should |

### 6.3 Sites, locales and URLs

| # | Requirement | Priority |
|---|---|---|
| PFR-20 | A tenant shall host multiple sites, each with its own navigation, theme and locale set. | Must |
| PFR-21 | Locales shall be configurable per site, with a declared fallback chain. | Must |
| PFR-22 | A published entry shall have a route per site per locale. | Must |
| PFR-23 | Renaming a slug shall create a redirect from the previous URL automatically. | Must |
| PFR-24 | An administrator shall manage redirects directly, including permanent, temporary and gone. | Must |
| PFR-25 | Route collisions shall be refused at publish, naming the conflicting entry. | Must |

### 6.4 Delivery

| # | Requirement | Priority |
|---|---|---|
| PFR-30 | A content delivery API shall serve published content filtered by type, locale, site, taxonomy and field value. | Must |
| PFR-31 | The delivery API shall be authenticated per key, with keys scoped to sites and content types. | Must |
| PFR-32 | A preview API shall serve unpublished content to holders of a time-limited token. | Must |
| PFR-33 | Publishing shall emit a webhook naming what changed, so a consumer can invalidate its cache. | Must |
| PFR-34 | The API shall return an entity tag and honour conditional requests. | Should |
| PFR-35 | A GraphQL surface shall be offered over the same content. | Could |

### 6.5 Scheduling and lifecycle

| # | Requirement | Priority |
|---|---|---|
| PFR-40 | An entry shall be scheduled to publish or unpublish at a stated time in a stated time zone. | Must |
| PFR-41 | An entry shall carry a review date and notify its owner when reached. | Should |
| PFR-42 | An entry shall carry an expiry after which it is unpublished automatically, with notice before. | Should |

### 6.6 Media

| # | Requirement | Priority |
|---|---|---|
| PFR-50 | An asset shall generate renditions at defined sizes and formats on upload. | Must |
| PFR-51 | An asset shall carry a focal point honoured by every crop. | Should |
| PFR-52 | Assets shall be organised in folders and tagged, and searchable by both. | Must |
| PFR-53 | The system shall report every entry referencing an asset and refuse deletion while referenced. | Must |

### 6.7 Translation

| # | Requirement | Priority |
|---|---|---|
| PFR-60 | Each translatable field value shall exist as a translation unit with an explicit state. | Must |
| PFR-61 | **A translation unit shall store a snapshot of the source at the moment it was translated**, and staleness shall be computed against that snapshot. | Must |
| PFR-62 | Staleness shall ignore changes in whitespace and in markup that does not alter words. | Must |
| PFR-63 | Translation work shall be groupable into a job that can be exported, worked externally and re-imported. | Must |
| PFR-64 | A glossary shall enforce agreed terminology, warning when a translation contradicts it. | Could |

> **PFR-61 is the requirement this engagement exists to stop getting wrong twice.**
> Without a stored source snapshot, staleness is not computable, and a flag that
> cannot be computed trains people to ignore it.

### 6.8 Collaboration and governance

| # | Requirement | Priority |
|---|---|---|
| PFR-70 | A reviewer shall comment on an entry, and on a specific field. | Must |
| PFR-71 | An entry shall be assignable to a user with a due date. | Should |
| PFR-72 | Concurrent editing shall be prevented by a lock that expires, and the holder shall be named. | Must |
| PFR-73 | Workflow states shall be configurable per content type, not fixed. | Must |
| PFR-74 | Every field-level change shall be attributable — who changed which field, when, from what. | Must |
| PFR-75 | Permissions shall derive from Dataverse security roles, with no parallel permission model. | Must |

### 6.9 Tenancy and operations

| # | Requirement | Priority |
|---|---|---|
| PFR-80 | The solution shall install into a customer tenant without code changes or per-customer branches. | Must |
| PFR-81 | Nothing shall be hardcoded to one customer — no prefixes, GUIDs, locales, or brand values. | Must |
| PFR-82 | An administrator shall see quota consumption: entries, assets, storage, API calls. | Should |
| PFR-83 | The solution shall import to Dataverse cloud and Dynamics on-premise from one artefact. | Must |

---

## 7. Non-functional requirements

| # | Requirement | Target |
|---|---|---|
| PNFR-01 | Delivery API response for a cached entry | p95 < 200 ms |
| PNFR-02 | Editor time to interactive | < 3 s |
| PNFR-03 | Entries supported per tenant without redesign | 100,000 |
| PNFR-04 | Assets supported per tenant | 50,000 |
| PNFR-05 | Content shall remain in the customer's declared region | Absolute |
| PNFR-06 | Authoring UI shall meet WCAG 2.1 AA | Audited |
| PNFR-07 | Published output shall meet WCAG 2.1 AA | Audited |
| PNFR-08 | Editor shall function under a restrictive CSP with no external loads | Absolute |
| PNFR-09 | No silent truncation of any stored payload | Absolute |

> **PNFR-03 is the number that breaks the current design.** CMS-ENG-001 stores a
> page as a blob and queries by slug. 100,000 queryable entries filtered by field
> value is a different data model, and it is why PFR-08 exists.

---

## 8. Assumptions

| # | Assumption | If wrong |
|---|---|---|
| A-1 | Target customers already run Dynamics or Dataverse | The wedge disappears; this becomes a generic CMS with no advantage |
| A-2 | Dataverse can hold 100,000 entries with acceptable query performance | Needs an index or read-model strategy; possibly a search service |
| A-3 | Buyers accept authoring inside a Dynamics model-driven shell | The editor needs to be a standalone app, changing the delivery model |
| A-4 | One publisher prefix `msst` works for every customer | Multi-tenant naming needs rethinking |
| A-5 | The Puck licence permits commercial redistribution in a sold product | The editor foundation must be replaced |

> **A-5 has not been checked and is a licence question with commercial
> consequences.** CMS-ENG-001 adopted Puck for one client's internal use. Selling
> a product that embeds it is a different act.

---

## 9. Open questions requiring sign-off

**None of these can be answered by the engineering team, and the first three
change the architecture.**

| # | Question | Owner | Blocks |
|---|---|---|---|
| **OQ-1** | **Which shape — A (Dynamics only), B (Dynamics plus an optional edge tier), or C (full DXP)?** §4 sets out the trade. | CEO | Everything |
| **OQ-2** | Who is the buyer? Regulated enterprises on Dynamics in the GCC, or the general CMS market? | CEO | Positioning, pricing, PFR-80 |
| **OQ-3** | Is the customer's own front end always theirs, or do we ship a renderer? | CEO / Architect | PFR-30, delivery scope |
| **OQ-4** | Is QDB the first customer of the product, or does the product fork from their build? | CEO | Whether CMS-ENG-001 Phase A continues as-is |
| **OQ-5** | What is the commercial model — licence, subscription, per-tenant, per-seat? | CEO | Quotas, metering, PFR-82 |
| **OQ-6** | Does the Puck licence permit redistribution in a commercial product? | Legal | A-5, the editor foundation |
| **OQ-7** | Is there budget and headcount for a multi-year product, or is this opportunistic? | CEO | Phasing, and whether to start at all |

---

## 10. Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Competing head-on with vendors 100× our size | **High** | Wedge strategy in §3.3; refuse the feature race explicitly |
| R-2 | Dataverse query performance at 100,000 entries | **High** | Prove it with a spike before committing to PFR-08 |
| R-3 | Building a product with one customer's requirements | High | PFR-81; treat QDB as a customer, not the specification |
| R-4 | The edge tier destroys the "no new servers" promise | High | OQ-1 decides this deliberately rather than by drift |
| R-5 | Puck licence blocks commercial use | Medium | OQ-6, before more is built on it |
| R-6 | Scope large enough to stall CMS-ENG-001 Phase A | Medium | OQ-4; the QDB build should not be paused for this |
| R-7 | On-premise parity doubles the test matrix | Medium | Already handled in principle — same message names, one code path |

> **R-2 is the one to test first.** Everything in §6.1 assumes Dataverse can be
> queried like a content repository. If it cannot at this scale, the product needs
> a read model, and that is a different architecture — better to know in a week
> than in a year.

---

## 11. Recommended phasing

| Phase | Delivers | Rationale |
|---|---|---|
| **P0 — prove it** | Spike: 100,000 entries in Dataverse, queried by field, locale and taxonomy | R-2 invalidates the plan if it fails. Two weeks, before anything else |
| **P1 — the model** | Content types, fields, entries, taxonomy, translation units with source snapshots | Nothing is a platform without this |
| **P2 — delivery** | Content API, keys, preview tokens, webhooks, routes, redirects | Makes it usable by someone else's front end |
| **P3 — scale of use** | Multi-site, N locales, scheduling, media renditions, SEO | Table stakes for the evaluation |
| **P4 — the editor** | Visual authoring over the content model, components and templates as data | The demo-winning surface, on foundations that exist |

**P0 must precede everything.** Committing to a content platform on an unproven
storage assumption is how a year gets spent.

---

## 12. Recommendation to the CEO

**Approve the BA phase output. Do not approve a build.**

Specifically:

1. **Answer OQ-1 first.** Shapes A and B are different products with different
   buyers. Everything downstream depends on it.
2. **Fund P0 only** — a two-week spike against R-2. It is cheap and it can
   invalidate the entire plan, which is exactly what a first phase should be able
   to do.
3. **Do not pause CMS-ENG-001.** QDB's Phase A is close to useful and is the
   proof the wedge works. Stopping it to chase a platform would forfeit both.
4. **Get OQ-6 answered by someone qualified** before another line is written on
   Puck.

**The honest summary:** the market position is real and defensible, the
engineering foundation is genuinely proven, and the gap between what exists and
what is described here is on the order of **45 to 60 tables and several years**,
not a few sprints. That is a fundable product plan. It is not a quarter's work,
and any plan that says otherwise is wrong.

---

## Sources

Market baseline in §3 derived from:

- [Sanity vs Contentful vs Storyblok vs Strapi: Headless CMS Comparison (2026) — Attract Group](https://attractgroup.com/blog/headless-cms-comparison/)
- [Headless CMS Comparison 2026 — Cosmic](https://www.cosmicjs.com/blog/headless-cms-comparison-2026-cosmic-contentful-strapi-sanity-prismic-hygraph)
- [Sanity vs Strapi vs Storyblok in 2026: An Honest Comparison for Enterprise Teams — Octahedroid](https://octahedroid.com/blog/sanity-vs-strapi-vs-storyblok)
- [Enterprise CMS guide to legacy replatforming in 2026 — Brightspot](https://www.brightspot.com/cms-resources/cms-selection-guide/best-enterprise-cms-for-legacy-replatforming-guide)
- [How to choose an enterprise CMS in 2026 — Brightspot](https://www.brightspot.com/cms-resources/cms-insights/how-to-choose-an-enterprise-cms-in-2026)
- [Your detailed guide to enterprise CMS — Optimizely](https://www.optimizely.com/insights/blog/enterprise-cms-guide/)
- [Sitecore, Contentful, Adobe… or something else? — Tapptic](https://www.tapptic.com/sitecore-contentful-adobe-or-something-else-a-clear-eyed-guide-to-the-cms-platforms-worth-comparing/)
