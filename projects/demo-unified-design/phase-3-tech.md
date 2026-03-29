# Phase 3 — Frontend: UI Design Specification
Date: 2026-03-29

## Design Philosophy: The Harmony Principle

Three design systems share more common ground than they have differences:
- All three value clarity and purposeful hierarchy
- All three use whitespace as a first-class design element
- All three have evolved toward rounded corners, soft shadows, and motion

The unified design amplifies these shared values while letting each system contribute its distinctive signature:

| Contribution | System | Signature Element |
|---|---|---|
| Environmental context | Fluent | Materials (acrylic), light/reveal, depth layers |
| Typographic elegance | Apple HIG | Scale, weight contrast, generous line-height |
| Tactile confidence | One UI | Bold cards, vibrant color, thumb navigation |

---

## Color System

### Palette

```
Background layers (Fluent depth):
  Layer 0 (deepest):  #F3F2F1  — page background
  Layer 1:            #FFFFFF  — card surface
  Layer 2 (elevated): rgba(255,255,255,0.85) + blur — acrylic panels
  Layer 3 (highest):  #FFFFFF  — modal / toast

One UI Accent Family:
  Primary:    #1259C3  (Samsung Blue — bold, trustworthy)
  Vivid:      #2979FF  (interactive states, links)
  Secondary:  #00BCD4  (teal — supporting accent)
  Danger:     #E53935
  Success:    #43A047

Apple HIG Semantic:
  Text Primary:    #1D1D1F
  Text Secondary:  #6E6E73
  Text Tertiary:   #AEAEB2
  Divider:         rgba(0,0,0,0.08)
```

### Dark Mode Tokens (bonus — CSS variables swap automatically)
```css
@media (prefers-color-scheme: dark) {
  Layer 0:  #1C1C1E
  Layer 1:  #2C2C2E
  Acrylic:  rgba(30,30,30,0.82)
  Text:     #F2F2F7
}
```

---

## Typography Scale (Apple HIG)

| Role | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| Display | 56px | 700 | 1.05 | Hero heading |
| Title 1 | 40px | 700 | 1.1 | Section headings |
| Title 2 | 28px | 600 | 1.2 | Card headings |
| Title 3 | 22px | 600 | 1.3 | Sub-headings |
| Body | 17px | 400 | 1.6 | Body text |
| Callout | 16px | 400 | 1.5 | Supporting text |
| Caption | 12px | 400 | 1.4 | Labels, captions |

Letter spacing: Display and Title 1 use `-0.02em` (Apple HIG tight tracking on large type).
Body uses `0` tracking.

---

## Spacing Scale (Apple HIG base, extended)

4 — 8 — 12 — 16 — 24 — 32 — 48 — 64 — 96

All spacing uses multiples of 4. No odd values anywhere in the layout.

---

## Component Specifications

### 1. Sticky Header (Fluent Acrylic)

- Height: 56px desktop, 48px mobile
- Background: `rgba(255,255,255,0.72)` + `backdrop-filter: blur(20px) saturate(180%)`
- Border-bottom: `1px solid rgba(255,255,255,0.3)`
- Shadow: `var(--fluent-shadow-2)` (subtle — header is already elevated visually)
- Logo: bold 700 weight, `#1259C3` color (One UI accent)
- Nav links: 15px, weight 500, `#1D1D1F`, underline on `:hover` + color shift to accent
- Transition: `backdrop-filter` fades in on scroll > 20px (JS-driven class add)

### 2. Hero Section (Apple HIG)

- Padding: 96px top, 64px bottom (generous whitespace — HIG principle)
- Heading: Display size (56px), weight 700, color `#1D1D1F`, letter-spacing `-0.02em`
- Sub-heading: Title 3 (22px), weight 400, color `#6E6E73`, max-width 560px
- CTA buttons: stacked row — Primary (One UI filled) + Secondary (HIG ghost)
- Entrance animation: hero text slides up 24px and fades in — `cubic-bezier(0.25,0.46,0.45,0.94)` 500ms
- Background: subtle radial gradient from `#E8F0FE` (blue tint) to `#F3F2F1` (Fluent layer 0)

### 3. Feature Cards (Fluent + One UI)

Grid: 3 columns desktop, 2 tablet, 1 mobile
Card anatomy:
- Background: `#FFFFFF`
- Border-radius: `var(--oneui-card-radius)` = 24px (One UI bold)
- Shadow: `var(--fluent-shadow-8)` at rest → `var(--fluent-shadow-16)` on hover
- Padding: 28px
- Icon: 48px × 48px rounded square (One UI style), filled with accent tint background
- Title: Title 2 (28px), weight 600
- Body: Body (17px), `#6E6E73`
- Hover state:
  - Shadow elevation increase (Fluent depth)
  - Reveal highlight: radial gradient follows mouse cursor (JS) — `rgba(255,255,255,0.15)` brush
  - Card lifts: `transform: translateY(-4px)` with `var(--hig-easing)` 200ms
- Touch: `:active` pushes card down 2px (tactile One UI response)

### 4. Primary Button (One UI + Fluent)

