# CMS-ENG-001 — Acceptance criteria

```
═══════════════════════════════════════════════════
ACCEPTANCE CRITERIA
Engagement ID:  CMS-ENG-001
Date:           2026-08-10
Satisfies:      CEO condition C-12 (gate: Phase 4 start)
Owner:          BA
Status:         Draft — for QA ratification in Phase 5
═══════════════════════════════════════════════════
```

## How to read this

One block per **Must**-priority functional requirement, written Given-When-Then.
These are the **test contract**: Phase 5 tests are written from this document,
and code review in Phase 4 has no objective standard without it. That is why
C-12 gates Phase 4 rather than Phase 5.

A criterion is written to be **independently testable** — it names an observable
outcome, not an implementation. Where a requirement's real content is a
*prohibition* ("shall not accept", "shall not allow"), the negative case is the
primary criterion, because that is the one a build will otherwise quietly miss.

### Scope: not all of these are in approved scope

The Phase 1 gate approved **Phase A only**. Phase B and C criteria are written
because C-12 asks for FR-01 through FR-72, and because writing them now is cheap
— but **they are not a Phase 4 test contract**, and no Phase 4 work should be
scheduled against them.

| Phase | Must FRs | In approved scope |
|---|---|---|
| **A** | 29 | **Yes** — this is the Phase 4 contract |
| **B** | 6 | No — later gate |
| **C** | 5 | No — explicitly rejected at the Phase 1 gate |

**40 Must FRs total.** The three Should-priority FRs (07, 31, 43) are outside
C-12; two carry hard-won notes and appear in the appendix.

---

# Phase A — the Phase 4 test contract

## 5.1 Authoring

### FR-01 · Create a page, slug derived and editable before first publish

- **AC-01.1** — **Given** an author with Content Author role, **when** they create a page titled "About Riyada", **then** a page is created with a derived slug and status Draft.
- **AC-01.2** — **Given** a draft page never published, **when** the author edits the slug, **then** the new slug is saved.
- **AC-01.3** — **Given** a page that has been published at least once, **when** the author attempts to edit the slug, **then** the field is not editable and the reason is stated on screen.
- **AC-01.4** — **Given** an existing page with slug `about-riyada`, **when** an author creates another page deriving the same slug, **then** creation is refused with a message naming the conflicting page.

> Arabic slug style is **open — Q9**. Until answered, AC-01.1 is verified against
> an English title only. See §Deferred.

### FR-02 · Compose by placing, reordering and removing blocks

- **AC-02.1** — **Given** an open page, **when** the author drags a block from the palette onto the canvas, **then** it appears at the drop position and is persisted to the draft.
- **AC-02.2** — **Given** a page with three blocks, **when** the author moves the third above the first, **then** the stored order matches the visible order after reload.
- **AC-02.3** — **Given** a page with a block, **when** the author removes it, **then** it disappears from the canvas and from the stored tree.
- **AC-02.4** — **Given** the page is displayed right-to-left, **when** the author drops a block on the visually-right zone, **then** it lands in the right zone and not the left. *(Verified in the RTL spike in both directions; carried forward as a regression test.)*

### FR-03 · English and Arabic on the same block

- **AC-03.1** — **Given** a block with a bilingual text field, **when** the author selects it, **then** both the English and the Arabic input are visible in the same panel without navigating away.
- **AC-03.2** — **Given** the author types Arabic into the Arabic input, **when** the draft is saved and reloaded, **then** the Arabic value is on the same block instance as the English value, not a parallel page.
- **AC-03.3** — **Given** an Arabic input, **when** the author types, **then** the input renders right-to-left with the caret at the correct edge.
- **AC-03.4** — **Given** any block in the library, **when** an author selects it, **then** no more than **seven** top-level controls are shown; anything further is inside a labelled collapsible group. *(UI/UX spec §1. Six spike components exceeded this, the worst at 21.)*
- **AC-03.5** — **Given** a bilingual field, **when** it is stored, **then** it is **one** value carrying `{ en, ar }`, not two sibling keys. *(UI/UX spec §2, closing OQ-A.)*
- **AC-03.6** — **Given** a translated value whose state is Missing, Stale or Unknown, **when** the field is shown, **then** each state is **visually distinct from the others and from Translated**. *(Unknown must never read as Translated — see AC-40.3.)*

### FR-03a · Editing-mode interaction *(derived from the UI/UX spec, §3)*

