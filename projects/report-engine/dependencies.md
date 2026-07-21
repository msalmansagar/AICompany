# RPT-ENG-001 — Dependency Adoption Register

**Engagement:** Report Engine + Designer for Dynamics 365 CRM on-prem 9.x and Dataverse cloud  
**Date:** 2026-07-07  
**Researcher:** github-researcher agent  
**Stack:** ASP.NET Core (C#/.NET) middle tier + React + Fluent UI designer web resource  
**Required exports:** PDF, XLSX, CSV, DOCX, PNG — on-prem and cloud

---

## Area 1 — Safe Expression / Formula Evaluation

Requirement: sandboxed, non-Turing-complete evaluation for calculated fields (FR-011, FR-067). Hard security condition C-5: NO arbitrary code execution.

| Library | Repo | Stars | License | Last Commit | Verdict |
|---|---|---|---|---|---|
| **NCalc** | [ncalc/ncalc](https://github.com/ncalc/ncalc) | 1.1k | MIT | Active 2026 | **ADOPT** |
| DynamicExpresso | [dynamicexpresso/DynamicExpresso](https://github.com/dynamicexpresso/DynamicExpresso) | 2.2k | MIT | Oct 2025 | SKIP — C-5 risk |
| Jint | [sebastienros/jint](https://github.com/sebastienros/jint) | 4.7k | BSD-2 | Jul 2026 | SKIP — C-5 risk |

**Decision: ADOPT NCalc**

NCalc parses a closed DSL of math and logical operators, parameters, and built-in functions. It cannot reference .NET types, invoke reflection, or load assemblies — it is structurally non-Turing-complete. This satisfies C-5 by design, not by configuration.

DynamicExpresso interprets actual C# expressions compiled to lambdas. Although reflection is blocked by default and type access is gated, it is fundamentally a C# interpreter — C-5 is satisfied only if the configuration is never changed. Reject for a security-critical boundary.

Jint is a full ECMAScript engine. It supports memory/statement/timeout limits and CLR access can be disabled, but it executes arbitrary JavaScript. Any misconfiguration exposes the middle tier. Flag as **C-5 violation** if used without a comprehensive security review ADR.

**Recommended package:** `NCalc2` (maintained fork, NuGet) or `ncalc` from the ncalc org.

---

## Area 2 — PDF Generation

Requirement: produce styled PDF reports on-prem (no internet) and in Azure. HTML-to-PDF and code-first both acceptable.

| Library | Repo | Stars | License | Last Commit | On-Prem | Verdict |
|---|---|---|---|---|---|---|
| **QuestPDF** | [QuestPDF/QuestPDF](https://github.com/QuestPDF/QuestPDF) | 14.1k | Dual — see below | Jul 2026 | Yes | **ADOPT** |
| PdfSharp + MigraDoc | [empira/PDFsharp](https://github.com/empira/PDFsharp) | 961 | MIT | Active 2026 | Yes | FALLBACK |
| iText7 | [itext/itext7-dotnet](https://github.com/criipto/itext7-dotnet) | N/A | AGPL-3.0 | Active | Yes | **LICENSE TRAP** |
| DinkToPdf (wkhtmltopdf) | [rdvojmoc/DinkToPdf](https://github.com/rdvojmoc/DinkToPdf) | 1.2k | MIT | 2017 | Yes | ABANDONED |

**Decision: SUPERSEDED — now ADOPT PdfSharp/MigraDoc (MIT). See ADR-RPT-009.**

> **2026-07-21 (ADR-RPT-009):** QuestPDF's Community license excludes organizations over ~$1M
> revenue; QDB (a national development bank) exceeds that, so QuestPDF Community is not usable and
> attesting eligibility would be false. PDF export now uses **PdfSharp/MigraDoc (MIT)** — no revenue
> gate. The QuestPDF go-live license check is removed for the PDF path. Original QuestPDF rationale
> retained below for history.

**Original decision (historical): ADOPT QuestPDF**

QuestPDF (14.1k stars, v2026.7.0) offers a fluent C# API for code-first PDF layout, requires no internet at runtime, and runs on Windows and Linux. It is the most actively maintained .NET PDF library.

**LICENSE TRAP — QuestPDF:** Free for individuals, non-profits, open-source projects, and organizations under **$1M annual revenue**. Organizations above that threshold require a paid commercial license. Maqsad AI must verify its revenue tier before shipping and budget for a commercial license if applicable. This condition must appear in the project's go-live checklist.

**LICENSE TRAP — iText7:** Dual AGPL-3.0 / commercial. AGPL-3.0 requires the entire application to be open-sourced unless a commercial license is purchased. **Do not use iText7 under the AGPL in any commercial or proprietary product.**

DinkToPdf is MIT but its last release is from April 2017 and it wraps the now-unmaintained wkhtmltopdf binary. Reject on abandonment grounds.

PdfSharp/MigraDoc (MIT, 961 stars — just below the 1k threshold) is acceptable as a contingency if QuestPDF licensing becomes a blocker. It supports .NET 6/8/9/10.

---

## Area 3 — Word / .docx Generation

Requirement: export reports as .docx with headers, tables, and conditional sections.

| Library | Repo | Stars | License | Last Commit | Verdict |
|---|---|---|---|---|---|
| **Open XML SDK** | [dotnet/Open-XML-SDK](https://github.com/dotnet/Open-XML-SDK) | 4.6k | MIT | Mar 2026 | **ADOPT** |
| DocxTemplater | [Amberg/DocxTemplater](https://github.com/Amberg/DocxTemplater) | 128 | MIT | Jul 2026 | BELOW THRESHOLD |

**Decision: ADOPT Open XML SDK**

The Microsoft Open XML SDK (4.6k stars, v3.5.1, March 2026) is the canonical MIT-licensed library for .docx manipulation. It provides complete programmatic control over Word content. It is low-level but reliable and carries no license risk.

DocxTemplater has strong template features (placeholders, loops, conditional blocks, image embedding, Markdown-to-OpenXML) and is actively maintained as of July 2026. However, at 128 stars it does not meet the 1000-star adoption threshold. It may be evaluated again if it grows, or adopted selectively if the template complexity outweighs the maintenance risk — requires a separate ADR.

**Recommended approach:** Use Open XML SDK as the foundation. For template-driven generation (e.g., user-provided .docx templates with placeholders), build a thin template-substitution layer over the SDK rather than adopting DocxTemplater.

---

## Area 4 — Excel / .xlsx Generation

Requirement: export report data as Excel with formatting, formulas, and column headers.

| Library | Repo | Stars | License | Last Commit | Verdict |
|---|---|---|---|---|---|
| **ClosedXML** | [ClosedXML/ClosedXML](https://github.com/ClosedXML/ClosedXML) | 5.6k | MIT | May 2025 | **ADOPT** |
| EPPlus | [EPPlusSoftware/EPPlus](https://github.com/EPPlusSoftware/EPPlus) | 2k | Polyform Noncommercial | Jun 2026 | **LICENSE TRAP** |
| Open XML SDK | [dotnet/Open-XML-SDK](https://github.com/dotnet/Open-XML-SDK) | 4.6k | MIT | Mar 2026 | FALLBACK |

**Decision: ADOPT ClosedXML**

ClosedXML (5.6k stars, MIT) provides a high-level fluent API over Open XML for Excel generation. It covers formatting, cell styles, formulas, merged cells, and named ranges. Suitable for datasets up to ~100k rows without performance concerns at typical report scales.

**LICENSE TRAP — EPPlus:** EPPlus v5+ changed from LGPL to **Polyform Noncommercial 1.0.0**. Commercial use requires a paid license. Do not use EPPlus in this engagement without a purchased license. EPPlus has 2k stars and is actively maintained (v8.6.1 in June 2026) but its license disqualifies it for this project.

Note: ClosedXML's last release was May 2025 (v0.105.0). Activity should be monitored. Open XML SDK is an MIT fallback if ClosedXML stalls.

---

## Area 5 — Server-Side Chart-to-Image (PNG)

Requirement: render chart/KPI exports as PNG server-side for inclusion in PDF and image exports (FR-076, FR-086). Must work headless on Windows and Linux.

| Library | Repo | Stars | License | Last Commit | Headless | Verdict |
|---|---|---|---|---|---|---|
| **ScottPlot** | [ScottPlot/ScottPlot](https://github.com/ScottPlot/ScottPlot) | 6.7k | MIT | Active 2026 | Yes | **ADOPT** |
| OxyPlot | [oxyplot/oxyplot](https://github.com/oxyplot/oxyplot) | 3.5k | MIT | Active | Partial | ADAPT or skip |

**Decision: ADOPT ScottPlot**

ScottPlot (6.7k stars, MIT) explicitly supports Console applications and Blazor server-side rendering, confirming it works in ASP.NET Core without a GUI. PNG export is documented. It renders bar charts, line plots, pie charts, and scatter plots — the primary chart types needed for report KPIs.

OxyPlot (3.5k stars, MIT) has a PNG exporter, but it depends on WPF or WinForms platform packages for PNG rendering. A community ImageSharp-based port exists but is not in the main release. On Linux containers, OxyPlot PNG export is unreliable without the custom port. Reject in favour of ScottPlot's clean headless story.

---

## Area 6 — Query Building / FetchXML / Dataverse SDK

Requirement: execute FetchXML and QueryExpression queries against both CRM on-prem 9.x and Dataverse cloud from the ASP.NET Core service.

| Library | Repo | Stars | License | Last Commit | Verdict |
|---|---|---|---|---|---|
| **PowerPlatform.Dataverse.Client** | [microsoft/PowerPlatform-DataverseServiceClient](https://github.com/microsoft/PowerPlatform-DataverseServiceClient) | 315 | MIT | Jun 2025 | **ADOPT (official)** |
| Microsoft.Xrm.Sdk (NuGet) | NuGet only (SDK.CrmSdk.*) | N/A | Microsoft EULA | Active | **ADOPT (on-prem)** |

**Decision: ADOPT both official Microsoft SDKs**

Neither SDK meets the 1000-star threshold, but they are the only sanctioned, officially-supported Microsoft SDKs for their respective targets. No third-party alternative exists:

- **Microsoft.PowerPlatform.Dataverse.Client** (NuGet: `Microsoft.PowerPlatform.Dataverse.Client`) — for Dataverse cloud. MIT license. Latest stable: v1.2.9 (Jun 2025).
- **Microsoft.CrmSdk.CoreAssemblies / Microsoft.CrmSdk.XrmTooling.CoreAssembly** (NuGet) — for CRM on-prem 9.x Organization Service.

No high-star OSS FetchXML builder library for embedding was found. **Build a thin `FetchXmlQueryBuilder` service class** wrapping the Microsoft SDK's `QueryExpression` API. This is a small, well-understood component, not a reason to block the decision.

---

## Area 7 — Visual Query / Filter Builder (React)

Requirement: drag-and-drop condition builder for filter designer (FR-006) and advanced conditions (FR-049). Must integrate with Fluent UI.

| Library | Repo | Stars | License | Last Commit | Fluent UI | Verdict |
|---|---|---|---|---|---|---|
| **react-querybuilder** | [react-querybuilder/react-querybuilder](https://github.com/react-querybuilder/react-querybuilder) | 1.7k | MIT | Jun 2026 | Official package | **ADOPT** |
| react-awesome-query-builder | [ukrbublik/react-awesome-query-builder](https://github.com/ukrbublik/react-awesome-query-builder) | 2.3k | MIT | May 2025 | Supported | ADAPT |

**Decision: ADOPT react-querybuilder**

react-querybuilder (1.7k stars, MIT, v8.20.2 as of June 2026) has an **official `@react-querybuilder/fluent` compatibility package** — meaning Fluent UI integration is first-class and maintained by the project authors, not a community patch. TypeScript is 70% of the codebase. It exports queries to SQL, MongoDB, and custom formats, which maps well to FetchXML generation.

react-awesome-query-builder (2.3k stars, MIT) supports Fluent UI but its last release was May 2025 (over a year before go-live). The slower cadence is a risk for a dependency in the designer UI. Prefer react-querybuilder for its 2026 maintenance track.

**Integration approach:** Use `@react-querybuilder/fluent` as the filter designer component. Wire its JSON output to a `FetchXmlQueryBuilder` on the C# service layer via a POST to the middle-tier. Add a `formatQuery('json')` → FetchXML converter in the TypeScript web resource layer.

---

## Area 8 — Data Grid (React, column selector / preview)

Requirement: column selector and data preview grid in the designer (FR-021, FR-030).

| Library | Repo | Stars | License | Verdict |
|---|---|---|---|---|
| Fluent UI DataGrid (`@fluentui/react-components`) | Microsoft (bundled) | N/A | MIT | **ADOPT (already in stack)** |

**Decision: ADOPT Fluent UI DataGrid**

`@fluentui/react-components` (the v9 Fluent UI package) ships `DataGrid` with sorting, column resizing, row selection, and virtualization. It is already in the designer stack and requires no additional dependency. No external grid library is needed for this use case.

If very large preview datasets (>50k rows) or advanced pivot features are required later, evaluate `@tanstack/react-table` (MIT, 25k+ stars) at that point. YAGNI applies — do not add it now.

---

## Area 9 — OSS Full Report Engine (Wholesale Adoption Assessment)

| Engine | Repo | Stars | License | Runtime | Verdict |
|---|---|---|---|---|---|
| jsreport | [jsreport/jsreport](https://github.com/jsreport/jsreport) | 1.3k | LGPL-3.0 | Node.js | REJECT |
| Carbone | [carboneio/carbone](https://github.com/carboneio/carbone) | 2.1k | CCL | Node.js | REJECT |
| Stimulsoft | — | — | Commercial | .NET / JS | REJECT |
| BIRT | — | — | EPL | Java | REJECT |

**Decision: BUILD the metadata engine. Adopt point libraries only.**

No 1000+ star OSS report engine meets all constraints:

- **jsreport** (1.3k stars, LGPL-3.0): Node.js server only. Cannot be embedded in the ASP.NET Core middle tier. Template limit of 5 on free tier; commercial license required above that. Would add an entire second runtime tier. Reject on stack mismatch and license.
- **Carbone** (2.1k stars, CCL): Node.js only, template-file-centric (.docx/.xlsx as templates with `{{placeholder}}` syntax), community edition is always one major version behind the paid edition. CCL restricts use in hosted SaaS offerings. Does not support metadata-driven report definition (FR-001 to FR-010) or a CRM-integrated designer. Reject.
- Stimulsoft, BIRT, ActiveReports: commercial or Java-based. Out of scope.

**There is no OSS report engine worth wholesale adoption for this stack.** The right architecture is a metadata engine built in-house, using the point libraries from Areas 1–8 for rendering. This is a BUILD decision for the core engine with ADOPT decisions for every rendering primitive.

---

## Area 10 — Client-Side Charting Library (V2-Dashboard chart widgets) — clears gate DC-3

**Added 2026-07-19** for the CEO-approved **V2-Dashboard** increment (Milestone M2.5). CEO checkpoint gate **DC-3** requires an MIT-licensed, client-side charting library (1000+ stars) for the dashboard chart widgets, documented here before any chart-widget frontend build.

Requirement: render the dashboard/report **chart widget** in the browser (React + Fluent designer, deployed as a CRM web resource). Must cover column, bar, line, area, pie, donut; emit **click events on segments** (for entity-exact cross-filter and report drill-down); support tooltips/legends; and keep bundle size web-resource-friendly. On-screen only — server-side PNG export is already covered by **ScottPlot (Area 5)**. The prototype hand-rolled these charts in raw SVG/CSS; this "adopt" decision replaces that "build" baseline.

| Library | Repo | Stars | License | Rendering | React fit | Click events | Verdict |
|---|---|---|---|---|---|---|---|
| **Recharts** | [recharts/recharts](https://github.com/recharts/recharts) | 27.4k | MIT | SVG | Native (composable components) | Yes — carries datum payload | **ADOPT** |
| Apache ECharts (+ echarts-for-react) | [apache/echarts](https://github.com/apache/echarts) | 66k | Apache-2.0 | Canvas | Wrapper ([hustcc/echarts-for-react](https://github.com/hustcc/echarts-for-react), MIT) | Yes | RUNNER-UP / future |
| Chart.js (+ react-chartjs-2) | [chartjs/Chart.js](https://github.com/chartjs/Chart.js) | 65k | MIT | Canvas | Wrapper (MIT) | Yes — clunkier payload | FALLBACK |
| Plotly.js | [plotly/plotly.js](https://github.com/plotly/plotly.js) | 17k | MIT | SVG/WebGL | Wrapper | Yes | REJECT — ~3 MB bundle |
| visx | [airbnb/visx](https://github.com/airbnb/visx) | 19k | MIT | SVG primitives | Native (low-level) | Build-your-own | REJECT — it *is* "build" |
| nivo | [plouc/nivo](https://github.com/plouc/nivo) | 13k | MIT | SVG/Canvas | Native | Yes | ALT |
| Victory | [FormidableLabs/victory](https://github.com/FormidableLabs/victory) | ~11k | MIT | SVG | Native | Yes | ALT — heavier, slower cadence |

**Decision: ADOPT Recharts** (`recharts`, npm, v2.x / v3, MIT).

Recharts (27.4k stars, MIT) is a declarative, **React-composable** chart library built on D3 primitives — it matches the designer's React + Fluent component model with the least friction. It renders **SVG**, so chart segments are real DOM nodes whose `onClick` handlers carry the clicked datum — exactly what the **entity-exact cross-filter** (CEO scope lock) and the report **drill-down** require. It covers all six required types out of the box (`BarChart` for column and horizontal bar, `LineChart`, `AreaChart`, `PieChart`, donut via `innerRadius`). It is tree-shakeable and materially lighter than canvas/WebGL engines, which matters for a bundled CRM web resource. MIT — no revenue-tier or copyleft trap.

Only the **chart** widget needs this library. The other V2-Dashboard widgets (gauge, progress, status badge, profile, checklist, matrix) are HTML/CSS/inline-SVG and require no charting dependency, consistent with the prototype.

**Runner-up — Apache ECharts (Apache-2.0, 66k stars) via `echarts-for-react` (MIT):** a more powerful canvas engine with a far larger chart catalogue (treemap, heatmap, gauge, combo, geo/map, sankey). Adopt ECharts **later** if/when the roadmap's advanced chart types (treemap/heatmap/geo — see `dotnetreport-comparison.md` gap G-5) are pulled into scope, or if canvas performance for very dense charts is needed. Heavier bundle and more imperative config, so not warranted for the six V1-dashboard chart types.

**Fallback — Chart.js + `react-chartjs-2` (MIT, 65k stars):** lightweight canvas option; viable if a Recharts blocker emerges, but its imperative config and clunkier click-payload extraction make it second choice for this React-first designer.

**Rejected:** Plotly.js (MIT but ~3 MB bundle — too heavy for a web resource); visx (MIT primitives — you build the charts yourself, which is the "build" baseline, not "adopt").

**DC-3 status: CLEARED** — an MIT-licensed, 1000+ star client-side charting library (Recharts) has been selected and documented. No new license trap introduced.

---

## Adoption Summary

| Area | Adopted Library | Repo | Stars | License | NuGet / npm Package |
|---|---|---|---|---|---|
| Expression Evaluation | NCalc | ncalc/ncalc | 1.1k | MIT | `NCalc2` |
| PDF Generation | QuestPDF | QuestPDF/QuestPDF | 14.1k | Dual* | `QuestPDF` |
| Word (.docx) | Open XML SDK | dotnet/Open-XML-SDK | 4.6k | MIT | `DocumentFormat.OpenXml` |
| Excel (.xlsx) | ClosedXML | ClosedXML/ClosedXML | 5.6k | MIT | `ClosedXML` |
| Chart-to-PNG (server) | ScottPlot | ScottPlot/ScottPlot | 6.7k | MIT | `ScottPlot` |
| Charting (client, V2-Dashboard) | Recharts | recharts/recharts | 27.4k | MIT | `recharts` |
| Dataverse (cloud) | Dataverse ServiceClient | microsoft/PowerPlatform-DataverseServiceClient | 315** | MIT | `Microsoft.PowerPlatform.Dataverse.Client` |
| CRM on-prem | XRM SDK | NuGet only | N/A | MS EULA | `Microsoft.CrmSdk.CoreAssemblies` |
| Query Builder UI | react-querybuilder | react-querybuilder/react-querybuilder | 1.7k | MIT | `react-querybuilder` + `@react-querybuilder/fluent` |
| Data Grid | Fluent UI DataGrid | microsoft/fluentui | — | MIT | `@fluentui/react-components` (already in stack) |
| Full Report Engine | — | — | — | — | BUILD (no qualifying OSS) |

\* QuestPDF requires commercial license for organizations with >$1M annual revenue.  
\*\* Below 1k threshold — adopted as official Microsoft SDK with no alternative.

---

## License Traps — Do Not Use Without Review

| Library | License | Risk |
|---|---|---|
| **iText7** | AGPL-3.0 | Entire application must be open-sourced unless commercial license purchased |
| **EPPlus v5+** | Polyform Noncommercial 1.0.0 | Commercial use requires paid license — commonly mistaken for free |
| **QuestPDF** (above $1M) | Dual commercial | Commercial license required if organization revenue exceeds $1M |
| **Carbone CE** | CCL | One major version behind paid; SaaS deployment restricted |
| **jsreport** (>5 templates) | LGPL-3.0 | Commercial license required above 5 stored templates |
| **DynamicExpresso** | MIT but C-5 risk | Executes C# code — violates security condition C-5 for untrusted formulas |
| **Jint** | BSD-2 but C-5 risk | Executes arbitrary JavaScript — C-5 violation if CLR access not explicitly disabled and confirmed by security review |
