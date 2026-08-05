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
| `/landing?dir=ltr` | Marketplace landing page |
| `/login?dir=ltr` | Sign-in stub — submitting lands on `/reyada` |

Flow: `/landing` → sign-in → `/login` → submit → `/reyada?dir=ltr`.

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
