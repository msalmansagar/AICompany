# Puck evaluation spike

Evaluates [Puck](https://github.com/puckeditor/puck) (`@puckeditor/core`) as the
page-composition layer for portal-shell / DXP, on **portal-shell's exact stack**:
Next 14.2.18 + React 18.3.1. No version upgrade was required — Puck's peer range
is `react ^18.0.0 || ^19.0.0`.

## Run

```bash
npm install
npm run dev      # http://localhost:3100
```

## Routes

| Route | What it shows |
|---|---|
| `/view?dir=rtl` | `<Render>` runtime under RTL — the fatal test |
| `/edit?dir=rtl&iframe=1` | Editor in RTL, with a live probe of the canvas iframe's direction |
| `/edit?dir=rtl&iframe=0` | Escape hatch — inline canvas (turned out to be unnecessary) |
| `/portal?dir=rtl` · `?dir=ltr` | Bilingual portal shell composed entirely of Puck root slots |
| `/portal?...&mode=edit` | The same shell, editable |
| `/reyada?dir=ltr` · `?dir=rtl` | Reyada Advisory dashboard, bilingual, matching the supplied design |
| **`/landing-puck?mode=edit`** | **Landing page composed in Puck — 10 editable sections** |
| **`/login-puck?mode=edit`** | **Login page composed in Puck — 2 editable components** |
| `/landing?dir=ltr` | Same landing page hand-written in React, kept for comparison |
| `/login?dir=ltr` | Same login page hand-written in React |

Flow: `/landing-puck` → sign-in → `/login-puck` → submit → `/reyada?dir=ltr`.

### Why two versions of each page

`/landing` and `/login` were written directly in React first. That was a
mistake for an evaluation spike — you cannot judge Puck's capability from
pages Puck did not build. `/landing-puck` and `/login-puck` are the same two
pages composed as Puck components, and they are the ones to look at.

Both are kept so the difference is inspectable: identical output, identical
CSS, one editable by an admin and one not. Converting required **no styling
changes at all**, because `app/landing.css` was written against classNames
rather than inline styles.

Editable in `/landing-puck`: every heading fragment (including which words are
highlighted green), body copy, nav links, the five service cards with their
tags, the four process steps, both "Choose Your Path" cards with their
checklists, provider cards, academy cards, benefit cards, and all four footer
columns with their links — in English and Arabic, on one tree.

## Read the findings, not just the code

| File | Covers |
|---|---|
| `ACCEPTANCE.md` | Pass/fail criteria, fixed **before** testing |
| `FINDINGS.md` | RTL verdict — **PASS**, plus two corrections to earlier assumptions |
| `PORTAL-FINDINGS.md` | Shell composition, responsive, bilingual architecture |
| `REYADA-FINDINGS.md` | Design reproduction + four bugs found while building |

## Headline results

- **Arabic RTL passes.** Runtime, editor chrome, canvas, field inputs, fonts.
  Puck propagates `dir` into the canvas iframe itself, and inverts its
  drop-index math under RTL (`getDeepDir` in the shipped bundle).
- **Puck's own editor UI is English-only** — no i18n API, strings hardcoded.
  Localising it means replacing chrome via the `overrides` prop.
- **`defaultProps` do not apply to stored data.** Saved JSON must carry every
  prop; this has direct consequences for DXP-P1-004 versioning.
- **Bundle:** editor 644 KB JS + 100 KB CSS; runtime `rsc.js` **52 KB**. That
  ~12× gap matters for the on-prem CRM web-resource path.

## Status

Spike only. Not wired to Dataverse, not authenticated, images are CSS
gradients, Arabic copy is unreviewed. `login/page.tsx` is a navigation stub —
real auth is Auth.js v5 → JWT → Fastify → msal-node per ADR-PORT-005.
