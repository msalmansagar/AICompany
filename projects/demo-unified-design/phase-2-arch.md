# Phase 2 — Architect: Architecture & Technology Stack
Date: 2026-03-29

## Architectural Mandate

The page must be a single, zero-dependency HTML file. No build pipeline, no package manager, no CDN at runtime. The architecture is therefore a layered CSS/JS monolith contained inside one `.html` file — but structured so that each concern (tokens, layout, components, animation, interaction) is clearly separated within that file.

## File Structure (within demo.html)

```
demo.html
  <head>
    <!-- 1. Design Token Layer      → CSS custom properties (variables) -->
    <!-- 2. Reset & Base Layer      → Normalise browser defaults -->
    <!-- 3. Typography Layer        → Font stack, scale, weights -->
    <!-- 4. Layout Layer            → Grid, spacing, container -->
    <!-- 5. Component Layer         → Cards, buttons, nav, inputs -->
    <!-- 6. Animation Layer         → Keyframes, transitions, spring curves -->
    <!-- 7. Responsive Layer        → Media queries (mobile-first) -->
  </head>
  <body>
    <!-- 8. Markup — semantic HTML5 sections -->
  </body>
  <script>
    <!-- 9. Interaction Layer       → Vanilla JS, no frameworks -->
  </script>
```

## Technology Decisions

### HTML
- HTML5 semantic elements: `<header>`, `<main>`, `<section>`, `<nav>`, `<article>`, `<footer>`
- ARIA roles and labels on interactive components
- No template engines

### CSS
- Pure CSS — no preprocessors, no PostCSS
- CSS Custom Properties (variables) for all design tokens
- CSS Grid + Flexbox for layout
- `backdrop-filter: blur()` for Fluent acrylic effect
- CSS `@keyframes` for animation
- `cubic-bezier` curves to approximate Apple spring easing
- `box-shadow` layers for Fluent depth system
- Media queries: 390px (mobile), 768px (tablet), 1024px (desktop), 1440px (wide)
- `:focus-visible` for keyboard accessibility

### JavaScript
- Vanilla ES6+ — no libraries, no frameworks
- Responsibilities:
  - Reveal highlight effect (mouse position tracking on Fluent cards)
  - Tab/navigation state switching
  - Scroll-triggered entrance animations (IntersectionObserver)
  - Bottom nav active state
  - Ripple effect on One UI buttons
  - Smooth accordion expand/collapse

### Font Strategy
- Primary stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif`
  - On Apple devices: renders SF Pro (HIG compliance)
  - On Windows: renders Segoe UI (Fluent compliance)
  - On Android/Samsung: renders Roboto/One UI system font
- Display headings: `"Segoe UI Display", -apple-system, BlinkMacSystemFont, sans-serif` at weight 700
- No web font downloads required — zero external requests

## Design Token Architecture

Three token namespaces, unified under a single `:root`:

```css
:root {
  /* === FLUENT TOKENS === */
  --fluent-acrylic-bg: rgba(255,255,255,0.72);
  --fluent-acrylic-blur: 20px;
  --fluent-reveal-color: rgba(255,255,255,0.15);
  --fluent-shadow-2:  0 2px 4px rgba(0,0,0,.12);
  --fluent-shadow-8:  0 8px 16px rgba(0,0,0,.14);
  --fluent-shadow-16: 0 16px 32px rgba(0,0,0,.18);
  --fluent-radius: 4px;

  /* === APPLE HIG TOKENS === */
  --hig-spacing-xs:  4px;
  --hig-spacing-sm:  8px;
  --hig-spacing-md: 16px;
  --hig-spacing-lg: 24px;
  --hig-spacing-xl: 48px;
  --hig-radius-sm:   8px;
  --hig-radius-md:  12px;
  --hig-radius-lg:  20px;
  --hig-easing: cubic-bezier(0.25, 0.46, 0.45, 0.94);  /* iOS spring approx */
  --hig-duration-fast: 200ms;
  --hig-duration-normal: 350ms;

  /* === ONE UI TOKENS === */
  --oneui-accent: #1259C3;          /* Samsung Blue */
  --oneui-accent-vivid: #2979FF;
  --oneui-accent-secondary: #00BCD4;
  --oneui-card-radius: 24px;
  --oneui-touch-target: 48px;
  --oneui-nav-height: 64px;
  --oneui-bold-weight: 700;
}
```

## Component Inventory

| Component | Design System Dominant | Notes |
|-----------|----------------------|-------|
| App Shell / Background | Fluent | Acrylic blur, layered depth |
| Hero Section | Apple HIG | Large type, whitespace, animation |
| Feature Cards | Fluent + One UI | Fluent reveal highlight + One UI bold radius |
| Navigation Bar (bottom) | One UI | Thumb zone, 64px height, large targets |
| Primary Button | One UI + Fluent | Vibrant fill + shadow depth |
| Secondary Button | Apple HIG | Ghost/outline, rounded, minimal |
| Typography Section | Apple HIG | Type scale showcase |
| Notification/Toast | Fluent | Acrylic, motion entry |
| Accordion / FAQ | Apple HIG | Smooth expand, generous spacing |
| Color Palette Display | All three | Token showcase section |
| Footer | Fluent | Subtle depth, thin divider |

## Rendering Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Body (Fluent depth layer — subtle gradient background)  │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Sticky Header (Fluent acrylic)                  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Hero (Apple HIG — large type, animation)        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐             │
│  │ Card     │  │ Card     │  │ Card     │  One UI bold │
│  │ Fluent   │  │ Fluent   │  │ Fluent   │  radius      │
│  │ reveal   │  │ reveal   │  │ reveal   │              │
│  └──────────┘  └──────────┘  └──────────┘             │
│                                                          │
│  [Typography | Buttons | Accordion | Colors — HIG]      │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Bottom Nav (One UI — thumb zone)                │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Performance Considerations

- Total page weight target: under 30KB unminified, under 15KB minified
- No HTTP requests after initial file load
- `backdrop-filter` guarded with `@supports` for graceful degradation
- Animations respect `prefers-reduced-motion` media query
- IntersectionObserver used for scroll effects (no scroll event listeners)

## Maintainability

- All visual decisions traceable to a CSS custom property
- Component CSS is grouped and commented by design system origin
- JS is written as self-contained IIFE modules, no global pollution
- Adding a new theme requires only changing `:root` token values

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| `backdrop-filter` not supported in older browsers | `@supports` fallback to solid background |
| Three design systems visually clash | Architect mandates a "harmony layer" — shared spacing scale and radius progression prevent jarring transitions |
| Font rendering differs across OS | System font stack chosen precisely because each OS will render its own native font |
| Touch targets inadequate on real devices | All interactive elements enforce `min-height: var(--oneui-touch-target)` |
