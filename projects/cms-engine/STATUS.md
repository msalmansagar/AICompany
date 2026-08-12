# CMS Engine — feature status

**As at 2026-08-12**, verified against `org5869857f` rather than reported from
intent. Every ✅ below has been exercised; nothing is marked done because it was
written.

```
Delivery Phase A .... 11 of 29 Must FRs done, 6 partial, 12 not started
Delivery Phase B ....  0 of  6 Must FRs done, 2 partial
Delivery Phase C ....  0 of  5 Must FRs
Non-functional ......  3 of  9 evidenced
```

**What works end to end today:** create a portal, create a page in it, compose
blocks in English and Arabic, save versions, approve, publish, and read the
published page back. 11 automated checks pass against the live org.

---

## Live on org5869857f

| | |
|---|---|
| Solution | `MssCmsEngine`, publisher `MSST`, prefix `msst` |
| Entities | **11**, 67 custom columns, every one prefixed |
| Relationships | 6 |
| Custom APIs | 3 declared, **2 implemented** |
| Plugin assembly | `Msst.CmsEngine.Plugins`, signed, registered |
| Web resources | `msst_cms_editor.html`, `msst_cms_viewer.html` |
| Approval routes | `standard`, `regulated` |

---

## Phase A — proposed for build

### Authoring

| | Requirement | State |
|---|---|---|
| FR-01 | Create a page from a title; **system derives the slug** | 🟡 Page creation works, but the author types the slug. Derivation is not implemented. |
| FR-02 | Compose from a block palette; reorder and remove | ✅ Puck |
| FR-03 | English and Arabic together on the same block | ✅ |
| FR-03b | Rich text — a **closed** toolset | 🔴 A raw HTML textarea. No constrained toolbar, **no sanitisation at publish**. The security control §6 specifies does not exist. |
| FR-04 | Render as the visitor sees it, either language, in the editor | 🟡 Both languages render stacked; there is no language switch |
| FR-05 | Preview at desktop, tablet and mobile widths | 🔴 Not started |
| FR-06 | Auto-save drafts with no explicit action | 🔴 Saving is explicit |
| FR-07 | Duplicate an existing page | 🔴 Not started |
| FR-08 | Before publish, show which fields have no Arabic | 🔴 Not started |

### Media

| | Requirement | State |
|---|---|---|
| FR-14 | Images by asset key; never a binary or `data:` URI | 🟡 Enforced **negatively** — a `data:` URI is rejected at publish. There is no image block and no asset reference. |
| FR-15 | Replacing an asset updates every referencing page | 🔴 Not started |
| FR-20 | Media library with bilingual metadata and alt text | 🔴 Table exists with **no binary column** (gate condition G-1). No UI. |
| FR-21 | Reference count; refuse deletion while in use | 🔴 Not started |
| FR-23/24 | Sanitise uploaded SVG; record what was stripped | 🔴 Contract only — `msst_CmsUploadIcon` has no implementation |

### Translation

| | Requirement | State |
|---|---|---|
| FR-40 | List translatable strings as translated / missing / stale | 🔴 Not started |
| FR-41 | Mark stale when the English source changes | 🔴 **No table for translation state or source snapshots.** AC-41.2 requires a snapshot; there is nowhere to put one. |
| FR-42 | Translators edit Arabic without touching structure | 🔴 Not started |
| FR-43 | Export and re-import strings | 🔴 Not started |

### Publishing, versioning and audit

| | Requirement | State |
|---|---|---|
| FR-60 | Submit for review; **an author cannot publish alone** | ✅ Enforced in the plugin. Proven by test. |
| FR-61 | Approver approves **or returns with comments** | 🟡 Approve only. No return path, no comments. |
| FR-62 | Every save creates a version; none edited in place | ✅ |
| FR-63 | Restore any prior version, copied forward | 🔴 Versions accumulate; nothing restores one |
| FR-64 | Audit written in the same operation as publish | ✅ Plugin-written, unbypassable |
| FR-65 | Reject `data:` URIs and oversize payloads with the measured size | ✅ Proven by test |
| FR-66 | Visitors see the last published version; drafts never served | ✅ Proven by test |
| FR-67 | An unpublished page viewed internally is marked draft | 🔴 Not started |

### Access control

