# DFE — Gap Analysis vs. a Modern Form Builder / Engine

_Prepared 2026-07-03. Grounded in the current codebase (schema, generators, web/in-CRM/mobile runtimes, designer). "Modern form builder" reference set: Jotform, Typeform, Formstack, Fillout, Tally, form.io, SurveyJS, Power Apps/Pages forms._

Legend: ✅ present · ◑ partial · ❌ absent

---

## 1. What DFE already does well (not gaps)

- Multi-tab / multi-section / multi-column layouts; wizard navigation; section icons; tab descriptions.
- **23 field types** (text, number, date, currency, dropdown, multiselect, radio, checkbox, boolean, lookup incl. cascading, **multi-select lookup**, file upload, rich text, repeating grid, interactive grid, info-card, **label** static + data-bound, custom).
- **Validation** (12 rule types) + **business rules & calculations** via a sandboxed expression engine (show/hide/require/readonly/setValue/calculate/filter).
- Cascading lookups + interactive grids against CRM data.
- File upload (CRM annotations / SharePoint), template download.
- **Multi-language / RTL (Arabic)**; form-level access policies; audit logging; multi-tenant.
- Strong **theming / custom-CSS / WCAG-contrast** design system (~70 design attributes, dark mode).
- **Versioning + snapshots**; publish-time **render cache** (gzip + hash).
- Designer: drag-and-drop, **undo/redo**, per-type property panels, rule/validation/mapping/translation editors, live style panels, Publish + Open (in-CRM dialog), **Form Properties** entry point.
- **Three runtimes** from one definition: web portal, in-CRM engine (web resource), **offline React-Native mobile** (pending-submission queue + sync).
- Power Automate flow trigger on submit; Dataverse-native **cloud and on-premise**.

DFE is a strong **enterprise, Dataverse-native, multi-surface data-capture engine**. The gaps below are mostly the "modern SaaS builder" + growth/trust features.

---

## 2. Major gaps (prioritized)

### P1 — Table stakes for a modern builder
| # | Gap | Status | Why it matters |
|---|---|:--:|---|
| 1 | **Template gallery / starter forms** (clone-to-start) | ❌ | Every modern builder opens with a template library; biggest first-run gap. |
| 2 | **Submission analytics** — completion rate, drop-off/abandonment funnel, per-field analytics | ❌ | Core to form optimization; expected in every SaaS builder. |
| 3 | **Response management UI** — submissions inbox/table, search, filter, CSV/Excel export | ❌ | Data lands in Dataverse with no in-product viewer. |
| 4 | **CAPTCHA / bot & spam protection** (reCAPTCHA/hCaptcha/honeypot + rate limit) | ❌ | Critical for any public-facing form. |
| 5 | **E-signature** field (draw/type + audit trail) | ❌ | Standard for agreements, consent, applications. |
| 6 | **PDF generation** of a completed submission (template-driven) | ❌ | PDF today only appears as an upload type, not output. |
| 7 | **Email notifications / autoresponders** (submitter confirmation + owner alerts) | ❌ | Only an on-screen confirmation message exists. |

### P2 — Modern authoring & UX
| # | Gap | Status | Why it matters |
|---|---|:--:|---|
| 8 | **AI-assisted authoring** ("describe a form → generate", field/rule suggestions) | ❌ | Rapidly becoming expected baseline. |
| 9 | **Live side-by-side WYSIWYG preview** | ◑ | Preview is a separate screen, not inline. |
| 10 | **Real-time collaboration** / multi-user editing + comments | ❌ | Expected for team authoring. |
| 11 | **Reusable blocks / section library** (save & reuse field groups) | ❌ | Speeds authoring; DRY across forms. |
| 12 | **Conversational / one-question-at-a-time mode** (Typeform-style) | ❌ | Higher completion for public forms. |
| 13 | **Embed options** — iframe/script embed, popup/slide-in widget | ◑ | Portal + in-CRM only; no external-site widget. |
| 14 | **Prefill from URL params / API** + query mapping | ◑ | Common for personalized/campaign links. |

### P3 — Logic, inputs & integrations
| # | Gap | Status | Why it matters |
|---|---|:--:|---|
| 15 | **Skip logic / branch routing** ("jump to page X based on answer") | ◑ | Has show/hide; true branching/skip is distinct. |
| 16 | **Scoring / quiz / assessment** (weighted, pass/fail) | ❌ | Whole class of use cases (quizzes, calculators). |
| 17 | **Rich input types** — rating, slider, matrix/grid, ranking, NPS, image choice, address autocomplete/geo | ❌ | Modern surveys/forms expect these. |
| 18 | **Input masks / formatters** (phone, currency, IBAN, card) | ◑ | Only prefix/suffix today. |
| 19 | **Native webhooks / connector marketplace** (Zapier/Make/generic webhook) | ◑ | Power Automate only. |
| 20 | **Payment collection** (Stripe/PayPal, PCI-offloaded) | ❌ | Order forms, donations, registrations. |

### P4 — Lifecycle & growth
| # | Gap | Status | Why it matters |
|---|---|:--:|---|
| 21 | **Form availability controls** — open/close dates, submission limits/quotas | ❌ | Events, applications, limited offers. |
| 22 | **Abandonment recovery** — anonymous partial-save + email nudge | ◑ | Draft-save is auth-only today. |
| 23 | **A/B testing** of form variants | ❌ | Conversion optimization. |
| 24 | **Author-time accessibility auditor** (full WCAG, not just contrast) | ◑ | Compliance + inclusivity. |
| 25 | **Consent/GDPR blocks, data-retention policies, field-level PII tagging** | ◑ | Has audit + access policies; not field-level governance. |

---

## 3. The short version

DFE's differentiators (Dataverse-native cloud+on-prem, three runtimes incl. offline mobile, deep CRM data integration, strong theming/i18n, business rules, versioning) are genuinely ahead of pure-SaaS builders. To read as a *modern form builder*, the highest-leverage additions, in order, are:

1. **Template gallery**
2. **Submission analytics + response viewer (with export)**
3. **CAPTCHA / spam protection**
4. **E-signature**
5. **PDF generation**
6. **Email notifications / autoresponders**
7. **AI-assisted authoring**

Those seven close most of the perceived gap versus Jotform / Typeform / Formstack / form.io.

---

_See also `DFE-market-analysis.md` for the competitor comparison table and human-vs-AI delivery timelines._
