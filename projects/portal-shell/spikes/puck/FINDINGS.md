# Puck RTL Spike — Findings

**Date:** 2026-08-05
**Stack:** Next 14.2.18 + React 18.3.1 + `@puckeditor/core@0.22.4` (portal-shell's exact versions)
**Verdict:** **PASS — adopt Puck.** No fatal finding. One item needs a 30-second human confirmation.

---

## Results against the criteria set before testing

| ID | Test | Result | How verified |
|----|------|--------|--------------|
| **F1** | `<Render>` runtime under RTL | **PASS** | Screenshot. Arabic right-aligned; `borderInlineStart` renders on the right; START column right of END. |
| **F2** | Editor mounts in RTL on React 18 | **PASS** | Editor rendered fully; no console errors; install had no peer conflict. |
| **M1** | Editor chrome mirrors | **PASS** | RTL: Blocks panel right (x≈1205), fields left. LTR control: Blocks left (x≈213). |
| **M2** | Drop lands at the correct index under RTL | **PASS (source-verified, not visually confirmed)** | Puck inverts insert position by direction — see below. Automation could not drive dnd-kit; control run failed identically in LTR, so Puck is not implicated. |
| **M3** | Nested slot ordering under RTL | **PASS** | Measured rects: START x 646→1280 (right), END x 0→634 (left). LTR control correctly reversed. |
| **M4** | Arabic in field inputs | **PASS** | Fields panel showed Arabic labels (العنوان / العنوان الفرعي) and right-aligned Arabic values. |
| m1 | Breadcrumb chevron direction | Minor defect | `>` still points right in RTL. Cosmetic. |

---

## The two findings that changed the decision

### 1. Puck propagates direction into the canvas iframe by itself

The predicted failure mode was that an iframe document does not inherit `dir` from its
parent, leaving the canvas LTR while the host is RTL. **This does not happen.**

Live probe with no injection attempted (`force=false`):

```
PROBE: iframe <html dir="rtl"> · computed body direction: rtl
```

The `iframe: { enabled: false }` escape hatch is therefore **not needed**. We keep
viewport simulation and style isolation.

### 2. RTL is deliberately implemented in the drop-index math

From `@puckeditor/core/dist/index.js`:

```js
const dir = getDeepDir(target.element);
const collisionPosition =
  collisionData?.direction === "up" ||
  (dir === "ltr" && collisionData?.direction === "left") ||
  (dir === "rtl" && collisionData?.direction === "right")
    ? "before" : "after";
```

Direction is resolved from the live DOM (`getDeepDir`), not a config flag, and the
horizontal collision → insert-position mapping is explicitly inverted for RTL.
The stylesheet also carries `:dir(rtl)` rules for chrome controls.

`@dnd-kit` itself contains **zero** RTL references — collision detection is purely
coordinate-based against already-mirrored rects, so it needs none.

---

## Corrections to earlier assumptions

| Earlier claim | Actual |
|---|---|
| "React 19 / Next 15 upgrade rides along with Puck" | **Wrong.** `peerDependencies: react ^18.0.0 \|\| ^19.0.0`. Installs clean on portal-shell's React 18 / Next 14.2. The React 19 requirement belongs to Puck's *App Router recipe*, not the library. |
| "iframe won't inherit dir — likely the breaking point" | **Wrong.** Puck handles it. |

---

## Open item (needs a human, ~30 seconds)

**M2 visual confirmation.** Automation could not trigger dnd-kit's pointer sensor —
`left_click_drag` is instantaneous and synthetic PointerEvents left the editor in a
stuck-preview state. A control run in LTR failed the same way, so this is a harness
limit, not a Puck defect.

Manual repro (dev server on port 3100):

1. Open `http://localhost:3100/edit?dir=rtl&iframe=1`
2. Drag **نص (Text)** from the right-hand Blocks panel into the **blue START** box
   (the visually RIGHT column).
3. **Pass:** it lands in START (blue). **Fail:** it lands in END (red/left).
4. Repeat dropping between the Hero and the text block — the insertion line should
   appear where the pointer is.

---

## New risks logged (not RTL, found along the way)

1. **Tiptap major-version clash.** Puck bundles `@tiptap/*@^3.11`; portal-shell's CMS
   uses `@tiptap/*@^2.10`. Two majors in one app — needs a resolution check before
   integration.
2. **`next@14.2.18` has a published security vulnerability** (npm warns on install;
   Next.js security update 2025-12-11). Portal-shell pins this exact version.
   Independent of Puck, but it surfaced here.

---

## Recommendation

Proceed to the ADR. Puck is viable on the current stack with no version upgrade and no
loss of the iframe canvas. Confirm M2 by hand first; if it fails, the mitigation is
`collisionAxis` on the slot or `iframe: { enabled: false }`, not abandoning Puck.
