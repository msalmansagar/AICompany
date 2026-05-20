# GitHub Research Report — UI Design Engine
Date: 2026-05-17
Researcher: Maqsad AI — GitHub Researcher

## Category 1 — CSS Sanitiser
Decision: BUILD
Approach: postcss + postcss-safe-parser (MIT, 6M DL/wk, Oct 2024) + custom allowlist plugin
Rationale: postcss-sanitize abandoned (4 stars, 4yr old). DOMPurify is HTML not CSS.
Custom postcss pipeline is < 50 lines and directly satisfies CEO Condition 1.

## Category 2 — Stepper/Wizard
Decision: ADAPT + BUILD
Approach: react-use-wizard (663 stars, MIT) for logic hooks + custom Fluent UI step indicator
Rationale: No WCAG 2.1 AA compliant stepper meets 1000-star threshold without MUI dependency.

## Category 3 — Skeleton Loader
Decision: ADOPT (Fluent UI native Skeleton first; react-content-loader as fallback)
react-content-loader: 14k stars, MIT, Jan 2026, < 2kB, TypeScript 92.7%, React 18 confirmed
Architect to confirm if Fluent UI Skeleton is sufficient before adding new dependency.

## Category 4 — Design Token Runtime Injection
Decision: BUILD
Approach: Native CSS custom properties (document.documentElement.style.setProperty) +
Fluent UI createLightTheme/createDarkTheme (already installed, MIT)
TokiForge REJECTED: AGPL-3.0 license incompatible with commercial banking product.