- Height: 48px (One UI minimum touch target)
- Padding: 0 24px
- Background: `var(--oneui-accent)` `#1259C3`
- Border-radius: `var(--hig-radius-md)` 12px (Apple rounded feel on a One UI button)
- Shadow: `var(--fluent-shadow-8)` (Fluent depth on a component)
- Typography: 16px, weight 600, white
- Hover: background lightens to `#2979FF`, shadow deepens
- Active: background darkens, shadow reduces — tactile depression
- Ripple: JS-driven `::after` pseudo expanding circle (One UI / Material pattern)
- Focus-visible: `outline: 2px solid #2979FF; outline-offset: 2px`

### 5. Secondary Button (Apple HIG)

- Height: 48px
- Padding: 0 24px
- Background: transparent
- Border: `1.5px solid rgba(0,0,0,0.15)`
- Border-radius: 12px
- Color: `#1D1D1F`
- Hover: background `rgba(0,0,0,0.04)`, border darkens
- No shadow (HIG minimal principle — secondary actions stay flat)

### 6. Bottom Navigation (One UI)

- Fixed to bottom of viewport on mobile (≤ 768px)
- Height: 64px (`--oneui-nav-height`)
- Background: `rgba(255,255,255,0.92)` + `backdrop-filter: blur(16px)` (Fluent acrylic in nav)
- Border-top: `1px solid rgba(0,0,0,0.06)`
- 4 nav items, evenly distributed
- Each item: icon (24px) + label (11px) stacked, total touch zone = 64px × full-width/4
- Active item: icon + label in `--oneui-accent`, `font-weight: 700`
- Inactive: `#AEAEB2`
- Active indicator: 3px rounded pill above icon, `--oneui-accent` background (One UI style)
- Transition: color + indicator animate with `--hig-easing`

On desktop (> 768px): nav items move into the sticky header as horizontal links.

### 7. Typography Showcase Section (Apple HIG)

- Background: pure white
- Displays the full type scale visually
- Each size shown with its role label in caption style
- Generous vertical rhythm — 32px between each row
- Thin 1px dividers between rows (HIG divider color)

### 8. Accordion / FAQ (Apple HIG)

- Container: white background, subtle border `1px solid rgba(0,0,0,0.08)`
- Border-radius: `--hig-radius-lg` (20px)
- Each item: 56px collapsed height, padding 0 24px
- Chevron icon rotates 180° on expand (smooth, HIG easing)
- Content: smooth `max-height` transition from 0 to auto (calculated in JS)
- Typography: question in weight 600, answer in weight 400 with 1.6 line-height
- No hard borders between items — only a thin `rgba(0,0,0,0.06)` line

### 9. Notification Toast (Fluent)

- Triggered by "Show notification" button
- Slides in from top-right (desktop) / bottom (mobile)
- Background: acrylic — `rgba(255,255,255,0.85)` + blur
- Border: `1px solid rgba(255,255,255,0.5)`
- Border-radius: 8px (Fluent tighter radius)
- Shadow: `--fluent-shadow-16`
- Content: icon + title + body text
- Auto-dismisses after 4 seconds with fade-out
- Entry: `translateX(110%)` → `translateX(0)` ease-out 250ms
- Exit: opacity 1 → 0, translateY(-8px) 200ms

### 10. Color Palette Section

- Displays all design tokens visually as swatches
- Three rows, each labeled for their design system
- Swatch: 64px circle, shadow, tooltip on hover showing hex value
- Section heading: Title 1 with accent underline decoration

---

## Motion Principles

### Entry Animations (Apple HIG)
- All sections fade in + translate up 20px on scroll into view
- IntersectionObserver triggers, threshold: 0.15
- Staggered: 60ms delay between siblings

### Hover Transitions (Fluent)
- All interactive surfaces: `transition: box-shadow 200ms, transform 200ms, background 150ms`
- Reveal highlight: smooth radial gradient repositioning on `mousemove`

### Interaction Feedback (One UI)
- Button active: `transform: scale(0.97)` for press tactility
- Ripple: expanding circle on click, 400ms, `rgba(255,255,255,0.3)` overlay
- Nav active: 150ms color + indicator transition

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  /* All animations removed, transitions shortened to 0ms */
}
```

---

## Responsive Behaviour

| Breakpoint | Layout changes |
|---|---|
| 390px mobile | 1-col grid, bottom nav visible, hero type scales down to 40px |
| 768px tablet | 2-col grid, bottom nav hidden, header nav appears |
| 1024px desktop | 3-col grid, wider hero, max-width container kicks in |
| 1440px wide | Container capped at 1200px, centered |

---

## Sections (Page Flow)

1. Header (sticky, Fluent acrylic)
2. Hero — "One Interface, Three Design Languages"
3. Design Principles Cards (3 cards, one per system)
4. Interactive Features Grid (6 cards demonstrating specific patterns)
5. Typography Scale Showcase
6. Button & Controls Gallery
7. Accordion FAQ — "How does the unified design work?"
8. Color Palette & Token Reference
9. Footer
10. Bottom Navigation (mobile only, fixed)
