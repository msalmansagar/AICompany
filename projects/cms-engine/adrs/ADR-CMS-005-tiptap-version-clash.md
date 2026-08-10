# ADR-CMS-005 — The Tiptap clash is a retirement, not an upgrade

| | |
|---|---|
| **Status** | **Proposed** — satisfies CEO condition **C-8** |
| **Date** | 2026-08-10 |
| **Raised by** | Phase 1 CEO gate, condition C-8 |
| **Applies to** | CMS Engine (CMS-ENG-001), Portal Shell (DFE-PORT-001) |
| **Related** | ADR-CMS-003 (adapter boundary), ADR-CMS-004 (own the runtime renderer) |

---

## Context

Condition C-8 requires resolving a version clash: **portal-shell depends on
Tiptap 2.10, while Puck bundles Tiptap 3.x.** Two majors of the same library in
one application means both are installed, both are bundled, and behaviour
depends on which one a given import resolves to.

The obvious readings are "upgrade portal-shell to 3.x" or "accept the
duplication". Investigation shows neither is the right answer, because the
premise — that these are two competing dependencies of one system — is wrong.

---

## Evidence

### Puck's side

Tiptap is a **hard dependency** of `@puckeditor/core`, not optional: **20 Tiptap
packages** are declared. Installed footprint is **5.8 MB across 21 packages**,
currently at 3.29.2. It cannot be tree-shaken away by declining to use Puck's
rich-text field, because Puck imports it at module level.

### Portal-shell's side

| Question | Answer |
|---|---|
| How many files import Tiptap? | **One** — `apps/web/src/components/cms/RichTextEditor.tsx` |
| Who uses that component? | **Two** admin screens: CMS *new page* and CMS *edit page* |
| Does the visitor-facing renderer use Tiptap? | **No** — `RichTextDisplay` uses DOMPurify + `dangerouslySetInnerHTML` |

So portal-shell's seven Tiptap 2.x dependencies exist to power **one component,
used by two admin screens, both of which are CMS content authoring**.

That is precisely what the CMS Engine replaces.

---

## Decision

**There is no version clash to resolve. There is a component to retire.**

At the point the CMS Engine takes over content authoring:

1. `components/cms/RichTextEditor.tsx` is deleted
2. The two admin CMS screens are superseded by the CMS Engine's authoring surface
3. The **seven** `@tiptap/*@2.x` entries leave `apps/web/package.json`
4. Only Puck's Tiptap 3.x remains — one major, no duplication, nothing to reconcile

Upgrading portal-shell to Tiptap 3.x would be a breaking upgrade of a component
scheduled for deletion. That is work spent on something being removed.

### Sequencing — the honest part

The retirement cannot happen on day one. During Delivery Phase A both editors
coexist while the new one is built, and in that window **both Tiptap majors are
in the admin bundle**.

| Period | State | Who is affected |
|---|---|---|
| Phase A build | Both majors present | Authors only — a larger admin bundle |
| Phase A cutover | `RichTextEditor.tsx` deleted, 7 deps dropped | Nobody — the clash is gone |

**Visitors are unaffected throughout**, for two independent reasons: portal-shell's
visitor renderer never used Tiptap, and ADR-CMS-004 keeps Puck out of the visitor
path entirely. Duplication is confined to a tool used by a handful of people, for
one phase.

---

## Two findings this surfaced that C-8 did not ask about

### 1. A capability regression is possible

Retiring `RichTextEditor` removes something portal-shell can do **today**:
authors write rich text for CMS pages.

**If OQ-1 concludes that rich text is out of scope for the CMS Engine, then the
replacement is less capable than the thing it replaces.** That is a scope
decision, not a technical one, and the BRD did not catch it.

| OQ-1 outcome | Consequence |
|---|---|
| Rich text **in** scope | CMS Engine uses Puck's rich-text field (Tiptap 3.x). Retirement is clean and capability is preserved. |
| Rich text **out** of scope | Retirement removes an existing capability. Either accept the regression deliberately, or keep the old screens alive and keep the clash. |

This should go to whoever answers OQ-1, because it changes what that answer
costs.

### 2. Existing CMS content needs migrating

portal-shell stores CMS content as HTML in `qdb_cms_contents.bodyHtml`. The CMS
Engine stores a block tree in `qdb_cmspageversion.qdb_contentjson`. **Different
models.**

The BRD places "migrating existing hardcoded pages" out of scope — but this is
not hardcoded pages, it is *existing CMS content already authored by business
users*. Retiring the old editor without migrating its content would strand it.

Raised as a new open question below.

---

## Consequences

### Positive

- No breaking upgrade of a component being deleted.
- Net **removal** of seven dependencies rather than a version bump.
- One Tiptap major in the final state, with no resolution overrides or aliasing.
- Duplication is bounded in both time and audience.

### Negative

- Admin bundle carries both majors for the duration of Phase A.
- Retirement is a real task with a real dependency — it cannot complete until the
  CMS Engine's authoring surface is live.
- Two capability questions now hang off OQ-1 instead of one.

---

## Alternatives considered

| Option | Why not |
|---|---|
| **Upgrade portal-shell to Tiptap 3.x** | A breaking upgrade of a component scheduled for deletion. Work spent on something being removed. |
| **Accept duplication permanently** | 5.8 MB of duplicated library in the admin bundle forever, plus the ongoing hazard of two majors resolving unpredictably. |
| **Pin both with npm `overrides`/aliasing** | Forces one major on code written for the other. Silent runtime breakage rather than a build error. |
| **Drop Puck's rich-text field to avoid Tiptap** | Does not work — Tiptap is a hard dependency of `@puckeditor/core` and is imported at module level. |

---

## Open questions

| # | Question | Owner |
|---|---|---|
| OQ-C | Does existing `qdb_cms_contents` content need migrating into the new block model? It is authored business content, not hardcoded pages, so the BRD's migration exclusion may not cover it. | QDB Digital / BA |
| OQ-D | If OQ-1 excludes rich text, is losing portal-shell's existing rich-text authoring an accepted regression? | QDB Digital |

---

## Verification required before acceptance

- [ ] Confirm no other portal-shell code imports Tiptap — currently one file, re-check at cutover
- [ ] Confirm the visitor bundle contains no Tiptap, by inspecting built output rather than the import graph
- [ ] Confirm `RichTextDisplay` remains functional after `RichTextEditor` is deleted; they are separate components and only the editor is retired
- [ ] Measure the admin bundle during the coexistence window, so the cost is known rather than assumed
