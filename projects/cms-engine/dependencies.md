# CMS-ENG-001 — Dependency Adoption Register

**Engagement:** Metadata-driven Content Management Engine for Dataverse cloud and Dynamics CRM on-premise 9.x
**Date:** 2026-08-10
**Scope:** Delivery Phase A only — authoring, media, translation, approval, publish, audit, versioning.
Phase C (component builder, icon upload UI) was rejected at the Phase 1 CEO gate and is not researched here.
**Stack:** Dataverse web resource (browser, React 18) + C# plugin. No hosted middle tier (ADR-RPT-011).

## Constraints every candidate is judged against

| # | Constraint | Consequence |
|---|---|---|
| 1 | Runs as a Dataverse web resource — browser only, no Node runtime | Server-side-only libraries are out |
| 2 | A hardened CRM blocks CDN loads by CSP | Must bundle offline, zero runtime external requests |
| 3 | **Product sold to multiple clients** | MIT / Apache / BSD only. **GPL, AGPL, SSPL disqualifying** |
| 4 | Bilingual English/Arabic, RTL | Anything touching text or layout must handle bidi |
| 5 | Editor bundle already ~644 KB JS + 100 KB CSS | Weight is a real cost |
| 6 | Qatar/GCC data residency | Nothing that calls out to a hosted service |

---

## Area 1 — SVG sanitisation (FR-23, FR-24)

**The highest-stakes item in this register.** Uploaded SVG is an execution vector; a
malicious file runs script in the visitor's session. Hand-rolling this would be a
security defect, not a style choice.

