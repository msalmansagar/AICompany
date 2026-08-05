import type { CSSProperties } from 'react';

/**
 * Line-icon set matching the Reyada design.
 *
 * Inline SVG rather than an icon font: a CRM web resource cannot rely on an
 * external font host, and inline paths inherit `currentColor` so every icon
 * follows its badge/theme colour with no per-variant asset.
 *
 * Directional icons are listed in DIRECTIONAL and flip under RTL. Non-
 * directional icons (calendar, clock, pin) must NOT flip — mirroring a clock
 * face is a bug, not localisation.
 */

const PATHS: Record<string, string> = {
  grid: 'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z',
  services:
    'M10 3a7 7 0 105.29 11.71l4.5 4.5 1.42-1.42-4.5-4.5A7 7 0 0010 3zm0 2a5 5 0 110 10 5 5 0 010-10zM7 9h6M7 12h4',
  calendar:
    'M7 2v3M17 2v3M3.5 8.5h17M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3.5 2',
  pin: 'M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11zm0-8.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z',
  chevron: 'M9 5l7 7-7 7',
  doubleChevron: 'M13 5l-7 7 7 7M20 5l-7 7 7 7',
  help: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 14.5v.01M9.6 9.2a2.5 2.5 0 114.2 2.2c-.9.8-1.8 1.2-1.8 2.4',
  rocket:
    'M13.5 3.5c3.5 0 7 3.5 7 7 0 0-2.5 5.5-8 8l-3-3c2.5-5.5 8-8 8-8M4 20l3.5-1.2M4 20l1.2-3.5',
  headset: 'M4 13v-1a8 8 0 1116 0v1M4 13h2.5v6H5a1 1 0 01-1-1v-5zm16 0h-2.5v6H19a1 1 0 001-1v-5z',
  lock: 'M7 10V8a5 5 0 0110 0v2M5 10h14a1 1 0 011 1v9a1 1 0 01-1 1H5a1 1 0 01-1-1v-9a1 1 0 011-1z',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  check: 'M4 12.5l5 5 11-11',
  mail: 'M3 6h18v12H3V6zm0 .5l9 6.5 9-6.5',
  phone: 'M6 3h3l2 5-2.5 1.5a12 12 0 006 6L16 13l5 2v3a2 2 0 01-2 2A16 16 0 014 6a2 2 0 012-3z',
  users: 'M8 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-6 9a6 6 0 0112 0M17 11a3 3 0 100-6M22 20a5.5 5.5 0 00-4-5.3',
  award: 'M12 3a5 5 0 100 10 5 5 0 000-10zM8.5 12.5L7 21l5-2.5L17 21l-1.5-8.5',
  wrench: 'M15 3a5 5 0 00-4.6 7L3 17.4 6.6 21l7.4-7.4A5 5 0 0021 9l-3 3-3-3 3-3a5 5 0 00-3-3z',
  book: 'M4 4h7a2 2 0 012 2v14a2 2 0 00-2-2H4V4zm16 0h-7a2 2 0 00-2 2v14a2 2 0 012-2h7V4z',
  briefcase: 'M3 8h18v12H3V8zm6 0V6a2 2 0 012-2h2a2 2 0 012 2v2',
  // badge glyphs
  exhibition: 'M4 20V9M9 20V4M14 20v-7M19 20V6',
  matchmaking: 'M4 12l4-4 4 4-4 4-4-4zm8 0l4-4 4 4-4 4-4-4z',
  workshop: 'M4 4h16v11H4V4zm8 11v5m-4 0h8',
};

/** Icons whose meaning depends on reading direction. */
const DIRECTIONAL = new Set(['chevron', 'doubleChevron', 'services', 'rocket', 'external']);

interface IconProps {
  name: keyof typeof PATHS | string;
  size?: number;
  strokeWidth?: number;
  dir?: 'rtl' | 'ltr';
  style?: CSSProperties;
  className?: string;
}

export function Icon({ name, size = 16, strokeWidth = 1.7, dir = 'ltr', style, className }: IconProps) {
  const d = PATHS[name];
  if (!d) return null;

  const shouldFlip = dir === 'rtl' && DIRECTIONAL.has(name);

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, transform: shouldFlip ? 'scaleX(-1)' : undefined, ...style }}
    >
      <path d={d} />
    </svg>
  );
}

export default Icon;