- **AC-03a.1** — **Given** a block containing a link or button, **when** it is rendered in the editor, **then** clicking it selects the block rather than navigating or submitting.
- **AC-03a.2** — **Given** that same element in the editor, **when** a keyboard user tabs to it, **then** it is **still focusable and announced**. *(Inert must not mean unreachable. The spike shipped 5 non-focusable spans — a real accessibility regression.)*
- **AC-03a.3** — **Given** any block, **when** it is rendered with empty props `{}`, **then** it renders without error and never displays the string "undefined". *(Puck's `defaultProps` do not apply to stored data.)*
- **AC-03a.4** — **Given** a block referencing an unknown type, icon or asset key, **when** it renders in the editor, **then** a visible placeholder names the missing identifier.
- **AC-03a.5** — **Given** a slot with no children, **when** the page is edited, **then** the slot has a visible drop target and a label naming what belongs there.
- **AC-03a.6** — **Given** a stateful block such as a carousel, **when** the author sets its initial state, **then** the editor renders **that** state rather than resetting on every prop change.

### FR-03b · Rich text *(derived from architecture §6 — Q1 answered yes)*

The editor constrains what an author can **type**; these assert what happens when
someone writes to the API directly, which is the only enforcement that counts.

- **AC-03b.1** — **Given** a rich-text value containing a tag outside the allowlist (bold, italic, list, link, paragraph, H2–H4), **when** it is submitted directly to the API and published, **then** the offending tag is stripped and the surrounding text is preserved.
- **AC-03b.2** — **Given** a link whose `href` is a `javascript:` or `data:` URI, **when** publish is called, **then** publish is **rejected**.
- **AC-03b.3** — **Given** a rich-text value containing markup but no text once sanitised, **when** publish is called, **then** it is rejected rather than stored as an empty fragment. *(Same rule as an SVG that extracts to nothing — ADR-CMS-002.)*
- **AC-03b.4** — **Given** an author uses the editor, **when** they look for font, size or colour controls, **then** none exist. *(Colour comes from theme tokens; a colour control bypasses the palette — FR-10.)*
- **AC-03b.5** — **Given** an author uses the editor, **when** they apply the largest heading available, **then** it is **H2, never H1**. *(The page owns H1; one per page keeps the outline valid for WCAG 2.1 AA — NFR-07.)*
- **AC-03b.6** — **Given** Arabic rich text containing an embedded Latin string such as a product name, **when** it renders, **then** the Latin run is `<bdi>`-isolated and does not reorder. *(Verified failure in the spike: "10:00 AM - 6:00 PM" rendered as "AM - 6:00 PM 10:00".)*
- **AC-03b.7** — **Given** the Arabic editing surface, **when** it is displayed, **then** the editable region is `dir="rtl"` and the **toolbar is not**.
- **AC-03b.8** — **Given** a rich-text value whose markup changes but whose words do not, **when** staleness is computed, **then** the translation is **not** marked stale. *(Extends AC-41.3 — the DFE trained translators to ignore the signal by flagging padded labels.)*
- **AC-03b.9** — **Given** a page whose rich-text payload exceeds the configured ceiling, **when** publish is called, **then** it is rejected with the measured size. *(FR-65 applies unchanged; measured headroom is large — a heavy page is 0.82 % of the Memo limit.)*

### FR-04 · Render as the visitor will see it, either language, without leaving the editor

- **AC-04.1** — **Given** an open page, **when** the author switches to preview, **then** the page renders with no editor chrome, in the same layout a visitor receives.
- **AC-04.2** — **Given** preview is open, **when** the author switches language to Arabic, **then** the page re-renders in Arabic and right-to-left without a page reload or losing unsaved draft state.
- **AC-04.3** — **Given** a page previewed in the editor, **when** the same page is published and fetched by a visitor, **then** the rendered output is identical. *(Enforced by the renderer-comparison harness — see `phase-3-arch.md` §4.)*

### FR-05 · Preview at desktop, tablet and mobile widths

- **AC-05.1** — **Given** preview is open, **when** the author selects each of desktop, tablet and mobile, **then** the canvas resizes to that width and the layout reflows.
- **AC-05.2** — **Given** mobile width, **when** any page in the corpus is previewed, **then** no horizontal scrollbar appears on the page body. *(A real defect found in the spike: grid items default to `min-width: auto` and overflow.)*

### FR-06 · Draft saves automatically

- **AC-06.1** — **Given** an author changes a field, **when** they take no explicit save action, **then** the change is persisted and a saved indication is shown.
- **AC-06.2** — **Given** an autosave has completed, **when** the browser is closed and the page reopened, **then** the change is present.
- **AC-06.3** — **Given** an autosave fails, **when** the failure occurs, **then** the author is told the change is unsaved. The failure must not be silent.
- **AC-06.4** — **Given** two authors open the same page, **when** the second saves over the first's change, **then** the conflict is detected and reported rather than silently overwriting. *(A stale record token silently blocked all saves in the DFE designer; conflict handling must be observable.)*

### FR-08 · Show which fields have no Arabic value, before publish

- **AC-08.1** — **Given** a page where two text fields have English but no Arabic, **when** the author opens the pre-publish check, **then** both fields are listed by block and field name.
- **AC-08.2** — **Given** every field has an Arabic value, **when** the check runs, **then** it reports nothing missing.
- **AC-08.3** — **Given** fields are missing Arabic, **when** the author submits for review, **then** the submission is permitted but the missing-value report is attached for the Approver. *(Missing translation is an editorial decision, not a system error.)*

---

## 5.2 Design system and governance

### FR-10 · Colour from approved tokens only

- **AC-10.1** — **Given** a block with a colour field, **when** the author opens it, **then** only approved theme tokens are offered.
- **AC-10.2** — **Given** a colour field, **when** an author attempts to supply a free-form value such as `#FF0000`, **then** there is no input that accepts it.
- **AC-10.3** — **Given** a page payload containing a literal colour value submitted directly to the API, **when** publish is called, **then** publish is rejected. *(The UI constraint is not the control; the server-side one is.)*

### FR-12 · Changing a token changes every page, without re-versioning

- **AC-12.1** — **Given** three published pages using token `brand-primary`, **when** a Power Admin changes its value, **then** all three render the new value.
- **AC-12.2** — **Given** that change, **when** the pages are inspected, **then** no page version was created and no page record was modified.
- **AC-12.3** — **Given** that change, **when** a page is fetched, **then** the stored payload still contains the token slug and not the resolved value.

### FR-13 · Tokens resolve per locale

- **AC-13.1** — **Given** a typography token with different English and Arabic values, **when** a page renders in English, **then** the English value applies; **when** in Arabic, the Arabic value applies.
- **AC-13.2** — **Given** a token with no locale-specific override, **when** a page renders in either locale, **then** the default value applies.

### FR-14 · Images referenced by asset key, never embedded

- **AC-14.1** — **Given** an author inserts an image, **when** the draft is stored, **then** the payload contains an asset key and no binary or `data:` URI.
- **AC-14.2** — **Given** a payload containing a `data:` URI submitted directly to the API, **when** publish is called, **then** publish is rejected with a message naming the offending block.

### FR-15 · Replacing an asset updates every referencing page

- **AC-15.1** — **Given** four published pages referencing asset `hero-01`, **when** an admin replaces the file behind that key, **then** all four serve the new image.
- **AC-15.2** — **Given** that replacement, **when** the pages are inspected, **then** no page version was created and no page record was modified.

---

## 5.3 Media and icons

### FR-20 · Upload images with bilingual metadata and alt text

- **AC-20.1** — **Given** an author uploads an image with English and Arabic alt text, **when** it is saved, **then** it appears in the shared library with both values.
- **AC-20.2** — **Given** an upload with no alt text in either language, **when** the author attempts to save, **then** saving is refused. *(Alt text is a WCAG 2.1 AA obligation under NFR-07, not a nicety.)*
- **AC-20.3** — **Given** an asset uploaded by one author, **when** a different author opens the library, **then** the asset is available to them.

### FR-21 · Show reference counts and prevent deletion of an asset in use

- **AC-21.1** — **Given** an asset referenced by three pages, **when** the library is opened, **then** it shows a count of three and can list those pages.
- **AC-21.2** — **Given** an asset referenced by at least one page, **when** deletion is attempted, **then** deletion is refused and the referencing pages are named.
- **AC-21.3** — **Given** an asset referenced by zero pages, **when** deletion is attempted, **then** it succeeds.
- **AC-21.4** — **Given** an asset referenced only by an unpublished draft, **when** deletion is attempted, **then** deletion is refused. *(A draft is a reference; deleting under it breaks the page on publish.)*

### FR-23 · Sanitise every uploaded SVG; reject if nothing drawable remains

- **AC-23.1** — **Given** an SVG containing a `<script>` element, **when** it is uploaded, **then** the stored artefact contains no script and the page rendering it executes nothing.
- **AC-23.2** — **Given** an SVG with an `onload` attribute, **when** uploaded, **then** the attribute is absent from the stored artefact.
- **AC-23.3** — **Given** an SVG referencing an external URL, **when** uploaded, **then** the reference is absent and no network request is made at render time.
- **AC-23.4** — **Given** an SVG whose only content is script or metadata, **when** uploaded, **then** the upload is **rejected** rather than stored as an empty shape.
- **AC-23.5** — **Given** a hostile SVG corpus, **when** each file is uploaded, **then** none produces script execution. *(Corpus is a Phase 5 deliverable; ADR-CMS-002 chose geometry extraction precisely because no adoptable .NET sanitiser cleared this bar.)*
- **AC-23.6** — **Given** a malicious SVG submitted directly to the Web API, bypassing the upload UI, **when** it is written, **then** it is still sanitised or rejected. *(Enforcement is server-side or it is not enforcement.)*

### FR-24 · Record what was stripped; log rejections

- **AC-24.1** — **Given** an upload from which a script was removed, **when** it completes, **then** a record names the file, what was removed, and who uploaded it.
- **AC-24.2** — **Given** a rejected upload, **when** rejection occurs, **then** a record is written with the reason. The rejection is never silent.
- **AC-24.3** — **Given** an uploader, **when** their file is modified by sanitisation, **then** they are told it was changed and what was removed.

---

## 5.5 Translation

### FR-40 · List every translatable string with its state

- **AC-40.1** — **Given** a page with translated, untranslated and stale strings, **when** the translation view opens, **then** every translatable string is listed with exactly one state.
- **AC-40.2** — **Given** the block library defines a bilingual field, **when** the list is generated, **then** no bilingual field is absent from it. *(The DFE shipped a flat field list that missed 14 of 43 field pairs — 65 translations were unreachable through the UI. Coverage is asserted against the generator, not eyeballed.)*
- **AC-40.3** — **Given** a string whose English source was never snapshotted, **when** its state is computed, **then** it is reported as **Unknown**, not as Translated. *(The DFE had no source snapshot on 221 of 226 translations, so staleness could not be computed and everything looked current.)*

### FR-41 · Mark a string stale when its English source changes

- **AC-41.1** — **Given** a translated string, **when** its English source is edited, **then** the Arabic is marked stale.
- **AC-41.2** — **Given** a stale string, **when** the Arabic is re-entered, **then** it returns to translated and the new English source is snapshotted.
- **AC-41.3** — **Given** an English source that changes only in leading or trailing whitespace, **when** staleness is computed, **then** the string is **not** marked stale. *(A whitespace mismatch flagged every padded label as stale in the DFE, which trains translators to ignore the signal.)*
- **AC-41.4** — **Given** an English source that changes only in case or punctuation, **when** staleness is computed, **then** it **is** marked stale. *(Meaning may have changed; only whitespace is safe to ignore.)*

### FR-42 · Translator edits Arabic without changing layout or structure

- **AC-42.1** — **Given** a user with only the Translator role, **when** they open a page, **then** Arabic value fields are editable.
- **AC-42.2** — **Given** the same user, **when** they open a page, **then** no control exists to add, remove, reorder or restyle a block.
- **AC-42.3** — **Given** the same user, **when** a structural change is submitted directly to the API, **then** it is refused by the platform security role, not only by the UI.

---

## 5.7 Publishing, versioning and audit

### FR-60 · Submit for review; an author cannot publish alone

- **AC-60.1** — **Given** a draft page, **when** the author submits it for review, **then** its status becomes Pending Review and the Approver can see it.
- **AC-60.2** — **Given** a user holding only the Content Author role, **when** they view a page in any status, **then** no publish control is available.
- **AC-60.3** — **Given** the same user, **when** the publish operation is invoked directly against the API, **then** it is refused. *(This is the central safety control of the whole engagement — it must not be UI-deep.)*

### FR-61 · Approver approves or returns with comments

- **AC-61.1** — **Given** a page pending review, **when** the Approver approves it, **then** it is published and becomes visible to visitors.
- **AC-61.2** — **Given** a page pending review, **when** the Approver returns it with a comment, **then** its status becomes Draft, the comment is visible to the author, and nothing is published.
- **AC-61.3** — **Given** a return, **when** the author views the page, **then** the comment is attributed to the Approver with a timestamp.

### FR-62 · Every save creates a version; no version edited in place

- **AC-62.1** — **Given** a page at version 3, **when** a save occurs, **then** version 4 is created and version 3 is unchanged.
- **AC-62.2** — **Given** any existing version record, **when** an update is attempted against it directly, **then** it is refused.
- **AC-62.3** — **Given** a sequence of ten saves, **when** version history is listed, **then** ten versions exist with author and timestamp on each.

> **No external dependency.** FR-62 and FR-63 are satisfied by `cms_pageversion`,
> which the CMS owns (`phase-3-arch.md` §3). An earlier note here made them rest
> on **DXP-P1-004**; that dependency was dropped under **C-11** on 2026-08-11 —
> the architecture never used it. These criteria are testable without any
> platform capability outside this engagement.

### FR-63 · Restore a prior version by copying it forward

- **AC-63.1** — **Given** a page at version 8, **when** a user with rights restores version 3, **then** version 9 is created carrying version 3's content.
- **AC-63.2** — **Given** that restore, **when** history is listed, **then** versions 1 through 8 all still exist. Nothing is deleted.
- **AC-63.3** — **Given** that restore, **when** the audit log is read, **then** it records that version 9 originated from a restore of version 3, and by whom.
- **AC-63.4** — **Given** a restore, **when** it completes, **then** the restored content is **not** live until it passes the normal approval route. *(Rollback must not be a path around FR-60. The CEO gate flagged the absence of a rollback approval policy.)*

### FR-64 · Publishing writes an append-only audit record in the same operation

- **AC-64.1** — **Given** a page is published, **when** the operation completes, **then** exactly one audit record exists naming the page, version, user and timestamp.
- **AC-64.2** — **Given** the audit write fails, **when** publish runs, **then** the publish does not take effect. The two succeed together or neither does.
- **AC-64.3** — **Given** an existing audit record, **when** update or delete is attempted by any role including System Administrator, **then** it is refused.
- **AC-64.4** — **Given** a caller attempts to make content live by writing the render cache directly rather than through the publish operation, **then** it is refused. *(Otherwise the audit record is optional in practice — the reason publish is a plugin, per `phase-3-arch.md` §3.)*

### FR-65 · Reject `data:` URIs and oversize payloads, reporting measured size

- **AC-65.1** — **Given** a payload containing a `data:` URI, **when** publish is called, **then** it is rejected and the message names the offending block.
- **AC-65.2** — **Given** a payload above the configured ceiling, **when** publish is called, **then** it is rejected and the message states the measured size and the ceiling.
- **AC-65.3** — **Given** a payload above the warning threshold but below the ceiling, **when** publish is called, **then** it succeeds and a warning is recorded.
- **AC-65.4** — **Given** a payload just under the ceiling, **when** it is published and re-read, **then** the content is byte-identical. **Truncation must never be silent** (NFR-09).

### FR-66 · Visitors see the last published version; drafts are never served

- **AC-66.1** — **Given** a page published at version 4 with an unpublished draft at version 7, **when** a visitor requests it, **then** version 4 is served.
- **AC-66.2** — **Given** a page never published, **when** a visitor requests it, **then** they receive not-found, not an empty page.
- **AC-66.3** — **Given** a page is unpublished, **when** a visitor requests it, **then** it is no longer served.
- **AC-66.4** — **Given** a draft exists, **when** the published render cache is inspected, **then** it contains no draft content.

### FR-67 · An unpublished page viewed internally is visibly marked

- **AC-67.1** — **Given** an internal user with rights previews an unpublished page, **when** it renders, **then** a draft marker is visible.
- **AC-67.2** — **Given** a published page, **when** an internal user views it, **then** no draft marker appears.

---

## 5.8 Access control

### FR-70 · Every capability governed by a Dataverse security role

- **AC-70.1** — **Given** any capability in this document, **when** its authorisation is traced, **then** it resolves to a Dataverse privilege on a Dataverse role.
- **AC-70.2** — **Given** the codebase, **when** it is reviewed, **then** no table, column or configuration file stores a parallel permission model.
- **AC-70.3** — **Given** a user's role is removed in Dataverse, **when** they next act, **then** the capability is withdrawn without a CMS-side change.

### FR-71 · Support Power Admin, Content Author, Translator, Approver, Viewer

- **AC-71.1** — **Given** the solution is imported, **when** roles are listed, **then** all five exist.
- **AC-71.2** — **Given** each role in turn, **when** a user holding only that role exercises the system, **then** they can perform every capability assigned to it and none assigned exclusively to another.
- **AC-71.3** — **Given** a user holding only Viewer, **when** they access the authoring surface, **then** they are refused.

---

# Phase B — not in approved scope

> Written for completeness under C-12. **Not a Phase 4 contract.**

### FR-11 · Power Admin manages theme tokens through the UI

- **AC-11.1** — **Given** a Power Admin, **when** they create a token with a slug and value, **then** it becomes available in colour fields without a deployment.
- **AC-11.2** — **Given** a token in use by published pages, **when** retirement is attempted, **then** the referencing pages are named and retirement is refused until they are changed.
- **AC-11.3** — **Given** a user without Power Admin, **when** they attempt to edit a token, **then** they are refused.

### FR-34 · A published component appears in every author's palette without a deployment

- **AC-34.1** — **Given** a component is published, **when** another author opens the editor, **then** it is in their palette without a solution import or browser reload beyond a normal session start.
- **AC-34.2** — **Given** a component is retired, **when** an author opens the palette, **then** it is absent, and pages already using it continue to render.

### FR-35 · Show which pages use a component before it is changed or retired

- **AC-35.1** — **Given** a component used by six pages, **when** an admin opens it, **then** all six are listed.
- **AC-35.2** — **Given** a component in use, **when** a breaking change is attempted, **then** the affected pages are named and confirmation is required before proceeding.

### FR-50 · Navigation is a separately versioned record

- **AC-50.1** — **Given** navigation is edited, **when** it is saved, **then** a navigation version is created and no page version is.
- **AC-50.2** — **Given** a page is published, **when** navigation is inspected, **then** it is unchanged.
- **AC-50.3** — **Given** a navigation version, **when** a prior one is restored, **then** it copies forward as a new version.

### FR-51 · Report broken and orphaned navigation

- **AC-51.1** — **Given** a navigation entry pointing at a deleted page, **when** the report runs, **then** that entry is listed.
- **AC-51.2** — **Given** a published page absent from navigation, **when** the report runs, **then** that page is listed.
- **AC-51.3** — **Given** neither condition exists, **when** the report runs, **then** it returns empty rather than erroring.

### FR-52 · Navigation labels in both languages

- **AC-52.1** — **Given** a navigation entry, **when** it is edited, **then** English and Arabic labels are both editable in one place.
- **AC-52.2** — **Given** an entry with no Arabic label, **when** the pre-publish check runs, **then** it is reported alongside missing page translations.

---

# Phase C — explicitly rejected at the Phase 1 gate

> Written for completeness under C-12. **Requires its own gate before any work.**

### FR-22 · Power Admin uploads icons, available without a deployment

- **AC-22.1** — **Given** a Power Admin uploads an icon, **when** it is saved, **then** it appears in every author's icon picker without a deployment.
- **AC-22.2** — **Given** an uploaded icon, **when** it is rendered, **then** it takes its colour from the theme token applied to it. *(Consequence of geometry-only storage, ADR-CMS-002 — a single icon cannot carry two colours. Open as **Q10**.)*
- **AC-22.3** — All of **FR-23** and **FR-24** apply to icon upload unchanged.

### FR-30 · Build a reusable component from an arrangement of blocks

- **AC-30.1** — **Given** a Power Admin arranges blocks and saves under a name, **when** the arrangement is saved, **then** it becomes a component available in the palette.
- **AC-30.2** — **Given** a saved component, **when** it is placed on a page, **then** it renders the same arrangement.

### FR-32 · Define a component's fields from a fixed type set

- **AC-32.1** — **Given** a Power Admin defines fields, **when** they choose a type, **then** only text, long text, image, icon, colour, link, choice and number are offered.
- **AC-32.2** — **Given** a component definition, **when** a type outside the set is submitted directly to the API, **then** it is refused.

### FR-33 · Text and long-text fields are bilingual by default

- **AC-33.1** — **Given** a Power Admin adds a text field, **when** it is created, **then** it is bilingual without further action.
- **AC-33.2** — **Given** a bilingual field, **when** an author edits it, **then** both language inputs appear per **FR-03**.

### FR-72 · Shell editing separable from page-content editing

- **AC-72.1** — **Given** a user with content rights but not shell rights, **when** they open the editor, **then** header, navigation and footer are not editable.
- **AC-72.2** — **Given** a user with shell rights, **when** they edit the header, **then** the change applies across every page using that shell.
- **AC-72.3** — **Given** a shell change, **when** it is saved, **then** it is versioned independently of page content.

---

# Appendix — Should-priority FRs

Outside C-12, recorded because two carry lessons worth not re-learning.

### FR-07 · Duplicate an existing page *(Should)*

- **AC-07.1** — **Given** a page, **when** an author duplicates it, **then** a new Draft is created with copied content, a distinct slug, and empty version history.

### FR-31 · Create a component from a layout template *(Should, Phase C)*

- **AC-31.1** — **Given** a layout template, **when** a Power Admin selects which fields it carries, **then** a component is created exposing only those fields.

### FR-43 · Export and re-import strings for external translation *(Should)*

- **AC-43.1** — **Given** an export, **when** the file is opened by a translator, **then** the translatable cells are **editable**. *(The DFE shipped a read-only workbook — no translator could type in it, and it passed every test.)*
- **AC-43.2** — **Given** a re-import where a cell contains rich text or pasted formatting, **when** it is parsed, **then** the value is read correctly or the row is reported. *(The DFE parsed such cells as empty and silently discarded the translator's work.)*
- **AC-43.3** — **Given** a re-import, **when** it completes, **then** a summary states how many values were applied, skipped and rejected, and why.

---

# Coverage

| Section | Must FRs | Criteria |
|---|---|---|
| 5.1 Authoring | 7 | 26 |
| 5.2 Design system | 5 | 12 |
| 5.3 Media and icons | 4 | 16 |
| 5.5 Translation | 3 | 10 |
| 5.7 Publishing and audit | 8 | 27 |
| 5.8 Access control | 2 | 6 |
| **Phase A total** | **29** | **97** |
| Phase B | 6 | 15 |
| Phase C | 5 | 12 |
| **All Must FRs** | **40** | **124** |
| FR-03a — derived from the UI/UX spec | *(not a BRD FR)* | 6 |
| FR-03b — derived from architecture §6 (rich text) | *(not a BRD FR)* | 9 |
| Appendix (Should) | 3 | 5 |
| **Document total** | **43 + 2 derived** | **144** |

Verified mechanically against the BRD's Must list rather than counted by hand:
**every one of the 40 Must FRs has at least one criterion, and none is
orphaned.** C-12 is satisfied for FR-01 through FR-72.

```
Must FRs in BRD: 40   |   covered: 40   |   missing: none
```

---

# What these criteria do not cover

Stated so the gaps are deliberate rather than discovered in Phase 5.

| Not covered | Why |
|---|---|
| **NFR-01 to NFR-09** | C-12 asks for functional requirements. Performance, WCAG 2.1 AA and the CSP/on-prem targets need measured thresholds and a test environment — a Phase 5 QA deliverable, and NFR-07 additionally gates on the security audit. |
| **Rich-text behaviour** | Blocked on **Q1**. If rich text is in scope, FR-02, FR-03, FR-40 and FR-65 all gain criteria, and the FR-65 size thresholds need re-measuring — prose compresses at 3–4×, not the 50× a block tree achieves. |
| **Approval routing** | Blocked on **Q3**. FR-60 and FR-61 assume a single route. Multiple routes change both requirements materially. |
| **Arabic slug format** | Blocked on **Q9** — affects AC-01.1. |
| **Multi-colour icons** | Blocked on **Q10** — affects AC-22.2. |
| **On-premise behaviour** | Blocked on **Q4**. Every criterion here is written against Dataverse cloud; the on-prem path may differ at the plugin registration boundary. |
| **Migration of existing content** | Blocked on **Q6**, and out of BRD scope until answered. |

## Status

**Draft.** C-12 names the BA as owner and Phase 4 start as the gate. QA should
ratify these in Phase 5 planning and will likely add negative and boundary cases
— particularly around FR-23, where the hostile SVG corpus is itself a
deliverable.
