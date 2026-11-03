/**
 * The designer layout blob: everything about how a process is DRAWN, none of
 * it meaning anything to the engine. Persisted as an annotation on the
 * process record (subject below) — the entity has notes enabled, so this
 * needs no schema change and rides along with solution export like any data.
 */
export const DESIGNER_LAYOUT_SUBJECT = 'cwfd:designer-layout';

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface CanvasOffset {
  dx: number;
  dy: number;
}

export interface DesignerLayout {
  v: 1;
  /**
   * Node positions for the READ-ONLY view canvases, keyed by view mode and
   * layout direction (`business:TB`) because each mode draws a different
   * graph — one shared map would fight itself every time the mode changed.
   */
  viewLayouts: Record<string, Record<string, CanvasPoint>>;
  /** Node positions, keyed the way the edit canvas keys them (`step_<id>`, `edit_start`…). */
  nodePositions: Record<string, CanvasPoint>;
  /** A point an edge is bent through, keyed by edge id (`outcome_<id>`). */
  edgeAnchors: Record<string, CanvasPoint>;
  /** How far an edge label was dragged from its computed spot, keyed by edge id. */
  labelOffsets: Record<string, CanvasOffset>;
}

/** Each view mode keeps its own map; malformed ones are dropped whole. */
function cleanViewLayouts(raw: unknown): Record<string, Record<string, CanvasPoint>> {
  const out: Record<string, Record<string, CanvasPoint>> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      const cleaned = cleanMap<CanvasPoint>(value, (v) => isFinitePair(v, 'x', 'y'));
      if (Object.keys(cleaned).length > 0) out[key] = cleaned;
    }
  }
  return out;
}

export function serializeDesignerLayout(layout: Partial<Omit<DesignerLayout, 'v'>>): string {
  return JSON.stringify({
    v: 1,
    nodePositions: layout.nodePositions ?? {},
    edgeAnchors: layout.edgeAnchors ?? {},
    labelOffsets: layout.labelOffsets ?? {},
    viewLayouts: layout.viewLayouts ?? {},
  });
}

/**
 * Writes one part of the layout without discarding the rest.
 *
 * The editor and the view canvases own different halves of this blob and save
 * at different times; a plain overwrite from either would erase the other.
 */
export function mergeDesignerLayout(
  existingJson: string | null | undefined,
  patch: Partial<Omit<DesignerLayout, 'v'>>
): string {
  const existing = parseDesignerLayout(existingJson);
  return serializeDesignerLayout({
    nodePositions: patch.nodePositions ?? existing?.nodePositions ?? {},
    edgeAnchors: patch.edgeAnchors ?? existing?.edgeAnchors ?? {},
    labelOffsets: patch.labelOffsets ?? existing?.labelOffsets ?? {},
    viewLayouts: patch.viewLayouts ?? existing?.viewLayouts ?? {},
  });
}

function isFinitePair(value: unknown, a: string, b: string): boolean {
  const record = value as Record<string, unknown> | null;
  return (
    record !== null &&
    typeof record === 'object' &&
    Number.isFinite(record[a]) &&
    Number.isFinite(record[b])
  );
}

function cleanMap<T>(raw: unknown, isValid: (v: unknown) => boolean): Record<string, T> {
  const out: Record<string, T> = {};
  if (raw && typeof raw === 'object') {
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (isValid(value)) out[key] = value as T;
    }
  }
  return out;
}

/**
 * Parses a stored layout, tolerating junk: unknown fields are ignored and
 * malformed entries dropped, so a hand-edited or future-versioned note
 * degrades to "less layout" instead of a crash.
 */
export function parseDesignerLayout(json: string | null | undefined): DesignerLayout | null {
  if (!json) return null;
  try {
    const raw = JSON.parse(json) as Record<string, unknown>;
    return {
      v: 1,
      nodePositions: cleanMap<CanvasPoint>(raw.nodePositions, (v) => isFinitePair(v, 'x', 'y')),
      viewLayouts: cleanViewLayouts(raw.viewLayouts),
      edgeAnchors: cleanMap<CanvasPoint>(raw.edgeAnchors, (v) => isFinitePair(v, 'x', 'y')),
      labelOffsets: cleanMap<CanvasOffset>(raw.labelOffsets, (v) => isFinitePair(v, 'dx', 'dy')),
    };
  } catch {
    return null;
  }
}
