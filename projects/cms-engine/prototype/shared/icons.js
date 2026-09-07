/* =====================================================================
   Inline SVG icons.

   Inline rather than an icon font: a Dataverse web resource cannot rely on
   an external font host, and `currentColor` means one path serves every
   context without a per-variant asset.
   ===================================================================== */

const ICON_PATHS = {
  grid:      "M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z",
  pages:     "M6 2h8l4 4v16H6V2zm8 0v4h4M9 12h6M9 16h6",
  design:    "M12 3l9 5v8l-9 5-9-5V8l9-5zm0 0v18M3 8l9 5 9-5",
  media:     "M3 5h18v14H3V5zm0 10l5-5 4 4 3-3 6 6M8.5 9.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z",
  palette:   "M12 3a9 9 0 100 18h1.5a2 2 0 001.4-3.4 2 2 0 011.4-3.4H18a3 3 0 003-3A9 9 0 0012 3zM7.5 12.5v.01M9.5 8.5v.01M14 7.5v.01",
  structure: "M12 3v4M6 21v-4M18 21v-4M6 17h12M12 7v10M9 3h6v4H9V3zM3 17h6v4H3v-4zm12 0h6v4h-6v-4z",
  shield:    "M12 3l8 3v6c0 5-3.4 8.2-8 9-4.6-.8-8-4-8-9V6l8-3zm-2.5 9l2 2 4-4",
  globe:     "M12 3a9 9 0 100 18 9 9 0 000-18zm0 0c2.5 2.4 3.8 5.4 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.4-3.8-9S9.5 5.4 12 3zM3.5 9h17M3.5 15h17",
  clock:     "M12 3a9 9 0 100 18 9 9 0 000-18zm0 4v5l3.5 2",
  plus:      "M12 5v14M5 12h14",
  search:    "M11 4a7 7 0 105.3 11.7l4.2 4.2 1.4-1.4-4.2-4.2A7 7 0 0011 4z",
  filter:    "M3 5h18l-7 8v6l-4 2v-8L3 5z",
  save:      "M5 3h11l3 3v15H5V3zm3 0v6h8V3M8 21v-7h8v7",
  publish:   "M12 3a9 9 0 100 18 9 9 0 000-18zM3.5 9h17M3.5 15h17M12 3c2.5 2.4 3.8 5.4 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.4-3.8-9S9.5 5.4 12 3z",
  eye:       "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7zm10 3a3 3 0 100-6 3 3 0 000 6z",
  edit:      "M4 20h4l10-10-4-4L4 16v4zm10-14l4 4",
  trash:     "M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13",
  chevron:   "M9 5l7 7-7 7",
  drag:      "M9 5h.01M9 12h.01M9 19h.01M15 5h.01M15 12h.01M15 19h.01",
  check:     "M4 12.5l5 5 11-11",
  alert:     "M12 3l9 17H3l9-17zm0 6v5m0 3v.01",
  info:      "M12 3a9 9 0 100 18 9 9 0 000-18zm0 5v.01M12 11v6",
  user:      "M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0",
  history:   "M3 12a9 9 0 109-9 9 9 0 00-7 3.4M3 4v4h4M12 7v5l3.5 2",
  text:      "M5 5h14M5 12h14M5 19h9",
  heading:   "M6 4v16M18 4v16M6 12h12",
  button:    "M3 8h18v8H3V8zm5 4h8",
  image:     "M3 5h18v14H3V5zm3 9l4-4 3 3 2-2 4 4",
  columns:   "M3 4h6v16H3V4zm12 0h6v16h-6V4z",
  section:   "M3 4h18v6H3V4zm0 10h18v6H3v-6z",
  stat:      "M4 20V9M9 20V4M14 20v-7M19 20V6",
  wrench:    "M15 3a5 5 0 00-4.6 7L3 17.4 6.6 21l7.4-7.4A5 5 0 0021 9l-3 3-3-3 3-3a5 5 0 00-3-3z",
  upload:    "M12 16V4m0 0L8 8m4-4l4 4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2",
  award: "M12 3a5 5 0 100 10 5 5 0 000-10zM8.5 12.5L7 21l5-2.5L17 21l-1.5-8.5",
  briefcase: "M3 8h18v12H3V8zm6 0V6a2 2 0 012-2h2a2 2 0 012 2v2",
  book: "M4 4h7a2 2 0 012 2v14a2 2 0 00-2-2H4V4zm16 0h-7a2 2 0 00-2 2v14a2 2 0 012-2h7V4z",
  "qdb-falcon": "M4 14l8-9 8 9-5-1-3 6-3-6-5 1zM12 5v14",
  "reyada-mark": "M12 3l2.6 5.6L21 9.6l-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.4-1z",
  "qatar-vision": "M12 3a9 9 0 100 18 9 9 0 000-18zm0 4.5l1.6 3.4 3.7.5-2.7 2.6.7 3.7L12 16l-3.3 1.7.7-3.7L6.7 11.4l3.7-.5z",
  "sme-badge": "M12 3l7 3v6c0 4.4-2.9 7.3-7 8-4.1-.7-7-3.6-7-8V6l7-3zm-3 8.5l2 2 4-4",
  calendar: "M7 2v3M17 2v3M3.5 8.5h17M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
  pin: "M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11zm0-8.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z",
  users: "M8 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-6 9a6 6 0 0112 0M17 11a3 3 0 100-6M22 20a5.5 5.5 0 00-4-5.3",
  external: "M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5",
  moon:      "M20 14a8 8 0 11-9.9-9.9A7 7 0 0020 14z",
  sun:       "M12 5V3m0 18v-2m7-7h2M3 12h2m12.7-5.7l1.4-1.4M4.9 19.1l1.4-1.4m0-11.4L4.9 4.9m14.2 14.2l-1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
};

/** Renders an icon. `size` in px; colour follows `currentColor`. */
function icon(name, size = 18, extra = "") {
  const d = ICON_PATHS[name];
  // An unknown name must be visible, not silently absent.
  if (!d) return `<span title="unknown icon: ${name}" style="display:inline-block;width:${size}px;height:${size}px;border:1px dashed #c0392b;border-radius:3px"></span>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}><path d="${d}"/></svg>`;
}
