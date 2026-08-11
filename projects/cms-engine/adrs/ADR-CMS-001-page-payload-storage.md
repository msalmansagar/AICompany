# ADR-CMS-001 — Page payload storage: where a page's JSON lives, and what bounds it

| | |
|---|---|
| **Status** | **Proposed** — cannot be accepted before the BRD gate (see CLAUDE.md) |
| **Date** | 2026-08-10 |
| **Raised by** | User (MSS Technologies) — "will it be enough to save huge page JSON?" |
| **Applies to** | CMS Engine (CMS-ENG-001) |
| **Follows** | ADR-RPT-011 (execute in CRM: web resource + plugin, no hosted middle tier) |
| **Related** | DXP-P1-004 (versioning & snapshots), DFE render-cache precedent |

---

## Context

A CMS page is stored as a single serializable JSON tree — the shape the Puck
editor produces and the renderer consumes:

```json
{ "root": { "props": { … } }, "content": [ … ], "zones": {} }
```

The Dynamic Form Engine already solved a very similar problem. It stores a
generated form definition as **gzip + Base64 in a Memo column**
(`qdb_runtime_json`), written by an async plugin (`qdb_PublishForm`) and read
by a sync plugin (`qdb_GetPublishedFormJson`) that decodes, decompresses and
returns the plain JSON. That precedent works and is deployed.

The question is whether it transfers. **A form definition is bounded; a page is
not.** A form has perhaps 200 fields, all defined by a developer. A page holds
whatever an author decides to put on it, in two languages, potentially for
years. The Form Engine never had to survive someone pasting a forty-page policy
document into a rich-text field.

Dataverse limits that matter:

| Column type | Ceiling |
|---|---|
| Multiple Lines of Text (Memo) | **1,048,576 characters** |
| File column | 32 MB default, configurable to **128 MB** |

Base64 inflates by 4/3, so a Memo column holds roughly **786 KB of compressed
bytes**.

---

## Measurements

Taken against the real payloads in `projects/portal-shell/spikes/puck`, plus
synthetic pages built from a representative bilingual text block. Reproduction
script at the end of this document.

| Page | Raw JSON | gzip | gzip + Base64 | Compression | % of Memo limit |
|---|---:|---:|---:|---:|---:|
| Reyada dashboard (real) | 9,926 | 3,098 | 4,132 | 2.4× | **0.39 %** |
| Landing page, 10 sections (real) | 8,289 | 2,084 | 2,780 | 3.0× | 0.27 % |
| 100 blocks (synthetic) | 26,334 | 705 | 940 | 28.0× | 0.09 % |
| 500 blocks (synthetic) | 131,934 | 2,059 | 2,748 | 48.0× | 0.26 % |
| **2,000 blocks (synthetic)** | **528,934** | **7,085** | **9,448** | **56.0×** | **0.90 %** |

Two things follow from this.

**Structure is not the constraint.** A 2,000-block page — far beyond anything a
real site would carry — consumes under 1 % of the Memo limit. On structure
alone there is roughly a hundredfold margin.

**Compression improves with size.** 2.4× on a small page, 56× at 2,000 blocks.
Page JSON is extremely repetitive: every block repeats `"type"`, `"props"`,
`"color"`, `"align"`, and gzip removes exactly that kind of redundancy. The
*larger* the page, the *better* the ratio — the opposite of the intuition that
prompted the question.

### What the measurements do not cover

The numbers above measure **structure**. Three things scale differently and are
the real risk:

1. **Long-form prose.** Natural language compresses at roughly 3–4×, not 50×. A
   page carrying 200 KB of actual article text lands near 60 KB of Base64 — still
   only 6 % of the limit, but it is a different curve.
2. **Inlined binaries.** A single `data:image/png;base64,…` pasted into a text
   field can be 2 MB on its own and exhausts the budget immediately. This is the
   one realistic way to hit the ceiling.
3. **Bilingual duplication.** Every string exists twice. Already reflected in the
   measurements above, which use EN + AR blocks.

---

## Decision

Three parts.

### 1. Render cache → Memo column, gzip + Base64 (as per Form Engine)

`qdb_cmsrendercache.qdb_runtime_json`, written by the `qdb_PublishPage` plugin.

