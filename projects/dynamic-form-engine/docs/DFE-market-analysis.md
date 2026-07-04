# DFE — Feature Inventory, Market Comparison, Gap Analysis & Delivery Timeline

_Prepared 2026-07-01. Feature inventory is drawn from the current codebase (schema, shared types, C#/Node generators, web/in-CRM/mobile runtimes, designer). Timelines give both a human-developer estimate and an AI-assisted estimate._

---

## 1. DFE Feature Inventory

### 1a. Form Engine (runtime)

**Structure & layout**
- Multi-tab, multi-section, multi-column (1–4) forms; collapsible sections; wizard/stepper navigation; hide-tab-bar full-screen mode.
- Section icons, tab descriptions, section descriptions.
- Responsive layout grid (per-field span for mobile/tablet/desktop).

**Field types (22)**
- text, textarea, number, decimal, currency, date, datetime, email, phone, dropdown, multiselect, radio, checkbox, boolean (toggle/radio), lookup (single, dependent/cascading, filtered), file upload, rich text, repeating grid, interactive grid (selection from saved views + entry), info-card, **label (static + data-bound read-only)**, custom (developer-registered component).

**Logic & rules**
- Validation: required, min/max length, min/max value, regex, email, phone, date-before/after, cross-field compare, custom expression; rule templates; priority ordering.
- Business rules: show/hide/require/optional/readonly/editable, set/clear value, calculate value, filter options, filter lookup — driven by a condition engine (json-rules-engine + a sandboxed ExpressionEngine with op-budget/timeout).
- Dynamic options (from CRM option sets or related entities); dependent lookups with filter templates.

**Actions & navigation**
- Scoped buttons on tabs/sections: navigate (tab / section / next / previous / external URL / another form), final submit, save draft, call API.
- Extra submission parameters (static / hidden-field / server-stamped runtime-context / computed expression), with size + count caps.
- Info-card intro flows (multi-screen); confirmation messages + record reference.

**Data & submission**
- Submission mappings → CRM entity attributes, child-entity relationships, transform expressions.
- File upload to CRM annotations or SharePoint (MIME/size/count limits, document types, template download).
- Save draft / resume (draft expiry); Power Automate flow trigger on submit.
- Summary step: **system-generated** or **manual** (designer-built review tab of read-only data-bound labels).

**Styling / design system**
- Themes (colours, typography, shadow/spacing scales, dark mode); form/section/field/button design; custom CSS with a sanitizer + domain allowlist; WCAG contrast checking; ~70 design attributes.

**Platform & delivery**
- Dynamics 365 / Dataverse native, **cloud + on-premise**.
- Three runtimes from one form definition: **web portal**, **in-CRM engine** (single-file web resource), **React Native mobile** (offline cache + pending-submission queue + sync).
- Publish-time **render cache** (gzip + hash) for fast delivery; form **versioning/snapshots**.
- Multi-language / i18n (translations per entity/field, RTL/Arabic); form-level access policies; audit logging; multi-tenant.

### 1b. Designer (authoring)
- Drag-and-drop canvas (tabs/sections/fields); field toolbox (basic / layout / advanced); per-field-type property panels.
- Tab/section/field properties (columns, collapsible, icon, description, visibility, span).
- Editors: validation rules, business rules, option values, lookup config, grid columns, submission mappings, info-cards, scoped buttons, translations.
- Design/styling panels (theme/form/section/field/button) with live canvas preview.
- **Summary-mode selector, Label field, data-bound Label source picker** (new).
- Form list, new-form wizard, preview; immediate CRUD to Dataverse + publish.

### 1c. Governance / delivery model
- BA→BRD→CEO→Architecture→Build→Review→QA→Audit→CEO pipeline; ADRs; state tracking.

---

## 2. Market Comparison

Legend: ✅ full · ◑ partial · ❌ none

| Capability | **DFE** | form.io | SurveyJS | Power Apps / Pages (native) | Jotform / Formstack (SaaS) |
|---|:--:|:--:|:--:|:--:|:--:|
| Visual drag-drop designer | ✅ | ✅ | ✅ | ✅ | ✅ |
| JSON/metadata-driven definition | ✅ | ✅ | ✅ | ◑ | ◑ |
| Dataverse / D365 native (cloud+on-prem) | ✅ | ❌ | ❌ | ✅ | ❌ |
| Multi-surface (web + embedded + native mobile) | ✅ | ✅ | ◑ | ◑ | ◑ |
| Offline mobile + sync queue | ✅ | ◑ | ❌ | ◑ | ❌ |
| Conditional logic / business rules | ✅ | ✅ | ✅ | ✅ | ✅ |
| Calculations / computed values | ✅ | ✅ | ✅ | ◑ | ◑ |
| Repeating sections / grids | ✅ | ✅ | ✅ | ◑ | ◑ |
| Lookups to backend entities (cascading) | ✅ | ◑ | ❌ | ✅ | ❌ |
| File upload (+ SharePoint/CRM notes) | ✅ | ✅ | ◑ | ✅ | ✅ |
| Multi-language / RTL | ✅ | ✅ | ✅ | ✅ | ◑ |
| Theming / custom CSS + WCAG | ✅ | ✅ | ✅ | ◑ | ◑ |
| Form versioning / snapshots | ✅ | ◑ | ❌ | ◑ | ◑ |
| Render cache / performance layer | ✅ | ◑ | n/a | ◑ | ✅ |
| Review/summary step (manual + auto) | ✅ | ◑ | ◑ | ❌ | ◑ |
| **E-signature** | ❌ | ✅ | ◑ | ◑ | ✅ |
| **Payments (Stripe/PayPal)** | ❌ | ✅ | ❌ | ◑ | ✅ |
| **CAPTCHA / anti-spam** | ❌ | ✅ | ◑ | ◑ | ✅ |
| **Template gallery** | ❌ | ✅ | ◑ | ◑ | ✅ |
| **Submission analytics / dashboards** | ◑ | ✅ | ◑ | ◑ | ✅ |
| **PDF / document generation** | ❌ | ✅ | ◑ | ◑ | ✅ |
| **Address autocomplete / geo** | ❌ | ◑ | ❌ | ◑ | ✅ |
| **Scoring / quiz logic** | ❌ | ◑ | ✅ | ❌ | ◑ |
| **Prefill from URL / API** | ◑ | ✅ | ◑ | ◑ | ✅ |
| **Webhooks / 3rd-party (Zapier)** | ◑ (Power Automate) | ✅ | ◑ | ✅ | ✅ |
| **Designer undo/redo + real-time co-edit** | ◑ / ❌ | ◑ | ◑ | ◑ | ◑ |
| **AI-assisted form building** | ❌ | ◑ | ◑ | ◑ (Copilot) | ◑ |

**Where DFE already leads / differentiates:** true Dataverse-native on-prem **and** cloud, one definition rendering to **three** runtimes incl. **offline native mobile**, deep **cascading lookups + interactive grids** against CRM data, a full **on-prem C# publish/render-cache** pipeline, enterprise **governance + audit + i18n/RTL**, and a rich **design/CSS/WCAG** system. Against pure SaaS builders (Jotform/Typeform) DFE is far stronger on enterprise data integration; against form.io it wins on Dataverse/on-prem + native mobile; against Power Apps native forms it wins on portability, styling control, and multi-surface parity.

---

## 3. Gap Analysis (prioritized)

**P1 — high demand, common in every competitor**
1. **E-signature** field (draw/type, audit trail).
2. **CAPTCHA / anti-spam** (reCAPTCHA/hCaptcha/honeypot).
3. **PDF / document generation** of a submission (server-side, template-driven).
4. **Payment** field (Stripe/PayPal/PCI-offloaded).
5. **Submission analytics dashboard** (volumes, drop-off, field-level completion).

**P2 — authoring & UX maturity**
6. **Template / starter-form gallery** (clone-to-start).
7. **Designer undo/redo + version diff**; optional **real-time co-editing**.
8. **AI-assisted authoring** ("describe a form → generate", field suggestions, rule generation).
9. **Prefill from URL/API** + query-param mapping (partially present).
10. **Rich display widgets** (image/video/map fields, HTML block, progress indicator).

**P3 — inputs & integrations breadth**
11. **Address autocomplete / geolocation / maps**.
12. **Input masks / formatters** (phone, IBAN, card) beyond prefix/suffix.
13. **Scoring / quiz / assessment** logic (weighted, pass/fail).
14. **Native webhooks / connector marketplace** (beyond Power Automate).
15. **Rating / slider / matrix** field types.
16. **Full data-bound Label + Manual-summary** for **all** field types incl. file "view" links and grid tables (currently the C-001-gated Wave 2 remainder).

**P4 — ops & platform**
17. **Partial-save analytics / abandonment recovery** emails.
18. **A/B testing** of form variants.
19. **Approval routing** UI (beyond BMP/Power Automate handoff).
20. **Accessibility auditor** in the designer (automated WCAG checks at author time).

---

## 4. Delivery Timeline — Human Developer vs AI

**Estimation basis.** Every DFE feature typically flows through **5 surfaces** (Dataverse schema → shared types → C# + Node generators → web/in-CRM/mobile runtimes → designer). That "5-surface tax" is why per-feature human effort is high. Human = one mid/senior full-stack engineer familiar with the stack. **AI = build/authoring time only** (as observed this session, where DFE-FBE-001's four features shipped across all surfaces in a single working session); it excludes gated steps AI cannot do.

| # | Gap | Human dev | AI build | Notes |
|---|---|---|---|---|
| 1 | E-signature field | 2–3 wks | 1–2 days | New field type + capture UI ×3 runtimes + storage (annotation) + audit. |
| 2 | CAPTCHA / anti-spam | 1 wk | ~0.5 day | Provider integration + server verify; mobile nuance. |
| 3 | PDF generation | 3–4 wks | 2–3 days | Server template engine + layout mapping + delivery; on-prem parity. |
| 4 | Payment field | 3–5 wks | 2–4 days | Mostly integration/compliance (PCI) — **gated on merchant + legal**, not code. |
| 5 | Submission analytics dashboard | 4–6 wks | 3–5 days | Event capture + aggregation + dashboard UI; data-residency review. |
| 6 | Template gallery | 1–2 wks | 1 day | Clone service exists; add gallery + seed templates. |
| 7 | Designer undo/redo | 2–3 wks | 1–2 days | Command/history layer over the Zustand store. |
| 7b | Real-time co-editing | 5–8 wks | 4–6 days | Hard (CRDT/presence); genuinely complex regardless of author. |
| 8 | AI-assisted authoring | 3–5 wks | 2–3 days | LLM prompt→form-definition + rule generation; iterative. |
| 9 | Prefill from URL/API | 1–2 wks | 1 day | Query-param → field mapping + secure API prefill. |
| 10 | Rich display widgets | 2–3 wks | 1–2 days | Several new display field types ×3 runtimes. |
| 11 | Address autocomplete / maps | 2 wks | 1–2 days | Maps provider + field type + mobile. |
| 12 | Input masks/formatters | 1–2 wks | 1 day | Mask engine + per-type wiring. |
| 13 | Scoring / quiz logic | 2–3 wks | 1–2 days | Scoring model + rule extension + results. |
| 14 | Native webhooks/connectors | 2–4 wks | 2–3 days | Outbound event system + retry/dead-letter. |
| 15 | Rating/slider/matrix fields | 1–2 wks | 1 day | New field types ×3 runtimes. |
| 16 | **Full Wave 2** (data-bound Label + manual summary, all types) | 2–3 wks | 2–3 days | C-001 renderer spike + file "view" endpoint + grid tables ×3 runtimes. |
| 17 | Abandonment recovery | 1–2 wks | 1 day | Draft telemetry + email trigger. |
| 18 | A/B testing | 2–3 wks | 1–2 days | Variant assignment + metrics. |
| 19 | Approval routing UI | 3–4 wks | 2–3 days | Routing model + reviewer UI. |
| 20 | Author-time WCAG auditor | 1–2 wks | 1 day | Extend existing contrast/allowlist tooling. |

**Roll-up (build effort only):**
- **Human developer:** ≈ **45–70 person-weeks** (~**11–17 months** for one engineer, or ~**4–6 months** for a 3-person squad).
- **AI (build/authoring only):** ≈ **30–50 working days** of active build (~**6–10 weeks** of AI wall-clock if run sequentially).

### The important caveat about AI timelines
The AI estimates above are **code + authoring time**, which this session shows is real and large (multiple full-surface features per session). But the **engagement wall-clock** is *not* just build time — several steps AI cannot compress or perform:
- **Live-org schema provisioning** and **CRM plugin registration** (PRT/on-prem) — user-approved / manual.
- **Deployment, UAT, and stakeholder sign-off**; data-residency/compliance reviews (payments, analytics).
- This company's **BA→BRD→CEO→Arch→QA→Audit** governance gates.

**Realistic blended model:** AI compresses the **build** phase ~8–12×, but each feature still carries a governance + deploy + test tail. Practically:
- **Human-only:** ~**11–17 months** (single dev) for the full P1–P4 backlog.
- **AI-driven (AI builds, humans approve/deploy/UAT):** the same backlog in ~**8–12 weeks** end-to-end — dominated by approvals, deploys, and testing rather than coding.

### Suggested phasing (AI-driven, value-first)
- **Phase 1 (P1, ~2–3 wks):** finish Wave 2, e-signature, CAPTCHA, PDF generation, template gallery.
- **Phase 2 (P2, ~2–3 wks):** analytics dashboard, AI-assisted authoring, undo/redo, prefill, rich widgets.
- **Phase 3 (P3, ~2–3 wks):** address/maps, masks, scoring, webhooks, rating/slider/matrix, payments (gated on merchant/legal).
- **Phase 4 (P4, ~1–2 wks):** abandonment recovery, A/B, approval routing, WCAG auditor.

---

_Estimates are planning-grade (±30%); each feature would get a proper BRD + architecture sizing per the standard process. Payments, analytics, and co-editing carry the largest non-engineering (compliance / inherent-complexity) risk._
