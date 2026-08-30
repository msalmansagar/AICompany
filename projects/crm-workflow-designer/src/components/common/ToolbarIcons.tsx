/**
 * The toolbar icon set: one 16×16 inline SVG per command, drawn on
 * `currentColor` so a button keeps its own state colour (primary, danger,
 * disabled) without the icon needing to know.
 *
 * Inline rather than an icon font or sprite because the whole designer ships
 * as a single web resource — every extra asset is another thing CRM has to
 * serve and cache-bust.
 */

export type ToolbarIconName =
  | 'new'
  | 'edit'
  | 'refresh'
  | 'fit'
  | 'layout'
  | 'png'
  | 'pdf'
  | 'minimap'
  | 'labels'
  | 'returns'
  | 'saveLayout'
  | 'summary'
  | 'undo'
  | 'redo'
  | 'addStep'
  | 'validate'
  | 'settings'
  | 'save'
  | 'publish'
  | 'demo'
  | 'simulate'
  | 'auto'
  | 'discard'
  | 'focus'
  | 'person'
  | 'clone'
  | 'more';

const P = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

const PATHS: Record<ToolbarIconName, JSX.Element> = {
  new: <><path d="M8 3.5v9M3.5 8h9" {...P} /></>,
  edit: <><path d="M11.2 2.8l2 2L6 12H4v-2z" {...P} /><path d="M2.5 14h11" {...P} /></>,
  refresh: <><path d="M13.2 7A5.2 5.2 0 0 0 3.6 5.6M2.8 9a5.2 5.2 0 0 0 9.6 1.4" {...P} /><path d="M13.4 3.4v3.3h-3.3M2.6 12.6V9.3h3.3" {...P} /></>,
  fit: <><path d="M2.6 6V2.6H6M10 2.6h3.4V6M13.4 10v3.4H10M6 13.4H2.6V10" {...P} /></>,
  layout: <><rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1" {...P} /><rect x="9" y="2.4" width="4.6" height="4.6" rx="1" {...P} /><rect x="2.4" y="9" width="4.6" height="4.6" rx="1" {...P} /><rect x="9" y="9" width="4.6" height="4.6" rx="1" {...P} /></>,
  png: <><rect x="2.4" y="3.4" width="11.2" height="9.2" rx="1.2" {...P} /><circle cx="6" cy="7" r="1.1" {...P} /><path d="M3.2 11.4 6.6 8.6l2.2 1.9 2-1.6 2 2" {...P} /></>,
  pdf: <><path d="M4 2.4h5l3 3v8.2H4z" {...P} /><path d="M9 2.4v3.2h3" {...P} /><path d="M6 9.4h4M6 11.4h2.6" {...P} /></>,
  minimap: <><rect x="2.4" y="3.6" width="11.2" height="8.8" rx="1.2" {...P} /><rect x="8.6" y="7.6" width="4" height="3.4" rx="0.8" {...P} /></>,
  labels: <><path d="M2.6 6.4 7 2.8l6.4 3.2-4.8 6.6z" {...P} /><circle cx="6.2" cy="6" r="0.9" fill="currentColor" /></>,
  returns: <><path d="M13 11.6a4.4 4.4 0 0 0-4.4-4.4H3.6" {...P} /><path d="M6.2 4.4 3.2 7.2l3 2.8" {...P} /></>,
  saveLayout: <><path d="M3.4 2.6h7.2l2.4 2.4v8H3.4z" {...P} /><path d="M5.6 2.6v3.6h4.6V2.6M5.6 13v-3.4h4.8V13" {...P} /></>,
  summary: <><rect x="3" y="2.4" width="10" height="11.2" rx="1.2" {...P} /><path d="M5.6 5.6h4.8M5.6 8h4.8M5.6 10.4h3" {...P} /></>,
  undo: <><path d="M6 4.2 3 7l3 2.8" {...P} /><path d="M3.2 7h5.6a3.6 3.6 0 0 1 0 7.2H6.4" {...P} /></>,
  redo: <><path d="M10 4.2 13 7l-3 2.8" {...P} /><path d="M12.8 7H7.2a3.6 3.6 0 0 0 0 7.2h2.4" {...P} /></>,
  addStep: <><rect x="2.4" y="4" width="7" height="8" rx="1.2" {...P} /><path d="M11.6 5.6v5M9.1 8.1h5" {...P} /></>,
  validate: <><path d="M3.4 8.4 6.4 11.4l6.2-6.6" {...P} /></>,
  settings: <><circle cx="8" cy="8" r="2.2" {...P} /><path d="M8 1.8v2M8 12.2v2M14.2 8h-2M3.8 8h-2M12.4 3.6l-1.4 1.4M5 11l-1.4 1.4M12.4 12.4 11 11M5 5 3.6 3.6" {...P} /></>,
  save: <><path d="M3.2 2.8h7.6l2.4 2.4v8H3.2z" {...P} /><path d="M5.4 2.8v3.4h4.4V2.8M5.4 13V9.6h5.2V13" {...P} /></>,
  publish: <><path d="M8 12.6V3.4" {...P} /><path d="M4.6 6.8 8 3.2l3.4 3.6" {...P} /><path d="M3 13.6h10" {...P} /></>,
  demo: <><circle cx="8" cy="8" r="5.6" {...P} /><path d="M6.8 5.8 10.4 8l-3.6 2.2z" fill="currentColor" stroke="none" /></>,
  simulate: <><path d="M4.4 3.4 12 8l-7.6 4.6z" {...P} /></>,
  auto: <><path d="M2.6 3.6 7 8l-4.4 4.4M8.4 3.6 12.8 8l-4.4 4.4" {...P} /></>,
  discard: <><path d="M3.4 4.6h9.2" {...P} /><path d="M5.6 4.6V3.2h4.8v1.4M4.6 4.6l.7 8.4h5.4l.7-8.4" {...P} /></>,
  focus: <><circle cx="8" cy="8" r="3.4" {...P} /><circle cx="8" cy="8" r="0.9" fill="currentColor" stroke="none" /><path d="M8 1.6v2.2M8 12.2v2.2M1.6 8h2.2M12.2 8h2.2" {...P} /></>,
  person: <><circle cx="8" cy="5.4" r="2.6" {...P} /><path d="M3.2 13.4a4.8 4.8 0 0 1 9.6 0" {...P} /></>,
  clone: <><rect x="5.4" y="5.4" width="8" height="8" rx="1.4" {...P} /><path d="M10.6 5.4V4a1.4 1.4 0 0 0-1.4-1.4H4A1.4 1.4 0 0 0 2.6 4v5.2A1.4 1.4 0 0 0 4 10.6h1.4" {...P} /></>,
  more: <><circle cx="3.6" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" /><circle cx="12.4" cy="8" r="1.2" fill="currentColor" stroke="none" /></>,
};

export function ToolbarIcon({ name, size = 15 }: { name: ToolbarIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {PATHS[name]}
    </svg>
  );
}