This is read on **every page view**. It must be a single round trip, and a Memo
column read in the same retrieve as the record is exactly that. The Form Engine
precedent applies without modification, including the Base64-of-gzip encoding
and the "never generates, reads pre-built cache only" plugin behaviour.

### 2. Version store → File column, not Memo

`qdb_cmspageversion.qdb_contentfile`.

Versions are written on every draft save and read **only when an author opens
the editor**. The extra request a File column costs is irrelevant at that
frequency, and in exchange the ceiling rises from 1 MB to 128 MB — removing the
constraint entirely rather than living near it.

This is where the CMS deliberately diverges from the Form Engine. The Form
Engine kept everything in Memo because a form definition is small and bounded.
A page is neither, and the version store is the unbounded half.

### 3. Publish-time size gate in `qdb_PublishPage`

The plugin rejects or warns before anything reaches a citizen:

| Condition | Action |
|---|---|
| Payload contains a `data:` URI | **Reject** — assets must be library references |
| Base64 length > 60 % of limit | **Warn** the author, publish proceeds |
| Base64 length > 90 % of limit | **Reject** with the measured size in the message |

The `data:` rule matters most. It is the only realistic route to the ceiling,
and it also defeats the media-library indirection that makes image replacement
free. Enforcing it in the plugin — not by convention in the editor — is what
makes it real, for the same reason the audit log lives in the plugin.

---

## Consequences

### Positive

- The common case is unchanged from a pattern already deployed and understood.
- The unbounded case has no practical ceiling.
- A page that would have silently truncated now fails loudly, at publish, with
  a number in the message.
- Because pages store asset **keys** rather than binaries, payloads stay small
  by construction — the design already prevents the main failure mode.

### Negative

- Two storage mechanisms rather than one. A developer must know which is which.
- File column reads require a second request and different plugin code from a
  Memo read.
- The size gate is one more thing that can reject an author's work; the message
  must say what to remove, not merely that it is too large.

### Risks accepted

- **Rich text is the unknown.** If long-form editing is added later, re-measure
  before assuming these numbers hold. The compression curve for prose is
  different from the curve for structure.
- **128 MB is not infinite.** A page approaching it is a content-design problem,
  not a storage problem, and should be split into several pages.

---

## Alternatives considered

| Option | Why not |
|---|---|
| **Memo for everything** (pure Form Engine) | Works today at 100× margin, but puts the unbounded version store on a bounded column. Cheap now, a migration later. |
| **File column for everything** | Costs a second request on the hot read path, for a benefit the render cache does not need. |
| **Chunk across multiple Memo rows** | Reassembly logic, partial-write failure modes, and no query benefit. Complexity for a ceiling a File column removes outright. |
| **Azure Blob for payloads** | Reintroduces the hosted dependency ADR-RPT-011 exists to eliminate. Also a Qatar data-residency question that does not need asking. |
| **Store uncompressed JSON** | 2.4×–56× larger for no benefit. Compression is free and the plugin already does it for forms. |

---

## Re-measurement with rich text — 2026-08-11

OQ-1 required this ADR to be re-measured with real prose before acceptance if
rich text turned out to be in scope. **It is in scope.** Measured with
`measure-payload-prose.mjs`, committed beside this ADR.

| Case | Raw | gzip | Stored | **% of Memo** |
|---|---|---|---|---|
| Structural only — 2,000 blocks, no prose | 284 KB | 16.6× | 22.8 KB | 2.22 % |
| **Typical page** — 20 rich blocks, 4 sentences | 29 KB | 10.3× | 3.8 KB | **0.37 %** |
| **Heavy page** — 60 rich blocks, 8 sentences | 143 KB | 22.7× | 8.4 KB | **0.82 %** |
| Very heavy — 200 rich blocks, 12 sentences | 650 KB | 31.6× | 27.5 KB | 2.68 % |
| Pathological — 800 rich blocks, 14 sentences | 2.9 MB | 35.2× | 112 KB | **10.94 %** |

**The decision survives.** A realistic heavy page consumes under 1 % of the Memo
limit; a deliberately absurd one stays under 11 %. Rich text does not threaten
the storage model, and the 60 % warn / 90 % reject gates remain appropriate.

