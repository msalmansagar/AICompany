/* =====================================================================
   Debt Collection Platform — inline SVG icon set
   Inline paths only: the prototype must render with no network access.
   ===================================================================== */
"use strict";

const ICON_PATHS = {
  add: '<path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5"/>',
  edit: '<path d="M11 2l3 3-8 8-3.5.5.5-3.5 8-8z" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  copy: '<rect x="5" y="5" width="8" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 11V3h7" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  trash: '<path d="M4 5h8M6 5V3h4v2M5 5l.7 8h4.6L11 5" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  refresh: '<path d="M13 8a5 5 0 11-1.5-3.5M13 2v3h-3" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  save: '<path d="M3 3h8l2 2v8H3V3z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 3v4h5V3M6 13v-3h4v3" fill="none" stroke="currentColor" stroke-width="1.1"/>',
  back: '<path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  forward: '<path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5"/>',
  check: '<path d="M3 8l3.5 3.5L13 5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5"/>',
  search: '<path d="M11 11l3 3M7 12A5 5 0 107 2a5 5 0 000 10z" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  filter: '<path d="M3 4h10l-4 5v4l-2-1V9L3 4z" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  excel: '<rect x="3" y="3" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.2"/>',
  info: '<circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.4"/>',
  warn: '<path d="M8 2l6 11H2L8 2z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 6.5v3M8 11v.5" stroke="currentColor" stroke-width="1.4"/>',
  history: '<path d="M8 4v4l3 2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 8a5 5 0 105-5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3 4v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" fill="none" stroke="currentColor" stroke-width="1.3"/>',

  /* domain */
  user: '<path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 6c0-2.5 2.2-4 5-4s5 1.5 5 4" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  users: '<path d="M6 7a2.4 2.4 0 100-4.8A2.4 2.4 0 006 7zm-4.5 6c0-2.1 2-3.4 4.5-3.4s4.5 1.3 4.5 3.4" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M11 7.2a2 2 0 100-4M11.6 9.9c1.7.3 2.9 1.4 2.9 3.1" fill="none" stroke="currentColor" stroke-width="1.25"/>',
  case: '<rect x="2" y="4.5" width="12" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 4.5V3.2c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7v1.3" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  queue: '<path d="M2 4h12M2 8h12M2 12h7" stroke="currentColor" stroke-width="1.4"/>',
  home: '<path d="M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 01-.5.5h-3v-4H6v4H3a.5.5 0 01-.5-.5V7.5z" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  money: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.5v7M6.2 6.3c0-.9.8-1.4 1.8-1.4s1.8.5 1.8 1.4c0 1.8-3.6 1-3.6 2.9 0 .9.8 1.5 1.8 1.5s1.8-.6 1.8-1.5" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  promise: '<path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.1" opacity=".45"/>',
  calendar: '<rect x="2" y="3.5" width="12" height="10.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2 6.5h12M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.3"/>',
  phone: '<path d="M4 2.5l2 .5 1 2.5-1.4 1a7 7 0 003.4 3.4l1-1.4 2.5 1 .5 2c0 .7-.6 1.3-1.3 1.2C7.4 12.2 3.8 8.6 2.8 3.8 2.7 3.1 3.3 2.5 4 2.5z" fill="none" stroke="currentColor" stroke-width="1.25"/>',
  mail: '<rect x="1.8" y="3.5" width="12.4" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.2 4.5L8 8.8l5.8-4.3" fill="none" stroke="currentColor" stroke-width="1.25"/>',
  sms: '<path d="M2 4.2c0-.9.7-1.7 1.6-1.7h8.8c.9 0 1.6.8 1.6 1.7v5c0 .9-.7 1.7-1.6 1.7H6.5L3 14v-3.1h-.4c-.4-.3-.6-.8-.6-1.3V4.2z" fill="none" stroke="currentColor" stroke-width="1.25"/>',
  letter: '<rect x="2.5" y="2" width="11" height="12" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5 5.5h6M5 8h6M5 10.5h4" stroke="currentColor" stroke-width="1.15"/>',
  legal: '<path d="M8 2v12M4 14h8" stroke="currentColor" stroke-width="1.3"/><path d="M2 6l3-1.5L8 6M8 6l3-1.5L14 6" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 6a2.5 2.5 0 005 0M9 6a2.5 2.5 0 005 0" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  shield: '<path d="M8 1.8l5 1.8v4c0 3-2.1 5.3-5 6.6-2.9-1.3-5-3.6-5-6.6v-4l5-1.8z" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M5.6 8l1.7 1.7L10.6 6" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  heart: '<path d="M8 13.2S2.5 10 2.5 6.2A2.9 2.9 0 018 4.6a2.9 2.9 0 015.5 1.6c0 3.8-5.5 7-5.5 7z" fill="none" stroke="currentColor" stroke-width="1.25"/>',
  restructure: '<path d="M2.5 5.5h8.5M9 3.5l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M13.5 10.5H5M7 8.5l-2 2 2 2" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  dispute: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" stroke-width="1.3"/>',
  strategy: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1" fill="currentColor"/>',
  chart: '<rect x="2" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="2" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="2" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="9" y="9" width="5" height="5" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  trend: '<path d="M2 12l3.5-4 2.5 2.2L13.5 4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.5 4h3v3" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  audit: '<path d="M3 2h7l3 3v9H3V2z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M6 9l1.5 1.5L11 7" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  approve: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.2 8.2l2 2L11 6.2" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  reject: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.4"/>',
  settings: '<circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" stroke="currentColor" stroke-width="1.2"/>',
  route: '<circle cx="3.5" cy="8" r="1.8" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="12.5" cy="4" r="1.8" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="12.5" cy="12" r="1.8" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 8h2.2c1 0 1.3-.5 1.8-1.2l.9-1.4M5.3 8h2.2c1 0 1.3.5 1.8 1.2l.9 1.4" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  plug: '<path d="M6 4a2 2 0 100 4M10 12a2 2 0 100-4M6 6h4M8 8v2" fill="none" stroke="currentColor" stroke-width="1.3"/>',
  doc: '<path d="M3.5 2h6L12.5 5v9h-9V2z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9.5 2v3h3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 8h5M5.5 10.5h3" stroke="currentColor" stroke-width="1.1"/>',
  escalate: '<path d="M8 13V4M4.5 7.5L8 4l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  bell: '<path d="M8 2a3.6 3.6 0 013.6 3.6c0 3 1.1 3.7 1.4 4.4H3c.3-.7 1.4-1.4 1.4-4.4A3.6 3.6 0 018 2z" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M6.6 12a1.5 1.5 0 002.8 0" fill="none" stroke="currentColor" stroke-width="1.25"/>',
  send: '<path d="M14 2L2 7l4.5 1.8L14 2zm0 0L8.5 13l-2-4.2L14 2z" fill="none" stroke="currentColor" stroke-width="1.25"/>',
  assign: '<path d="M6 7.5a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2zM1.8 13.5c0-2.2 1.9-3.6 4.2-3.6" fill="none" stroke="currentColor" stroke-width="1.25"/><path d="M9.5 11h4.5M12 9l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.25"/>'
};

/**
 * Renders a 16x16 inline icon. Unknown names render nothing rather than
 * a broken glyph, so a missing icon never blocks a screen.
 * @param {string} name key from ICON_PATHS
 * @returns {string} SVG markup
 */
function ic(name) {
  const path = ICON_PATHS[name];
  if (!path) return "";
  return `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${path}</svg>`;
}
