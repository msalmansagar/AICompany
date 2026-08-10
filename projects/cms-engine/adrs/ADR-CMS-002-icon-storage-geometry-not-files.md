# ADR-CMS-002 — Icons are stored as geometry, not as files

| | |
|---|---|
| **Status** | **Proposed** — raised by dependency research; must be accepted before Phase 3 closes |
| **Date** | 2026-08-10 |
| **Raised by** | Dependency adoption register, risk DR-4 |
| **Applies to** | CMS Engine (CMS-ENG-001) — FR-22, FR-23, FR-24 |
| **Follows** | ADR-RPT-011 (enforcement belongs in the plugin, not the browser) |
| **Related** | ADR-CMS-001 (page payload storage), DXP-P1-003 (theme tokens) |

---

## Context

FR-22 requires that a Power Admin can upload icons which become available to all
authors without a deployment. FR-23 requires those uploads to be sanitised.

**An SVG file is not a picture. It is an XML document that may contain script.**
An uploaded `.svg` can carry `<script>`, `onload=`, `<foreignObject>` wrapping
arbitrary HTML, or `xlink:href` to an external resource. When such a file is
inlined into a page — which is how icons are used, so they can inherit colour —
that script executes in the visitor's session, on a QDB domain, with whatever
the visitor's session carries.

This is the single highest-risk input surface in the engagement.

### Why sanitisation alone does not settle it

The obvious answer is "sanitise on upload". Dependency research found that the
obvious answer does not hold here, for two independent reasons.

**1. Browser-side sanitisation is bypassable.** DOMPurify is the strongest
candidate — 17.3k stars, Apache-2.0, maintained by cure53, with an explicit SVG
profile. But it is DOM-only: it runs in the browser. A user with Web API access
can `POST` an unsanitised file directly and never load our page.

This is precisely the argument ADR-RPT-011 makes about the report execution log:
if the browser both performs the action and enforces the control, the control is
optional. A sanitiser that can be skipped is not a sanitiser. Enforcement must
sit where the write happens — the plugin.

**2. No .NET library clears the bar.**

| Candidate | Why not |
|---|---|
| **HtmlSanitizer** — 96M NuGet downloads, MIT | Carries **CVE-2023-44390**, which applies *specifically when `svg` or `math` are added to allowed elements*. Safe in its default configuration; unsafe in the only configuration we would need. |
| **SafeSVG** — BSD-3, purpose-built | **4 stars, 1 watcher, single maintainer, created 2025.** Correctly scoped, but unacceptable as the sole control on an XSS boundary in a product sold to banks. |

Adopting either would mean placing a security boundary on a dependency we cannot
justify. Writing our own denylist would mean competing with cure53 at their own
job, and losing.

---

## Decision

**Do not store SVG documents. Store extracted geometry.**

On upload, the plugin parses the file as XML and retains **only** drawing
primitives and their coordinate attributes. Everything else is discarded — not
escaped, not neutralised, not stripped conditionally. Discarded.

### The allowlist

| Kept | Elements | Attributes |
|---|---|---|
| Shapes | `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon` | `d`, `cx`, `cy`, `r`, `rx`, `ry`, `x`, `y`, `width`, `height`, `x1`, `y1`, `x2`, `y2`, `points` |
| Grouping | `g` | `transform`, `fill-rule`, `clip-rule` |
| Root | `svg` | `viewBox` only — normalised to `0 0 24 24` |

Everything not named above is dropped, including `script`, `foreignObject`,
`use`, `image`, `style`, `animate*`, `filter`, `mask`, `pattern`,
`linearGradient`, `radialGradient`, `text`, every `on*` handler, every `href`
and `xlink:href`, and every namespace declaration other than SVG's own.

If nothing drawable remains after extraction, the upload is **rejected** and the
rejection is logged (FR-24). A file that sanitises to nothing was either not an
icon or was hostile; either way the author needs to be told, not silently given
an empty icon.

### Why this is stronger than sanitising

An **allowlist by construction**, not a denylist by configuration.

A sanitiser answers "is this element dangerous?" and must be right about every
element, every attribute, every encoding trick, forever. This answers "is this
element a shape?" — a closed question with a fixed answer. New attack techniques
do not expand the set of things called `path`.

There is also no configuration to get wrong. HtmlSanitizer's CVE exists because
a safe library became unsafe when configured for SVG. There is no equivalent
switch here.