### Two corrections this measurement forced

**1 — "Prose compresses at 3–4×" was wrong.** That figure was asserted, not
measured, and it drove the fear behind OQ-1. Measured compression is **10–35×**.
Plain prose alone does compress at roughly 3–4×, but a *page payload* is not
plain prose: the JSON keys, the HTML markup and the bilingual structure repeat
heavily even when the words do not, and that is what gzip rewards.

**2 — The first run of this measurement was invalid.** It generated paragraphs
with `.repeat()`, so gzip was compressing identical text and returned ratios up
to 150×. The table above uses a pool of genuinely distinct sentences in both
languages. **Repeated filler flatters a compression benchmark and must never be
used for one.**

### What is *not* claimed

The structural baseline here reads 2.22 % where this ADR originally recorded
0.90 % for a 2,000-block page. That is a difference in test data, **not evidence
the original figure was wrong** — the blocks generated here each carry a
bilingual heading and an accent token, so they are heavier than whatever the
original measurement used. The two numbers are not comparable and the
conclusion does not depend on which is right.

Measured against the **Dataverse cloud** limit. On-premise remains OQ-3.

---

## Version retention — 2026-08-11

OQ-2 asked whether to prune old versions. The DXP-P1-004 figure of 20 per page
was inherited advice; **C-11 dropped that dependency, so the limit is ours.**

**Decision: retain every version. No prune, no cap.**

### The argument is FR-63, not storage

FR-63 says *"a user with rights shall restore **any** prior version."* A retention
cap silently converts that into "any of the last N". A page edited a hundred
times cannot be restored to version 3 under a cap of 20 — and nobody discovers
that until they need it, which is the worst moment.

Pruning also fights the audit posture: `cms_publishlog` is append-only precisely
so history cannot be quietly rewritten. Deleting the versions that log refers to
undoes half of that.

### Storage does not justify the cap either

Using the measured per-version sizes:

| Retention | Heavy page | 500-page site |
|---|---|---|
| Keep 20 | 0.16 MB | 0.08 GB |
| Keep 50 | 0.41 MB | 0.20 GB |
| **Unbounded** (500 versions/page) | 4.1 MB | **2 GB** |

500 versions per page is a page edited every working day for two years. **Two
gigabytes**, on File-column storage, for a scenario well beyond realistic. There
is no saving here worth trading a Must requirement for.

### What bounds growth instead

- **Publish-time size gate** — no single version can exceed the ceiling (FR-65)
- **Versions are created by human saves**, not by automation. Should an automated
  writer ever be introduced, revisit this — a machine editing a page in a loop is
  a different problem, and the answer is to rate-limit the writer rather than
  destroy history.

---

## Open questions

| # | Question | Needs |
|---|---|---|
| ~~OQ-1~~ | ~~Is long-form rich text in scope? If yes, re-measure with real prose before accepting this ADR.~~ **Answered 2026-08-11: rich text is IN. Re-measured — the decision survives.** See *Re-measurement with rich text* below. | Closed |
| ~~OQ-2~~ | ~~Do we retain every draft version, or prune?~~ **Answered 2026-08-11: retain everything, no prune.** See *Version retention* below. | Closed |
| OQ-3 | On-premise CRM 9.x — confirm File column support and the configured maximum, which may differ from cloud. | IT / infrastructure |

---

## Reproducing the measurements

```js
const zlib = require('zlib');
function measure(label, obj) {
  const raw = JSON.stringify(obj);
  const gz  = zlib.gzipSync(Buffer.from(raw, 'utf8'));
  const b64 = gz.toString('base64');
  const LIMIT = 1048576;                       // Dataverse Memo maximum
  console.log(label, {
    raw: raw.length, gzip: gz.length, base64: b64.length,
    ratio: (raw.length / b64.length).toFixed(1) + 'x',
    pctOfLimit: ((b64.length / LIMIT) * 100).toFixed(2) + '%',
  });
}
```

Run against `reyada.data.ts` and `landing.puck.data.ts` in
`projects/portal-shell/spikes/puck`, and against synthetic pages of N
bilingual text blocks.

**Re-run this whenever the component set changes materially.** The numbers are
the argument; without them this ADR is an opinion.
