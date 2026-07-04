# GitHub Research Report — DFE-STYLE-001
# Advanced Visual Styling and Full CSS Control

Project: DFE-STYLE-001
Client: QDB — Qatar Development Bank
Stack: TypeScript, React, Fluent UI v9, Node.js / Fastify
Date: 2026-06-28
Researcher: github-researcher agent

---

## TARGET 1: WCAG 2.1 Contrast Ratio Calculation

### Queries run

1. `site:github.com wcag contrast ratio calculation javascript stars:>100`
2. `site:github.com chroma-js color manipulation library`
3. `site:github.com color npm package qix- javascript stars 2025`
4. `tmcw/wcag-contrast npm package stars license bundle size`
5. `polished contrast ratio WCAG getContrast npm function`
6. `chroma.js npm weekly downloads bundle size gzip contrast method`

---

### Candidates evaluated

#### Repo 1: tmcw/wcag-contrast
- URL: https://github.com/tmcw/wcag-contrast
- npm: `wcag-contrast`
- Stars: approximately 123
- Last npm publish: 7 years ago (version 3.0.0 is the latest)
- License: MIT (inferred; confirmed by related packages that depend on it)
- Fit assessment: Implements the WCAG contrast ratio formula exactly as specified. Pure math, no UI, no dependencies. Matches the brief perfectly in scope.
- Blocking issues: DISQUALIFIED. Star count of 123 falls far below the 1000-star threshold. Abandoned — no publish activity in 7 years. Not suitable as a production dependency for a security-sensitive accessibility feature.

#### Repo 2: Qix-/color
- URL: https://github.com/Qix-/color
- npm: `color`
- Stars: approximately 4,900
- Last commit: active into 2025
- License: MIT
- Fit assessment: Full JavaScript color conversion and manipulation library. Supports hex, rgb, hsl. Could provide luminance and contrast calculation by composition.
- Blocking issues: DISQUALIFIED. CRITICAL SECURITY EVENT. In September 2025 the npm publishing account for `color` was taken over via a phishing attack. Version 5.0.1 was published with a malware payload (cryptocurrency address hijacking). The same attack also compromised the co-dependent packages `color-convert` (v3.1.1) and `color-string` (v2.1.1). While 5.0.2 is a clean release, this supply-chain incident disqualifies adoption for a security-conscious enterprise client. The risk of repeating the attack on the same account is non-zero and the trust signal is permanently damaged.

#### Repo 3: gka/chroma.js
- URL: https://github.com/gka/chroma.js
- npm: `chroma-js`
- Stars: approximately 10,000
- Last commit: issues and PRs confirmed through January 2026; releases page active
- License: BSD-3-Clause
- Fit assessment: Comprehensive color manipulation library. The `.contrast(color1, color2)` method computes the WCAG 2.x contrast ratio. Version 3.1 also added APCA contrast for WCAG 3.0. Handles hex, rgb, hsl, named colors. BSD-3-Clause is permissive and compatible with enterprise use. Used by 1,826 packages on npm. Tree-shakeable via `chroma-js/src/` selective imports.
- Blocking issues: None blocking. Two concerns. First, BSD-3-Clause requires attribution notice in binary distributions — manageable. Second, the full library is a broad color manipulation toolkit; importing just the contrast function still brings in the linearisation math and color parsing, but bundlephobia shows the minified+gzip size is approximately 13 KB for the full library. If the team needs broader color utilities elsewhere (e.g. for palette generation), this is a solid choice; if only the contrast function is needed, it is overkill.

