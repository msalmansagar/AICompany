# RPT-ENG-001 — Enterprise Reporting/BI Feature Comparison

**Date:** 2026-07-19 · **Subject:** Maqsad "Report Engine + Designer" (QDB) vs. the enterprise reporting/BI capability set
**Benchmark set:** Power BI, SSRS, Tableau, Cognos Analytics, SAP BusinessObjects / Crystal Reports, MicroStrategy, and embedded-BI tools (Logi / Izenda / Exago / DotNetReport).

## How to read this
This compares our engine against what an **enterprise buyer expects**, not against one product. Our engine is at **prototype + approved-architecture** stage (BA + CEO + GitHub research + Phase-3 done; Phase-4 build not yet authorised), so status reflects that:

| Legend | Meaning |
|---|---|
| ✅ | **Built** in the interactive prototype (UI + behaviour) and/or covered by the approved architecture |
| 🏗 | **Designed** in the architecture but not yet built (engine, real query/exec, real exports) |
| ⚠️ | **Partial** — basic version present, enterprise-depth pending |
| ❌ | **Gap** — not in scope yet / roadmap |

---

## 1. Capability matrix

### A. Authoring & design
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| No-code report designer | Drag-drop / guided, no SQL | ✅ | Guided **wizard** + **manual banded** designer; parity between them |
| Report templates | Prebuilt starters | ✅ | Loan-by-branch, Overdue, KPI, Invoice, **Workflow History (table+timeline)**, **SLA Compliance** |
| Layout variety | Table, matrix, chart, dashboard, document | ✅ | **26 layout types** incl. invoice/statement/certificate/letter/book/kanban/gantt/org-chart/calendar/timeline/tree |
| **Sub-reports** | Embed a report within a report | ✅ | Creatable in wizard, manual designer, and drilldown tab; link field |
| Rendering styles / theming | Themes, white-label | ✅ | 6 render styles (report/modern/minimal/dark/glass/vibrant), 9 report themes, 4 app themes |
| WYSIWYG live preview | Instant preview | ✅ | Live per-layout, per-theme, per-language preview |

### B. Data connectivity & modelling
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| Multiple data sources | SQL, APIs, files | ✅ | **11 source types** — CRM View, FetchXML, QueryExpression, Web API, Custom API, SQL, REST, Middleware, Core Banking, MIS, Static |
| **Reusable data source registry** | Define once, reuse | ✅ | Shared registry; both flows **select an existing source** instead of re-defining |
| Multi-entity joins | Inner/left/right | ✅ | Across CRM entities with key mapping |
| External / cross-system blending | Multiple connections | ✅ | Admin-configured connectors + **bidirectional CRM↔external** parameter passing |
| Calculated fields / formulas | Expression language | ✅ / 🏗 | Designer UI ✅; runtime = **NCalc** (sandboxed, no code-exec) 🏗 |
| Transformations / ETL | Group, pivot, derive | ✅ / 🏗 | 21-op pipeline UI ✅; execution engine 🏗 |
| **Semantic model / reusable measures** | Shared measures, hierarchies | ❌ | Per-report binding only; no shared semantic layer yet |

### C. Visualisation & dashboards
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| Chart types | Bar/line/pie/area + advanced | ✅ / ⚠️ | 6 core types (**Recharts** adopted); treemap/heatmap/geo/gauge-combo = ECharts fast-follow |
| KPI / metric / gauge tiles | Yes | ✅ | Metric, gauge, progress, status badge |
| Table / matrix / pivot | Yes | ✅ | Table + matrix (cross-tab) widgets |
| **Dashboard composer** | Multi-widget canvas | ✅ | **Section-based (1–4 cols)** grid, 10 widget types, per-tile data binding, drag-drop, placeholders |
| Info cards (icon+label+total) | — | ✅ | Icon + label + total, drill-enabled |
| Geospatial / maps | Map visuals | ❌ | Roadmap |

### D. Interactivity
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| Drill-down / drill-through | Click to detail | ✅ | Single-level V1, multi-level V2; click-to-drill on charts |
| **Cross-filtering** | Click a visual → filter page | ✅ | Dashboard cross-filter (entity-exact) + slicer filter bar |
| Slicers / interactive filters | Runtime filter bar | ✅ | Filter bar with slicers on dashboards; applied-filter chips on reports |
| Parameters | Runtime prompts | ✅ | Typed parameters + context tokens (user/BU/record) |
| **Pass CRM fields as parameters** | Context field passing | ✅ | Use-in-CRM step: pick fields → passed as parameters at run time |
| Undo/redo, duplicate | Authoring UX | ✅ | Dashboard composer: undo/redo (Ctrl+Z/Y) + duplicate widget/section |
| Cascading / dependent filters | Parent→child | ❌ | Gap (parity item vs Power BI/DotNetReport) |

### E. Filtering, formatting, calculation
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| Filters (AND/OR, dynamic dates) | Yes | ✅ | AND/OR groups, Last-X-days/This-month/This-year, typed inputs |
| Security / forced filters | Row-scoped | ⚠️ | Security-role filters in UI; real **RLS enforcement** = 🏗/gap |
| Conditional formatting | Rule-based styling | ✅ | Cond.-formatting tab (rules → styles) |
| Running totals / %-of-total | Presets | ⚠️ | Folded into ETL op list; not yet one-click presets |

