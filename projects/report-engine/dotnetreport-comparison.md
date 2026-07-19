# DotNetReport vs. Maqsad Report Engine (RPT-ENG-001) — Feature Comparison

**Date:** 2026-07-16 · **Source:** github.com/dotnetreport (main repo, open-source JS frontend, ~77★, commercial core) + dotnetreport.com/features

## What DotNetReport is (context)
A generic **ad-hoc reporting / dashboard tool for .NET** that embeds in any app via a NuGet package + two API endpoints. Its data model is **relational SQL** (tables/columns/joins over a SQL database). The **frontend is open-source (MIT-ish, JS)**; the **core engine is a commercial product** with paid tiers. It is *not* Dynamics-CRM/Dataverse aware.

**Bottom line:** confirms our GitHub-research verdict — **build, don't adopt**. DotNetReport can't consume the Dataverse metadata model, FetchXML/QueryExpression, CRM security, or CRM ribbon surfaces. But it's a strong **feature yardstick**, and it has 3–4 capabilities worth adding to our roadmap.

---

## Side-by-side capability comparison

| Capability | DotNetReport | Maqsad Report Engine (built/designed) | Verdict |
|---|---|---|---|
| **Report builder UI** | Drag-drop, "Live Designer", no-SQL | Fluent/Power-Platform designer + **10-step guided wizard** | ✅ Parity+ |
| **Data source** | Relational SQL DB(s) | **11 source types** — CRM View, FetchXML, QueryExpression, Web API, Custom API, SQL, REST, Middleware, Core Banking, MIS, Static | ✅ Ours broader |
| **Multi-entity joins** | SQL joins, dynamic joins | **Inner / Left / Right joins** across CRM entities + key mapping | ✅ Parity |
| **External / cross-system data** | Multiple SQL connections | **Admin-configured connectors + bidirectional CRM↔external parameter passing** (send customer no. → Core Banking, pull balances back) | ✅ Ours richer |
| **Calculated fields / formulas** | Math/string/date/conditional | **NCalc sandboxed formulas** (no code-exec) | ✅ Parity |
| **Filters** | AND/OR groups, dynamic dates, multi-select, **cascading dropdowns**, forced (security) filters | AND/OR groups, Last X days/This month/This year, typed inputs, context tokens, **security-role filters** | ⚠️ Missing **cascading/dependent dropdowns** |
| **Parameters** | Runtime prompts | Typed parameter designer + context tokens (user/BU/record/entity) | ✅ Parity |
| **Transformations / ETL** | Grouping, pivot, running totals, %-of-total | **21-op ETL pipeline** (filter, derive, aggregate, join, pivot, unpivot, dedupe, cast, fill-nulls, currency-convert, mask…) | ⚠️ We lack **running totals / %-of-total** presets |
| **Drilldown** | Click-through to filtered detail | Single-level (V1) → multi-level configurable, sub-reports, clickable rows open CRM records | ✅ Parity+ |
| **Pivot / cross-tab** | Yes, expandable groups | Matrix + Pivot layouts | ✅ Parity |
| **Chart types** | 12+ incl. **heatmap, treemap, geo/map, gauge, combo** | Chart/KPI/Dashboard layouts (bar/line/pie/KPI) | ⚠️ Missing **heatmap, treemap, geo-map, gauge, combo** |
| **Layout variety** | Table, pivot, cards, chart, dashboard | **25 layout types** incl. document (invoice, statement, certificate, letter, book), kanban, gantt, org-chart, calendar, timeline, tree, master-detail, nested, comparison | ✅ **Ours far broader** |
| **Dashboards** | **Drag-drop multi-widget composer**, global synchronized filters, real-time | Dashboard layout type (KPIs + chart) | ⚠️ Missing **multi-widget drag-drop dashboard composer + global filters** |
| **Export** | PDF, Excel, CSV, XML, Word | **PDF, Excel, CSV, Word, Image/PNG, HTML** | ✅ Parity (we add PNG/HTML; they add XML) |
| **Scheduling / delivery** | **Cron schedules + auto email + PDF snapshots** | Deferred to later release (BRD out-of-scope v1) | ❌ **Gap — they have it, we deferred** |
| **AI / natural language** | **"Ask in plain English" → auto report + chart** | Not present | ❌ **Gap — strong differentiator** |
| **Security** | RBAC, row-level, field-level, multi-tenant, forced filters | CRM RBAC, owner/approver, masking, data-source ACL, BU multi-tenancy, append-only audit | ✅ Parity |
| **Governance** | Admin/audit mode, folder permissions | **Draft/Published gate, approver ≠ author, version snapshots, clone, execution logs, append-only audit** | ✅ Ours stronger |
| **Multi-language / RTL** | Not advertised | **9-language incl. Arabic/Urdu RTL** with translated labels | ✅ **Ours unique** |
| **Theming / branding** | White-label, custom branding | **9-theme gallery (colours + fonts)** per report | ✅ Parity+ |
| **CRM-native surfacing** | Embed in app (generic) | **Ribbon placement: Form / Grid / Subgrid / Dashboard / Sitemap** with CRM context passing | ✅ **Ours unique (Dynamics-native)** |
| **On-prem / cloud** | Cloud defs + on-prem/air-gapped SQL exec ("zero data exposure") | Dynamics 365 on-prem 9.x **and** Dataverse cloud; middle-tier; on-prem→cloud path | ✅ Parity (diff. model) |
| **SSRS / legacy migration** | Migration tools from Izenda/SSRS/Exago | **SSRS-migration path in wizard** (inventory → classify → migrate) | ✅ Parity |
| **Embedding** | **1 NuGet + 2 endpoints**, any JS framework | CRM web resource + middle-tier API | ➖ Different model (ours CRM-scoped) |

