# React-direct vs Puck-composed — the same two pages, built twice

Both versions produce **visually identical output from identical CSS**. Every
difference below is structural, and every one was found by building it, not by
reading documentation.

| | React-direct | Puck-composed |
|---|---|---|
| Routes | `/landing`, `/login` | `/landing-puck`, `/login-puck` |
| Lines of code | **661** | **1,222** (~1.85×) |
| Editable by a non-developer | none | every string, card, link, section |
| Reorder sections | code change + deploy | drag |
| Output format | JSX | serializable JSON |
| Fits Dataverse storage | no | yes |
| First dev compile | ~16 s | **~108 s** |

Line counts: React = `app/landing/page.tsx` 335 + `app/login/page.tsx` 111 +
`landing.copy.ts` 215. Puck = `landing.puck.tsx` 695 + `landing.puck.data.ts`
226 + two 43-line route files + the same copy file.

---

## Limitations found in the Puck version

### 1. Interactive elements had to be neutered — and I introduced an a11y regression

Clicking a real `<a href>` inside the editor canvas navigates the admin away
from the editor. To avoid that I converted five call-to-action anchors to
`<span className="rey-btn">`. The React landing page has 8 anchors; the Puck
one has 6 anchors and 5 spans.

**Those spans are not focusable and not keyboard-activatable.** That is a real
accessibility regression in the published page, and it is my defect rather than
a Puck limitation — the correct fix is a `puck.isEditing` guard on every
interactive element:

```tsx
render: ({ href, label, puck }) =>
  puck.isEditing
    ? <span className="rey-btn">{label}</span>
    : <a className="rey-btn" href={href}>{label}</a>
```

The limitation is that this is **boilerplate on every interactive component**.
Miss it once and you either break the editor or ship a fake button. For a
product this belongs in a shared `<SmartLink>` wrapper, not repeated by hand.

I did apply the guard correctly in `LoginForm` (submit is inert while editing),
which is why the login page behaves properly in both modes.

### 2. React state does not survive the editor comfortably

The React login used `useState` for the inputs and `useRouter` for navigation.
The Puck version had to become uncontrolled (`defaultValue`) with
`window.location.href`, because Puck re-renders components as props change and
component-held state resets. Anything genuinely stateful — a working carousel,
an accordion, a multi-step wizard — needs deliberate care or it misbehaves in
the canvas.

### 3. Bilingual doubles the field count, and I left a fix on the table

Hero alone exposes **14 fields** (7 strings × EN/AR). An editor scrolls a lot.
Puck has an `object` field type that groups related fields; I used flat pairs
throughout. Grouping each concept into one collapsible object would roughly
halve the visible field count. Worth doing before this becomes a product.

### 4. Type safety is weaker

`landing.copy.ts` is `as const` and fully typed end to end. Inside the Puck
config, nested array item types are not inferred — I fell back to
`Record<string, string>` and one `any`. Compile-time safety that the React
version had for free is simply gone.

### 5. Edits do not persist without wiring — and this bit me

Editing `highlight1 (EN)` from "Service" to "Advisor" updated the canvas live.
Reloading the view page showed **"Service"** again, because `onPublish` in this
spike only `console.log`s. Nothing is broken; it is a reminder that the
editor is only half the system — the other half is
`qdb_PublishPage` → render cache → `qdb_GetPublishedPageJson`.

### 6. Compile and bundle cost

`/landing-puck` took **108 seconds** to first-compile in dev (Tiptap, dnd-kit,
Radix). Dev-mode only, but the editor bundle is 644 KB JS + 100 KB CSS against
52 KB for the runtime — the number that matters for the on-prem CRM
web-resource path.

### 7. An admin can now break the page

Sections are reorderable and deletable. That is the feature and the risk, and
it is why shell-level editing should be permission-gated (DXP-P1-002) and
versioned (DXP-P1-004) before anyone outside the team touches it.

---

## What the Puck version gained

- **Content changes without a deploy.** Every heading, label, card, link and
  footer column — in both languages.
- **Structure changes without a deploy.** Reorder, add, remove sections.
- **Output is serializable JSON**, which is what makes Dataverse storage and
  DXP-P1-004 snapshots possible at all. The React page cannot be versioned as
  content; it can only be versioned as code.
- **Arrays give add / remove / reorder for free** — nav links, service cards,
  footer columns, checklists. Nested arrays work.
- **Translators see EN and AR adjacent**, which is materially better than
  editing two files.
- **Zero CSS changes were required to convert.** Not one line moved.

---

## The rule this produced

> A component authored with **classNames** is Puck-composable for free.
> A component authored with **inline styles** is not — and cannot be responsive
> either, since inline styles carry no media or container queries.

That single constraint explains both the smooth conversion here and the earlier
responsive rework. It should be a coding standard for the product.

---

## Recommendation

Do not make everything Puck-composable. Split by how the surface behaves:

| Surface | Build with | Why |
|---|---|---|
| Landing, marketing, CMS pages | **Puck** | Content changes weekly; interactivity is near zero |
| Dashboards, widget layouts | **Puck** | Layout is configuration; DXP-P1-001/003 already model it as data |
| Login, registration, multi-step forms, payment | **React** | Real state, real validation, real navigation — Puck buys nothing and costs safety |
| Anything inside a form wizard | **React** | Same reason |

`/login-puck` proves the login page *can* be Puck-composed. Having built it
both ways, I would not ship it that way: it nearly doubled the code, weakened
typing, and forced an `isEditing` guard around the only thing the page does.
Nobody needs to drag-and-drop a sign-in form.