### Colour comes from tokens, not from the file

Extracted icons carry no colour. They render with `fill="currentColor"` and
inherit from the theme token the author selected.

This is not a workaround — **it is the same rule the rest of the CMS already
enforces**. DXP-P1-003 and the token model exist so that only approved colours
reach a page. A multi-colour uploaded icon would smuggle unapproved colours past
that governance in a file. The security constraint and the brand constraint point
the same way, which is a good sign that the design is right rather than merely
convenient.

---

## What this costs

Stated plainly, because it is a real product limitation and the reason this ADR
exists rather than being an implementation note.

**Not possible with geometry-only icons:**

- Multi-colour marks — a two-colour logo
- Gradients
- Embedded raster images
- Filters, blurs, drop shadows
- Animation

### The mitigation: two tracks, not one

Those things are not icons. They are **artwork**, and artwork already has a home.

| Asset type | Stored as | Rendered as | Colour | Why safe |
|---|---|---|---|---|
| **Icon** | Extracted geometry | Inline `<svg>` | Inherits from token | Nothing executable retained |
| **Logo / illustration** | File, media library | `<img src="…">` | Whatever the file carries | **SVG loaded via `<img>` does not execute script** — browsers render it in a restricted mode with no scripting and no external loads |

A two-colour QDB mark goes in the media library and is placed with the Image
block. It keeps its colours, it is never inlined, and it cannot execute. An
author is not blocked; they use the right tool.

This must be stated in the authoring UI, or a Power Admin will upload a coloured
logo to the icon library, see it render in a single colour, and conclude the
system is broken.

---

## Alternatives considered

| Option | Why rejected |
|---|---|
| **DOMPurify in the browser only** | Bypassable via direct Web API write. The control becomes optional. |
| **HtmlSanitizer in the plugin** | CVE-2023-44390 applies to exactly our configuration. |
| **SafeSVG in the plugin** | 4 stars, one maintainer. Not a basis for a security boundary in a product. |
| **Hand-written denylist in the plugin** | Competing with cure53 at their speciality, without their scrutiny. Denylists fail silently and asymmetrically. |
| **Rasterise uploads to PNG** | Loses vector scaling, the reason icons are SVG. Also needs an image library in the plugin — more dependency, not less. |
| **Store SVG, serve only via `<img>`** | Safe, but icons must inline to inherit token colour. This is exactly why artwork takes that path and icons do not. |
| **Disallow icon upload entirely** | Was the earlier position; overturned deliberately so business users are not blocked on developers. This ADR is how that is delivered safely. |

---

## Consequences

### Positive

- The highest-risk input surface is closed by construction rather than by configuration.
- No third-party trust on a security boundary.
- Icons inherit theme tokens, so an uploaded icon cannot introduce an unapproved colour.
- Stored icons are small — a path string, not a file — with no binary handling and no File column.
- Identical behaviour on cloud and on-premise; nothing depends on a platform capability.

### Negative

- Multi-colour and gradient icons are impossible in the icon library.
- Authors must understand which library to use, which is a UI and training obligation.
- Extraction is our code, so its correctness is our responsibility — it needs unit tests over a corpus of hostile SVGs, not just a happy path.
- An icon that renders correctly in a design tool may extract to something different if it relies on `use` or `style`. The preview must show the **extracted** result, never the uploaded file, or authors will be surprised after publish.

---

## Open questions

| # | Question | Owner |
|---|---|---|
| OQ-A | Does QDB Brand require any multi-colour mark in the *icon* set specifically, rather than as artwork? | QDB Brand |
| OQ-B | Should the plugin cap path count or coordinate length? A valid single-path SVG can still be megabytes and become a rendering denial-of-service. | Architecture |
| OQ-C | Are the seven shape primitives sufficient, or is `text` needed for anything? `text` is excluded deliberately — it pulls in fonts and `textPath`. | Architecture |

---

## Verification required before acceptance

- [ ] Extractor tested against a corpus of hostile SVGs: `<script>`, `onload`, `foreignObject`, `use` with external href, entity expansion, namespace confusion
- [ ] Confirm a file that extracts to nothing is rejected and logged, not stored empty
- [ ] Confirm the upload preview renders the extracted output, not the source file
- [ ] Confirm an extracted icon inherits `currentColor` from the token, in both LTR and RTL
