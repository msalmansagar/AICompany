# DFE i18n Dependency Decisions
Engagement: DFE-i18n-001
Date: 2026-06-24
Author: GitHub Researcher (automated)

---

## 1. Web i18n Runtime — i18next + react-i18next vs FormatJS / react-intl

### Candidates evaluated

| Repo | Stars | License | Latest release | Status |
|------|-------|---------|----------------|--------|
| [i18next/i18next](https://github.com/i18next/i18next) | ~8,600 | MIT | v26.3.1 (May 2026) | Active |
| [i18next/react-i18next](https://github.com/i18next/react-i18next) | ~10,000 | MIT | Active alongside core | Active |
| [i18next/i18next-http-backend](https://github.com/i18next/i18next-http-backend) | ~1,100 | MIT | Active (v4, native fetch) | Active |
| [formatjs/formatjs](https://github.com/formatjs/formatjs) (react-intl) | ~14,500 | MIT | react-intl v8.0.9 (Dec 2025) | Active |

### Assessment

**i18next + react-i18next** is the stronger fit for DFE's architecture. The decisive factor is
`i18next-http-backend`: it is designed to load translations from any HTTP endpoint using a
configurable `loadPath` (supports `{{lng}}` / `{{ns}}` placeholders) and a `parse` callback for
custom response shapes. DFE's translations arrive as a Dataverse API response — not static JSON
files — so this plugin maps directly without a custom adapter layer. ICU plural support is
available via `i18next-icu` (a thin plugin wrapping `@formatjs/icu-messageformat-parser`). Bundle
size for the core + react binding is ~13 kB gzipped; the http-backend plugin adds ~3 kB.

**FormatJS / react-intl** has stronger ICU compliance out of the box and marginally more stars,
but its loading model assumes translations are provided at provider initialisation (via `messages`
prop or a loader function you manage yourself). There is no official "http backend" plugin
comparable to i18next-http-backend. Wiring a remote Dataverse fetch requires custom code, which
eliminates the library's advantage. It also does not have an official React Native package — a
separate integration path would be needed for mobile, preventing a shared i18n core.

**VERDICT: ADOPT**
Adopt `i18next` (core) + `react-i18next` + `i18next-http-backend` for all web packages.

```
npm install i18next react-i18next i18next-http-backend i18next-icu
```

Configure `loadPath` to point at the DFE backend `/api/translations?lang={{lng}}` endpoint.
Use `i18next-icu` plugin to enable ICU plural syntax (`{count, plural, one {# item} other {# items}}`).

---

## 2. Fluent UI v9 RTL

### Candidates evaluated

| Repo | Stars | License | Latest release |
|------|-------|---------|----------------|
| [microsoft/fluentui](https://github.com/microsoft/fluentui) | ~20,000 | MIT | Actively released 2026 |

### Assessment

RTL in Fluent UI v9 is **fully built-in**. No third-party library is required. The mechanism is:

1. Pass `dir="rtl"` to `<FluentProvider>` at the root.
2. Griffel (Fluent v9's CSS-in-JS engine) automatically flips all logical CSS properties
   (`paddingInlineStart`, `marginInlineEnd`, etc.) via its RTL renderer.
3. `<RendererProvider>` is embedded inside `FluentProvider` — it does not need to be wired
   separately for RTL. It only needs explicit use when embedding Fluent inside a non-Fluent shell.

**Known gaps (maps to CEO condition C-001 spike):**
- Auto-detection of `dir` from the HTML element is not implemented — you must pass the prop
  explicitly. Derive `dir` from the active language in the i18next `languageChanged` event.
- Some older v9 components (Slider in particular — issue #33592) have reported RTL rendering bugs
  that Microsoft has not yet resolved. Audit each form field type used in DFE against known issues
  before shipping.
- Component-level RTL (mixing LTR and RTL subtrees) is not supported — direction is document-wide.

**VERDICT: ADOPT (built-in, no additional library needed)**
Toggle `dir` on `<FluentProvider>` in response to `i18next.on('languageChanged')`.

---

## 3. React Native / Expo RTL + i18n

### Candidates evaluated

| Repo | Stars | License | Notes |
|------|-------|---------|-------|
| `I18nManager` (React Native built-in) | N/A — RN built-in | MIT (RN) | Layout direction control |
| [i18next/i18next](https://github.com/i18next/i18next) | ~8,600 | MIT | Works in RN — no DOM dependency |
| `expo-localization` (Expo SDK) | Bundled in Expo | MIT | Locale/locale detection only |

### Assessment

`i18next` core runs in React Native without modification (it has no DOM dependency). The same
`i18next` instance and namespace structure used on web can be shared in the mobile package via
the monorepo's `shared` package. This satisfies the "single i18n core across web and mobile"
requirement.

For RTL layout direction, the React Native built-in `I18nManager` is the only mechanism — there
is no third-party alternative that replaces it.

**Known limitation (maps to CEO condition C-002):**
`I18nManager.forceRTL(true)` does not take effect at runtime without a full app reload. This is
a confirmed React Native platform constraint, not a bug fixable by library choice. The accepted
pattern is:
1. Detect language change.
2. If RTL state has changed, call `I18nManager.allowRTL(true)` + `I18nManager.forceRTL(true)`.
3. Call `Updates.reloadAsync()` (Expo Updates) to reload the JS bundle. Android applies cleanly;
   iOS requires the same reload and has historically had edge cases — test on both.

This means the first language switch to Arabic will cause a brief app reload. Users should be
warned with a confirmation dialog before the reload is triggered.

**VERDICT: ADOPT (i18next shared core) + BUILD (thin RN RTL reload wrapper)**

Adopt `i18next` shared from the web layer.
Build a small `RtlManager` service (~20 lines) in the mobile package that wraps the
`I18nManager` + `Updates.reloadAsync()` sequence — no library covers this gap.

```
npm install i18next react-i18next i18next-http-backend i18next-icu
# expo-localization is already in Expo SDK — no separate install
```

---

## 4. Arabic Fonts — Cairo and Noto Sans Arabic

### Candidates evaluated

| Package | Source | License | Format | Notes |
|---------|--------|---------|--------|-------|
| `@fontsource/cairo` | [fontsource/fontsource](https://github.com/fontsource/fontsource) | OFL-1.1 (SIL) | WOFF2 | Arabic + Latin, weights 200–900 |
| `@fontsource-variable/cairo` | Same monorepo | OFL-1.1 (SIL) | WOFF2 | Variable font variant |
| `@fontsource/noto-sans-arabic` | Same monorepo | OFL-1.1 (SIL) | WOFF2 | Arabic only |
| `@fontsource-variable/noto-sans-arabic` | Same monorepo | OFL-1.1 (SIL) | WOFF2 | Variable font variant |

The Fontsource monorepo (~3,400 stars) self-hosts Google Fonts as tree-shakeable npm packages.
Both fonts ship WOFF2 only (the modern standard). SIL Open Font License v1.1 is permissive —
no copyleft, commercial use allowed, no restrictions on embedding.

**VERDICT: ADOPT**
Use `@fontsource-variable/cairo` as the primary Arabic + Latin font (covers both scripts in one
family, variable weights eliminate multiple HTTP requests). Fall back to
`@fontsource/noto-sans-arabic` for characters Cairo does not cover.

```
npm install @fontsource-variable/cairo @fontsource/noto-sans-arabic
```

Load lazily: import the CSS only when `lang === 'ar'` to avoid burdening English-only sessions.

For React Native / Expo, use `expo-font` (built into Expo SDK) to load the font files directly
from the npm package assets — Fontsource ships the raw font files alongside the CSS.

---

## 5. Remote Translation Map Resolution

### Assessment

This concern asks whether a dedicated library is needed to take the Dataverse API response
(a flat or nested key-value map) and resolve it into i18next's resource format.

**No additional library is required.** `i18next-http-backend` supports a `parse(data, url, options)`
callback that receives the raw API response string and must return the key-value object i18next
expects. A thin adapter (< 20 lines) in the DFE backend service or the i18n initialisation module
can transform the Dataverse response shape into the standard flat namespace object.

If the Dataverse response changes shape frequently, `i18next-resources-to-backend` (official
i18next utility, ~200 stars — below threshold but maintained by the same team) can wrap an
async loader function, making the adapter cleaner. This is optional and can be added later
without breaking the initialisation contract.

**VERDICT: BUILD (thin adapter, ~15 lines)**
No library clears the 1,000-star threshold for this narrow concern. The adapter is trivial and
should live in `packages/shared/src/i18n/dataverseTranslationLoader.ts`.

---

## Summary of Decisions

| Concern | Decision | Package(s) |
|---------|----------|-----------|
| Web i18n runtime | ADOPT | `i18next`, `react-i18next`, `i18next-http-backend`, `i18next-icu` |
| Fluent UI v9 RTL | ADOPT (built-in) | `@fluentui/react-components` FluentProvider `dir` prop |
| React Native i18n | ADOPT (shared core) | `i18next`, `react-i18next` |
| React Native RTL | BUILD (wrapper) | `RtlManager` service using RN `I18nManager` + `expo-updates` |
| Arabic fonts (web) | ADOPT | `@fontsource-variable/cairo`, `@fontsource/noto-sans-arabic` |
| Arabic fonts (RN) | ADOPT | `expo-font` (SDK built-in) loading Fontsource assets |
| Remote translation loader | BUILD (adapter) | `dataverseTranslationLoader.ts` in `packages/shared` |

---

## Open risks to flag before implementation

1. **Fluent v9 Slider RTL bug (#33592)** — audit all form field components against the known RTL
   issue list before shipping. Some components may require CSS overrides.
2. **RN reload on first RTL switch** — UX must include a confirmation dialog. Warn the product
   team: Arabic cannot be the default language without ensuring the app launches with
   `I18nManager.forceRTL(true)` already set from a persisted preference, to avoid a reload on
   every cold start.
3. **i18next v26 keyPrefix type regression** — v26.3.1 fixes the regression from v26.3.0. Pin
   to `>=26.3.1` in package.json.
4. **Font loading flash** — lazy-import the Cairo CSS only on AR switch. A `font-display: swap`
   strategy is needed to avoid invisible text (FOIT) during the async font download.