| | Requirement | State |
|---|---|---|
| FR-70 | Every capability governed by a Dataverse security role | 🔴 **No roles created.** Everything runs as whoever is signed in. |
| FR-71 | Power Admin, Content Author, Translator, Approver, Viewer | 🔴 Not started |
| FR-72 | Shell editing separable from content editing | 🔴 Not started |

### Portals *(added beyond the original BRD)*

| | Capability | State |
|---|---|---|
| — | A portal owns its pages | ✅ |
| — | The render cache is keyed by portal and slug | ✅ Two portals can hold the same slug — proven by test |
| — | A page with no portal cannot publish | ✅ |
| — | Portal picker and creation in the editor | ✅ |
| — | Host name, locale set, status on a portal | 🟡 Stored, not yet acted on |

---

## Phase B — not approved for build

| | Requirement | State |
|---|---|---|
| FR-10 | Colour only from approved tokens | 🟡 A select of **three hardcoded** tokens. Not driven by the token table. |
| FR-11 | Power Admin manages tokens through the UI | 🔴 Table exists, no UI |
| FR-12 | Changing a token changes every page without re-versioning | 🔴 Editor preview hardcodes the colours |
| FR-13 | Tokens resolve per locale | 🔴 Not started |
| FR-34 | A published component appears in every palette | 🔴 Not started |
| FR-35 | Show which pages use a component before it changes | 🔴 Not started |
| FR-50 | Navigation separately versioned | 🟡 Table and portal link exist; no logic, no UI |
| FR-51 | Report broken navigation and orphaned pages | 🔴 Not started |
| FR-52 | Navigation labels in both languages | 🔴 Not started |

---

## Phase C — not approved for build

FR-22 icon upload · FR-30 build a component from blocks · FR-31 from a template ·
FR-32 typed component fields · FR-33 bilingual by default.

**None started. No component definition table exists.**

---

## Non-functional

| | Requirement | State |
|---|---|---|
| NFR-01 | Published pages render from cache, p95 < 200 ms | 🟡 Cache exists and is read. **Never measured.** |
| NFR-02 | Editor interactive in under 5 s | 🟡 147 kB gzipped. **Never measured in CRM.** |
| NFR-03 | No externally hosted component | ✅ By construction |
| NFR-04 | Functions under a restrictive CSP | 🟡 Bundle is self-contained with nothing external. **Not verified under an actual restrictive policy.** |
| NFR-05 | Content stays in the approved region | ✅ Inherits the org |
| NFR-06 | Arabic RTL authoring UI | ⏸ Deferred by decision — English for Phase A |
| NFR-07 | WCAG 2.1 AA | 🔴 Not audited, either surface |
| NFR-08 | One solution imports to cloud **and on-premise** | 🟡 **Cloud only. Never once tested on-premise.** |
| NFR-09 | No silent truncation | ✅ AC-08.1 verified — payload columns at 1,048,576 |

---

## The five things most likely to bite

**1 — Rich text has no sanitisation.** FR-03b and §6 specify an allowlist applied
at publish. The field is a raw HTML textarea and the publish plugin does not
touch it. **A script tag typed into a page would be stored and served.** This is
the largest single gap between what is designed and what runs.

**2 — There are no security roles.** FR-70 says every capability is governed by a
Dataverse role. Nothing is. The approval gate refuses an author who approves
their own work, but nothing stops any user reaching the editor at all.

**3 — Misclassification is still open.** §5 says an author must not be able to
set a page's classification, and that reclassifying must invalidate an
unpublished approval. Neither is implemented, so the route control can be walked
around by choosing the lenient route.

**4 — On-premise has never been tested.** NFR-08 and the whole §7 design — Custom
Actions with matching message names — are unexercised. The claim that one
solution serves both platforms is currently a design intention.

**5 — The viewer is not the product renderer.** ADR-CMS-004 requires our own
React renderer sharing a block library with the editor, byte-identical to Puck's
output and guarded by the parity harness. What ships is 150 lines of plain
JavaScript handling two block types.

---

## Suggested order from here

1. **Rich-text sanitisation at publish** — closes the one live security gap
2. **Security roles** — FR-70/71, and everything else assumes them
3. **Classification privilege + reclassification invalidates approval** — finishes §5
4. **Version restore** — FR-63, a Must, and the schema already supports it
5. **Media binaries** — needs gate condition G-1 answered first
6. **An on-premise import** — turns NFR-08 from intention into evidence