---

## Where we already lead (our edge)
1. **Dynamics-native** — Dataverse metadata model, FetchXML/QueryExpression/Web-API/Custom-API abstraction, CRM security, and **ribbon placement (Form/Grid/Dashboard/Subgrid/Sitemap)** with automatic CRM context. DotNetReport is generic SQL.
2. **Bidirectional CRM↔external blending** — pass keys/params both ways to Core Banking / MIS / SQL / REST. DotNetReport just adds SQL connections.
3. **25 layout types** incl. document-style (invoice, statement, certificate, letter, book), kanban, gantt, org-chart, calendar, timeline, tree — well beyond their ~12 charts + pivot.
4. **Multi-language + Arabic/Urdu RTL** — not something they offer.
5. **Governance depth** — maker-checker (approver ≠ author), immutable version snapshots, clone, append-only audit, execution logs.
6. **On-prem Dynamics 9.x** first-class (they target SQL apps).

## Where they lead — candidate additions to our roadmap (prioritised)
| # | Gap | Value | Suggested release |
|---|---|---|---|
| G-1 | **Scheduled delivery** (cron + email + PDF snapshot) | High — most-requested enterprise feature; we explicitly deferred it | V2 (promote if QDB needs it) |
| G-2 | **AI natural-language report generation** ("ask in plain English") | High — differentiator; fits our Claude API stack | V2/V3 spike |
| G-3 | **Drag-drop multi-widget dashboard composer** + global synchronized filters | High — we have a Dashboard *layout*, not a *composer* | V2 |
| G-4 | **Cascading / dependent dropdown filters** (parent → child) | Medium | V2 |
| G-5 | **More chart types** — heatmap, treemap, geo/map, gauge, combo | Medium (ScottPlot covers some; geo/treemap need libs) | V2 |
| G-6 | **Running totals & percentage-of-total** transform presets | Low–Medium — easy add to the ETL pipeline | V1.1 (cheap) |
| G-7 | **XML export** for data pipelines | Low | V2 |

## Recommendation
- **Keep building our engine** — DotNetReport validates the feature bar but cannot be adopted for a Dataverse-native, CRM-embedded product.
- **Fold G-6 (running totals / %-of-total)** into the V1 ETL op list now — trivial and closes an obvious gap.
- **Elevate G-1 (scheduling) and G-3 (dashboard composer)** as the top V2 candidates; **G-2 (AI NL reports)** as a V2/V3 spike leveraging the Claude API (already a Maqsad service line).
- Everything else we either match or exceed.