### F. Export & delivery
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| Export formats | PDF/Excel/CSV/Word/Image | ✅ / 🏗 | UI ✅ (PDF/Excel/CSV/Word/PNG/HTML); engines 🏗 (QuestPDF/ClosedXML/OpenXML/ScottPlot) |
| **Scheduling / bursting / subscriptions** | Cron + email + snapshots | ❌ | **Key enterprise gap** — deferred; top V2 candidate |
| Alerting / data-driven notifications | Threshold alerts | ❌ | Roadmap |

### G. Embedding & surfacing
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| In-app / portal embedding | iframe / SDK | ✅ / 🏗 | Runs as CRM web resource + middle-tier API |
| **CRM-native surfacing** | Ribbon / form / grid | ✅ | Form/Grid/Subgrid/Dashboard/Sitemap placement with automatic CRM context — **differentiator** |
| Public API for embedding | REST | 🏗 | Contracts designed (Phase-3) |

### H. Security & governance
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| RBAC | Role-based access | ⚠️ | CRM RBAC model in design; enforcement 🏗 |
| Row-level / field-level security | RLS, masking | ⚠️ | Masking in ETL; **per-widget entity permission check** is a hard V2-Dashboard requirement |
| **Maker-checker (approver ≠ author)** | Approval workflow | ✅ | Draft/Published gate + approver + version snapshots |
| Versioning & snapshots | History, rollback | ✅ | Immutable version snapshots |
| Audit trail | Append-only | ✅ | Append-only audit log + execution logs |
| Multi-tenancy / BU isolation | Yes | ✅ | Business-unit multi-tenancy in design |

### I. Platform, scale, localisation
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| On-prem / cloud / hybrid | All three | ✅ | Dynamics **on-prem 9.x AND Dataverse cloud** + on-prem→cloud path — differentiator |
| Async / staged execution + cache | Large jobs | 🏗 | Middle-tier async/staged + cache designed |
| Performance at scale | Throttle-safe | 🏗 | **Dashboard fan-out spike (gate DC-1)** required pre-build |
| **Localisation / i18n / RTL** | Multi-language | ✅ | 9 languages incl. **Arabic/Urdu RTL** — differentiator |
| Mobile / responsive | Mobile layouts | ⚠️ | Responsive CSS; no dedicated mobile authoring/rendering |
| SSRS / legacy migration | Import tooling | ⚠️ | SSRS-migration path in wizard (inventory→classify→migrate) |

### J. Modern / AI
| Capability | Enterprise expectation | Ours | Notes |
|---|---|---|---|
| NL query ("ask in English") | Yes (leaders) | ❌ | Roadmap — fits Maqsad's Claude API line |
| Auto-insights / narrative | Yes (leaders) | ❌ | Roadmap |
| Anomaly / risk detection | Emerging | ⚠️ | Distress/risk badge is a seed; no ML |
| **Data-quality surfacing** | Rare | ⚠️/✅ | Customer-360 **data-quality disclaimer** is a mandated go-live condition — ahead of most |

---

## 2. Where our engine leads (enterprise edge)
1. **Dynamics-native** — Dataverse metadata model, FetchXML/QueryExpression/Web-API abstraction, CRM security, and **ribbon surfacing with automatic context**. Generic BI tools bolt on; we're native.
2. **Bidirectional CRM↔external blending** — pass keys both ways to Core Banking / MIS / SQL / REST in one report.
3. **On-prem 9.x + cloud, one product** — few enterprise BI tools serve air-gapped on-prem Dynamics *and* cloud from one metadata model.
4. **Governance depth** — maker-checker, immutable versioning, append-only audit, execution logs — stronger than most embedded-BI tools.
5. **Arabic/Urdu RTL + 9 languages** — first-class, not an afterthought.
6. **Layout breadth (26 types)** incl. document-style reports beyond dashboards.
7. **Reusable data-source registry** + **sub-reports** + **pass-fields-as-parameters** — mature authoring model.

## 3. Gaps vs. enterprise (prioritised)
| # | Gap | Enterprise weight | Suggested release |
|---|---|---|---|
| G-1 | **Scheduling / bursting / email subscriptions** | High — table-stakes for enterprise | V2 |
| G-2 | **Row-level / field-level security enforcement** | High — compliance | V1.x/V2 (hard req) |
| G-3 | **Semantic layer / reusable measures & hierarchies** | High — self-service BI | V2/V3 |
| G-4 | **AI: NL query + auto-insights** | High — differentiator | V2/V3 spike (Claude API) |
| G-5 | Advanced charts (treemap/heatmap/geo/combo) | Medium | V2 (ECharts) |
| G-6 | Cascading/dependent filters | Medium | V2 |
| G-7 | Data-driven alerting | Medium | V2/V3 |
| G-8 | Mobile-native authoring/rendering | Medium | V3 |
| G-9 | Real export/query engines wired (currently designed) | — | **Phase-4 build** |

## 4. Verdict
Against the enterprise capability set, the engine is **strong on authoring, layout breadth, CRM-native surfacing, multi-source blending, governance, and localisation** — matching or exceeding embedded-BI tools and, in CRM-native + on-prem/cloud reach, exceeding the generic BI leaders. It **trails the BI leaders** on **scheduling/distribution, enforced row/field security, a semantic layer, and AI-driven analytics** — all known, roadmapped, and none blocking the core V1 (metadata report engine) or the CEO-approved **V2-Dashboard** increment.

Positioning: **not a Power BI replacement for ad-hoc self-service analytics**, but a **superior CRM-embedded, governed, multi-lingual, on-prem-capable operational reporting + dashboard platform** for Dynamics — with a credible fast-follow path to close the enterprise gaps.

_Companion doc: `dotnetreport-comparison.md` (product-specific comparison)._