| Library | Repo | Stars | Licence | Last push | Verdict |
|---|---|---|---|---|---|
| **DOMPurify** | [cure53/DOMPurify](https://github.com/cure53/DOMPurify) | **17.3k** | Apache-2.0 | 2026-08-10 | **ADOPT — browser layer only** |
| HtmlSanitizer (.NET) | [mganss/HtmlSanitizer](https://github.com/mganss/HtmlSanitizer) | 96M NuGet downloads | MIT | Active | **REJECT — see below** |
| SafeSVG (.NET) | [arielcostas/safesvg](https://github.com/arielcostas/safesvg) | **4** | BSD-3 | 2026-04 | **REJECT — 4 stars, 1 watcher** |

### Why this is not simply "adopt DOMPurify"

DOMPurify is excellent — maintained by cure53, a security firm, pushed the day of this
research, and explicitly supports SVG via
`DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })`.

But **DOMPurify is DOM-only. It runs in the browser.** And browser-side sanitisation can
be bypassed exactly the way ADR-RPT-011 argues the audit log could be: a user with Web
API access POSTs the unsanitised file directly and never loads our page. A sanitiser
that can be skipped is not a sanitiser.

So enforcement must sit where the write happens — the plugin. And there, neither .NET
option holds:

- **HtmlSanitizer** carries **CVE-2023-44390**, which applies *specifically when SVG or
  MathML are added to the allowed elements* — precisely our configuration. Safe in its
  default configuration, unsafe in ours.
- **SafeSVG** is purpose-built and correctly scoped, but has **4 stars, 1 watcher, one
  maintainer, first commit 2025**. Nowhere near the 1000-star bar, and unacceptable as
  the sole control on an XSS boundary in a bank product.

### Decision: change the design rather than hunt for a library

**Do not store SVG documents at all. Store extracted path geometry.**

The plugin parses the upload as XML, extracts only geometry primitives — `path`, `circle`,
`rect`, `line`, `polygon`, `polyline`, `ellipse` and their coordinate attributes — and
persists just those. Everything else is discarded: `script`, `foreignObject`, `use`,
`image`, `style`, every `on*` handler, every external reference.

This is an **allowlist by construction rather than a denylist by configuration**. Nothing
executable can survive, because nothing except geometry is retained. It is also exactly
what the prototype's icon registry already does — `ICON_PATHS` is a map of name → path
string, not a store of SVG files.

| Layer | What | Why |
|---|---|---|
| Browser | DOMPurify SVG profile, before preview | Fast feedback; catches the honest mistake |
| **Plugin (C#)** | **XML parse + geometry allowlist extraction** | **The enforcement point — cannot be bypassed** |

**ADOPT DOMPurify** for the browser layer (already a portal-shell dependency, so no new
weight). **BUILD** the plugin-side extractor: perhaps 150 lines of allowlist code, fully
auditable, with no third-party trust on the security boundary.

> **Register this as an ADR.** "Icons are stored as geometry, not as files" is a security
> decision with product consequences — it rules out multi-colour and gradient icons.
> That trade must be made deliberately, not discovered.

---

## Area 2 — Version diff (FR-63, and CEO requirement for review diffs)

| Library | Repo | Stars | Licence | Last push | Verdict |
|---|---|---|---|---|---|
| **jsondiffpatch** | [benjamine/jsondiffpatch](https://github.com/benjamine/jsondiffpatch) | **5.3k** | MIT | 2026-05-14 | **ADOPT** |
| deep-diff | deepdiff/deep-diff | ~1.5k | MIT | Stale | SKIP — no formatter |
| microdiff | AsyncBanana/microdiff | ~1.5k | MIT | Active | SKIP — diff only |

**Decision: ADOPT jsondiffpatch.**

It is the only candidate that both diffs a nested tree *and* renders the result. It ships
an HTML formatter, which is exactly what the review screen needs — the alternatives return
a delta object and leave presentation to us, which is most of the work.

It also does array diffing with object matching, which matters here: a page's `content` is
an array, and a naive diff reports "everything changed" when a block moves. Moving a
section is the single most common edit, so this is not a nicety.

---

## Area 3 — Compression before storage (ADR-CMS-001)

| Option | Bundle cost | Verdict |
|---|---|---|
| **Native `CompressionStream`** | **0 KB** | **ADOPT** |
| fflate | ~8 KB (10 KB at pako parity) | Fallback only |
| pako | ~45 KB | SKIP |

**Decision: ADOPT native `CompressionStream`.**

Supported in all modern browsers since 2022 (Chromium 80+), and supports the `gzip` format
argument we need — the default is `deflate-raw`, which is not what the plugin expects, so
the format must be passed explicitly.

Zero bundle cost matters here: this ships inside a web resource that already carries a
644 KB editor.

> **Open, ties to condition C-4.** On-premise CRM 9.x runs UCI on Chromium, so support
> should hold — but the browser baseline must be confirmed, not assumed. If an older
> baseline appears, fall back to **fflate (8 KB), not pako (45 KB)**.

---

## Area 4 — Slug generation (FR-01)

| Library | Repo | Licence | Verdict |
|---|---|---|---|
| @sindresorhus/slugify | [sindresorhus/slugify](https://github.com/sindresorhus/slugify) | MIT | **Conditional** |
| slugify-arabic | npm | MIT | SKIP — last published 5 years ago |
| unicode-slugify | mozilla/unicode-slugify | BSD | SKIP — Python |

**Decision deferred — this is a product question, not a library one.**

`@sindresorhus/slugify` handles Arabic, but it **transliterates**: `عن ريادة` becomes
`an-ryad`. The prototype's own slugifier instead **preserves** Arabic characters, giving
`/عن-ريادة`, which browsers handle via percent-encoding.

These are different products:

| Approach | URL | Trade-off |
|---|---|---|
| Transliterate | `/an-ryad` | ASCII-safe everywhere, but meaningless to an Arabic reader |
| Preserve | `/عن-ريادة` | Readable and shareable in Arabic; ugly when percent-encoded in logs and emails |

**Ask QDB Digital before choosing.** If preservation wins, the ~15-line function already in
the prototype is sufficient and no dependency is needed.

---

## Area 5 — Translation state: missing / stale detection (FR-40, FR-41)

**Decision: BUILD. No library fits, and that is the correct outcome.**

"Stale" here means *the English source changed after the Arabic was written*. That is not a
general i18n problem — the i18n ecosystem (i18next, FormatJS) solves *runtime lookup*, not
*editorial freshness*.

The mechanism is a stored hash of the source string at translation time, compared against
the current source. Roughly 30 lines. Adopting a 40 KB i18n framework for this would add
weight and solve a different problem.

Note the prototype already exposed a real bug in this area during the Form Engine work: a
whitespace mismatch flagged correctly-padded labels as stale. **Normalise whitespace before
hashing.**

---

## Area 6 — Dataverse File column upload (ADR-CMS-001, FR-20)

**Decision: BUILD against the Web API.**

No maintained JavaScript helper exists for Dataverse File columns. The pattern is
documented: `PATCH` for files under 4 MB, chunked upload above it. This is Dataverse
plumbing, not a general problem, and a wrapper would be thinner than the docs.

---

## Area 7 — Rich text — BLOCKED

**Cannot be decided. Depends on OQ-1 (is long-form rich text in scope), unresolved at the
CEO gate.**

Recorded so it is not lost: **portal-shell depends on Tiptap 2.10; Puck bundles Tiptap
3.11.** That is condition **C-8**, and it must be resolved in Phase 3 whether or not rich
text enters scope, because both are already in the tree.

Two exits: standardise on Puck's 3.x and upgrade portal-shell, or keep the two isolated and
accept the duplication. The first is cleaner; the second is cheaper. Architecture decides.

---

## Summary

| Need | Decision | What |
|---|---|---|
| SVG sanitisation | **ADOPT + BUILD** | DOMPurify in browser; geometry extraction in plugin |
| Version diff | **ADOPT** | jsondiffpatch 5.3k★ MIT |
| Compression | **ADOPT** | Native `CompressionStream`, 0 KB |
| Slug generation | **DEFER** | Product decision: transliterate or preserve Arabic |
| Translation state | **BUILD** | ~30 lines; no library solves editorial freshness |
| File column upload | **BUILD** | Documented Web API pattern |
| Rich text | **BLOCKED** | OQ-1 unresolved; C-8 stands regardless |

**Net new runtime dependencies for Phase A: one** — jsondiffpatch. DOMPurify is already
present in portal-shell, and compression is native.

## Risks found during research

| # | Risk | Action |
|---|---|---|
| DR-1 | Browser-side sanitisation is bypassable via direct Web API writes | Enforce in the plugin; browser layer is convenience only |
| DR-2 | HtmlSanitizer's CVE applies precisely to the SVG configuration we would need | Rejected; do not adopt on the basis of its download count |
| DR-3 | SafeSVG is a 4-star single-maintainer project — the craft.js trap in miniature | Rejected on maintenance, not capability |
| DR-4 | Storing geometry rather than files rules out multi-colour and gradient icons | Raise as an ADR before Phase 3 closes |
| DR-5 | `CompressionStream` default is `deflate-raw`, not gzip | Pass the format explicitly; the plugin expects gzip |
| DR-6 | On-premise browser baseline unconfirmed | Folds into condition C-4 |