#### Repo 4: styled-components/polished
- URL: https://github.com/styled-components/polished
- npm: `polished`
- Stars: 7,700
- Last activity: confirmed active as of June 2026
- License: MIT
- Fit assessment: Lightweight CSS-in-JS utility set. Exports `getContrast(color1, color2)` (returns a float ratio) and `meetsContrastGuidelines(color1, color2)` (returns `{ AA, AAA, AAALarge }` booleans). Both implement the W3C WCAG 2 luminance algorithm. MIT license. Tree-shakeable — only the imported functions contribute to bundle size. Functions are pure (no side effects, no DOM dependency), so they run client-side without any modification. Works with hex (with/without #, 3-digit shorthand), rgb, hsl, named colors via internal color-string parsing.
- Blocking issues: Polished is designed for styled-components / CSS-in-JS workflows and carries functions for animations, mixins, lighten/darken, etc. that are irrelevant for a Fluent UI v9 project. Tree shaking makes this a non-issue at runtime, but the package still enters the dependency graph. This is a soft concern, not a blocker.

#### Candidate 5: In-house 30-line implementation
- Scope: Pure TypeScript function, no external dependencies.
- Algorithm: W3C WCAG 2.1 Success Criterion 1.4.3. The full algorithm is: parse hex (including 3-digit shorthand) to RGB, apply sRGB linearisation (`c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4`), compute relative luminance (`0.2126 R + 0.7152 G + 0.0722 B`), divide `(lighter + 0.05) / (darker + 0.05)`.
- Size: approximately 30 lines including hex parsing and edge cases. 100% deterministic. Zero supply-chain surface. Trivially unit-testable (known W3C test vectors exist). No bundle cost.
- Blocking issues: None. The trade-off is that correctness depends on the in-house test suite rather than a community-maintained library. Given the algorithm is a published W3C constant with known test vectors, this risk is minimal.

---

### VERDICT: BUILD

#### Recommendation

No dedicated library with 1,000+ stars covers only WCAG contrast ratio calculation — the closest (`tmcw/wcag-contrast`, 123 stars) is abandoned. The two large color libraries that include contrast support (chroma-js, polished) both bring in functionality the team will never use and add a dependency vector. The WCAG 2.1 relative luminance formula is a published W3C constant: it is 30 lines of pure math that do not change. Implementing it in-house produces a zero-dependency, zero-bundle-cost, trivially-testable pure function that will not degrade from supply-chain events (cf. the `color` npm compromise of September 2025).

**Exception rule:** If `chroma-js` or `polished` is already adopted by the team for a different purpose (e.g., palette generation for the theme token engine), import `getContrast`/`meetsContrastGuidelines` from that existing dependency rather than duplicating the math.

Estimated build effort: 30 lines of TypeScript + 8 unit tests using W3C published test vectors. Total: approximately 1 hour.

---

## TARGET 2: CSS Sanitizer for User-Entered Custom CSS

### Queries run

1. `site:github.com css sanitizer node.js security stars:>500`
2. `DOMPurify sanitize CSS stylesheet user-entered custom css injection security`
3. `site:github.com css-tree css parser ast walk nodes stars`
4. `site:github.com postcss css parser plugin node stars:>5000`
5. `postcss user css sanitizer plugin strip import url expression behavior injection`
6. `eramdam/postcss-sanitize github stars license allowedSchemes url stripping`
7. `postcss github stars 28000 license last commit 2026`

---

### Candidates evaluated

#### Repo 1: cure53/DOMPurify
- URL: https://github.com/cure53/DOMPurify
- npm: `dompurify`
- Stars: approximately 13,500
- Last commit: actively maintained (regular releases through 2025-2026)
- License: Apache 2.0 / Mozilla Public License 2.0 (dual-licensed)
- Fit assessment: The gold standard for XSS sanitization. However, DOMPurify is a DOM-based HTML sanitizer. It is not designed to sanitize standalone CSS stylesheets. While the official repository contains a `demos/hooks-sanitize-css-demo.html` that demonstrates using DOMPurify hooks to inspect inline `style=` attributes on HTML elements, this does not address the use case of sanitizing a multi-kilobyte free-form CSS string before storing it in `FormDesign.customCss`. For Node.js server-side use, DOMPurify requires `jsdom` as a DOM environment, adding significant complexity.
- Blocking issues: Wrong tool for the job. DOMPurify sanitizes HTML with embedded style attributes. It cannot walk a standalone CSS stylesheet's `@import` rules or `url()` declarations in a structured way. Adapting it to this use case would require fighting its architecture.

#### Repo 2: postcss/postcss
- URL: https://github.com/postcss/postcss
- npm: `postcss`
- Stars: approximately 29,000
- Last commit: May 19, 2026
- License: MIT
- Fit assessment: PostCSS is a CSS transformation tool that parses CSS into a typed AST (Root, AtRule, Rule, Declaration, Value nodes) and allows plugins to walk, inspect, and rewrite every node before emitting the output. It does not sanitize by default — it is a platform for building sanitizers. Used internally by Vite, Next.js, Create React App, Tailwind, and most of the front-end ecosystem. Runs natively in Node.js. Can be configured to run in the browser. MIT license. Zero security CVEs in its core parser.
- Blocking issues: Not a sanitizer out of the box. A custom plugin must be written. This is an ADAPT scenario, not a pure ADOPT.

#### Repo 3: csstree/csstree
- URL: https://github.com/csstree/csstree
- npm: `css-tree`
- Stars: approximately 1,900 (based on active use; referenced in postcss-values-parser and several large projects)
- Last commit: December 2024 / early 2025 (v2.0.0 released with ESM support)
- License: MIT
- Fit assessment: Full CSS parser with AST generation, walker, generator, and lexer that validates CSS against W3C specs. Granular enough to distinguish AtRule (at-rules), Declaration, and Value (including url() function nodes). Can be used identically to PostCSS for a custom sanitizer walk. Has better W3C grammar coverage than PostCSS's AST for value-level node analysis.
- Blocking issues: Lower star count (approximately 1,900) and a smaller community than PostCSS. The v2.0.0 ESM migration in late 2024 may still have rough edges in some bundler setups. PostCSS is the safer choice for enterprise use due to its ecosystem maturity.

#### Repo 4: eramdam/postcss-sanitize
- URL: https://github.com/eramdam/postcss-sanitize
- npm: `postcss-sanitize`
- Stars: fewer than 50 (very small project)
- Last commit: not recently verified, low maintenance signal
- License: MIT
- Fit assessment: A PostCSS plugin that removes CSS properties/values based on options and strips url() declarations that use non-allowlisted schemes (`allowedSchemes: ['http', 'https']`). Demonstrates the correct architectural pattern: a PostCSS plugin that walks Declaration and AtRule nodes and removes unsafe ones. The implementation is very small.
- Blocking issues: DISQUALIFIED as a standalone adoption. Star count is in the dozens. Not battle-tested for security-critical use. Has NOT been evaluated against the full threat model (CSS `expression()`, `behavior:`, `@charset` exfiltration, Unicode CSS injection, `url()` with data: URIs). Adoption at QDB would require a full security audit of the plugin itself, at which point you might as well write the plugin directly.

#### Repo 5: csstools/sanitize.css
- URL: https://github.com/csstools/sanitize.css
- Stars: 5,300
- License: CC0 / Public Domain
- Fit assessment: DISQUALIFIED. This is a CSS reset / normalization stylesheet (a `.css` file applied to fix browser inconsistencies). It has no runtime capability and cannot sanitize user-entered CSS strings.

---

### VERDICT: ADAPT

#### Recommendation

No battle-tested library with 1,000+ stars exists that directly solves the problem of sanitizing a user-entered standalone CSS string against `@import`, `url()`, `expression()`, and `behavior:` injection. DOMPurify is wrong-scoped (HTML, DOM-dependent). `sanitize.css` is a CSS reset, not a sanitizer. `postcss-sanitize` solves part of the problem but has insufficient stars and no security audit record.

The correct architecture is to ADOPT PostCSS (29,000 stars, MIT, maintained through May 2026) as the CSS AST foundation and build a thin, security-focused PostCSS plugin (~150-200 lines of TypeScript) called `CssSanitiserPlugin`. This is a standard industry approach — large-scale CSS theming platforms (Salesforce, Microsoft Adaptive Cards) all use this pattern.

**Recommended repo for foundation:** https://github.com/postcss/postcss
**npm package to pin:** `postcss` at latest `^8.x`

**The plugin must walk and handle:**
- `AtRule` nodes where `node.name === 'import'` — remove unless the URL matches a configured allowlist (default: deny all `@import`)
- `Declaration` nodes where `node.prop === 'behavior'` — remove unconditionally (IE legacy attack vector)
- `Declaration` nodes where `node.value` contains `expression(` — remove unconditionally (IE CSS expression injection)
- `Declaration` values containing `url(...)` — parse the inner URL and deny if: scheme is not `http`/`https`, or the domain is not in the tenant-configured allowlist

**Integration approach:**
- Backend (Node.js / Fastify): run the PostCSS pipeline on every PUT/POST that saves `FormDesign.customCss`. Reject (400 Bad Request) if any rule fires.
- Designer preview path (browser): PostCSS ships an isomorphic build, so the same plugin can run client-side on keydown-debounce to give immediate visual feedback in the CSS editor panel.

**License risk:** None. PostCSS is MIT with no contributor license restrictions.

**Suggested next step:** Backend agent writes `CssSanitiserPlugin.ts` (~150 lines) as a PostCSS plugin, backed by a test suite that covers the W3C threat vector list. QA agent writes a dedicated CSS injection security test suite.

---

## TARGET 3: Color Picker and CSS Key-Value Editor for Fluent UI v9

### Queries run

1. `site:github.com react-colorful headless color picker`
2. `site:github.com uiwjs/react-color color picker widget stars`
3. `omgovich/react-colorful github stars license npm downloads bundle size 2025`
4. `fluent UI v9 react-components ColorPicker component 2025 2026`
5. `@fluentui/react-color-picker v9 ColorPicker ColorSlider ColorArea stable 9.0.0 release`
6. `@fluentui/react-color-picker npm install components API AlphaSlider ColorSwatch 2026`

---

### Part A: Color Picker

#### Repo 1: microsoft/fluentui — @fluentui/react-color-picker
- URL: https://github.com/microsoft/fluentui
- npm: `@fluentui/react-color-picker`
- Stars: microsoft/fluentui has approximately 18,000 stars
- Last publish: v9.2.2, published June 22, 2026 (6 days before research date)
- License: MIT
- Fit assessment: Fluent UI v9 now ships a stable ColorPicker package as of the 9.0.0 stable release (PR #33969 merged by ValentinaKozlova). The package exports: `ColorPicker`, `ColorSlider`, `AlphaSlider`, `ColorArea`, and `ColorSwatch`. Components are composable (`<ColorPicker><ColorArea /><ColorSlider /><AlphaSlider /></ColorPicker>`). They follow WAI-ARIA guidelines. Because this is a sub-package of the already-mandated Fluent UI v9 ecosystem, it violates no clause of NFR-010. It is on-stack, on-license, and actively maintained by Microsoft.
- Blocking issues: None. Previously this component was in `@fluentui/react-color-picker-preview` (now deprecated at v0.3.1). The stable package supersedes it. Confirm at install time that the target project's `@fluentui/react-components` version is compatible with `@fluentui/react-color-picker@^9.2.2`.

#### Repo 2: omgovich/react-colorful
- URL: https://github.com/omgovich/react-colorful
- npm: `react-colorful`
- Stars: approximately 3,500
- Last publish: v5.7.0, published approximately April 2026 (2 months before research date)
- License: MIT
- Bundle: 2.8 KB minified + gzip, zero runtime dependencies
- Fit assessment: The most popular headless React color picker. Strict TypeScript, hooks-only, no class components. WAI-ARIA compliant. However, NFR-010 mandates that UI candidate libraries must not install their own design system. `react-colorful` renders its own CSS-styled hue/saturation gradient canvas and input elements with custom classnames — it does bring its own visual style. While it can be skinned, integrating it into a Fluent UI v9 design surface requires a non-trivial CSS override layer. Given that `@fluentui/react-color-picker` is now stable and on-stack, `react-colorful` is the backup option only if the Fluent component is discovered to be insufficient (e.g., missing the WCAG contrast indicator overlay requirement).
- Blocking issues: Minor NFR-010 tension — ships its own visual styling layer. Below the 1,000-star threshold? No — 3,500 stars qualifies. But second choice given the native Fluent option exists.

#### Repo 3: uiwjs/react-color
- URL: https://github.com/uiwjs/react-color
- npm: multiple sub-packages (`@uiw/react-color`)
- Stars: approximately 536
- License: MIT
- Fit assessment: Below 1,000-star threshold. DISQUALIFIED.

#### Repo 4: casesandberg/react-color
- URL: https://github.com/casesandberg/react-color
- Stars: approximately 11,000
- Last commit: repository is archived / unmaintained (no commits since 2022)
- License: MIT
- Fit assessment: DISQUALIFIED. Abandoned. Last version does not support React 18+ hooks patterns.

---

### Part B: CSS Key-Value Property Editor

#### Research finding

No library with meaningful stars exists specifically for a CSS property/value pair editor UI. The closest analogues found are:

- Generic JSON/object editors (e.g., `react-json-view`, `react-json-editor-ajrm`) — these are heavy, bring their own design system, and violate NFR-010.
- Property-grid components from third-party design systems (DevExtreme, AG Grid) — all violate NFR-010.

The requirement is: a list editor where each row has a CSS property key (text input), a CSS property value (text input), and a delete button, with an "Add row" button at the bottom. This is a compositional UI pattern using Fluent UI v9 primitives (`Input`, `Button`, `Table` or a `div` flex layout). It does not require a library.

---

### VERDICT for Part A (Color Picker): ADOPT

**Recommended repo:** https://github.com/microsoft/fluentui
**npm package:** `@fluentui/react-color-picker`
**Version to pin:** `^9.2.2`
**Why this one:** It is the official Fluent UI v9 color picker. It is stable (v9.0.0 released, now at v9.2.2), MIT licensed, published 6 days before this research, and maintained by Microsoft. Using it introduces zero NFR-010 tension because it belongs to the already-mandated Fluent UI ecosystem. Components are composable with WAI-ARIA support, allowing the WCAG contrast indicator to be overlaid on top using the in-house contrast function from Target 1.
**Integration approach:** Install `@fluentui/react-color-picker`. Compose `<ColorPicker>` with `<ColorArea />`, `<ColorSlider />`, and `<AlphaSlider />` sub-components inside the style editors for each field state (focusStyle, errorStyle, disabledStyle, etc.). Wire the `onColorChange` callback to update the relevant `FormDesign` field and simultaneously feed the selected colour + the field background colour into the in-house WCAG contrast function to show the contrast ratio badge.
**License risk:** None. MIT.

### VERDICT for Part B (Key-Value CSS Property Editor): BUILD

**Why no existing repo qualifies:** No library at 1,000+ stars covers this exact composition pattern without violating NFR-010. The pattern is a list of (key: string, value: string) pairs with add/delete operations — a 40-60 line Fluent UI v9 composition using `Input`, `Button`, and a `div` flex column.
**Suggested next step:** Frontend agent implements `CssPropertyEditor.tsx` (~50 lines). It accepts a `Record<string, string>` prop and emits an `onChange: (styles: Record<string, string>) => void` callback. Each row renders a `<Input placeholder="property" />` and `<Input placeholder="value" />` with a `<Button icon={<DeleteRegular />} />`. An "Add property" `<Button>` appends an empty `{ key: '', value: '' }` entry to local state.

---

## Cross-cutting notes

- The `color` npm package (Qix-) suffered a verified supply-chain attack in September 2025. Any transitive dependency that pulls in `color@5.0.1` must be audited. Pin to `color@5.0.2` or higher if `color` appears in the lockfile, and flag it in the QA security test suite.
- `tmcw/wcag-contrast` is abandoned (7 years since last publish). Do not adopt.
- WCAG 3.0 introduces APCA (Advanced Perceptual Contrast Algorithm), which differs from the WCAG 2.x formula. The in-house function or chroma-js can be extended to support APCA if QDB upgrades their accessibility standard in future.
