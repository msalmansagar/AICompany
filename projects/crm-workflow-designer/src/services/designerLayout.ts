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
  /** Node positions, keyed the way the edit canvas keys them (`step_<id>`, `edit_start`…). */
  nodePositions: Record<string, CanvasPoint>;
  /** A point an edge is bent through, keyed by edge id (`outcome_<id>`). */
  edgeAnchors: Record<string, CanvasPoint>;
  /** How far an edge label was dragged from its computed spot, keyed by edge id. */
  labelOffsets: Record<string, CanvasOffset>;
}

export function serializeDesignerLayout(layout: Omit<DesignerLayout, 'v'>): string {
  return JSON.stringify({ v: 1, ...layout });
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
      edgeAnchors: cleanMap<CanvasPoint>(raw.edgeAnchors, (v) => isFinitePair(v, 'x', 'y')),
      labelOffsets: cleanMap<CanvasOffset>(raw.labelOffsets, (v) => isFinitePair(v, 'dx', 'dy')),
    };
  } catch {
    return null;
  }
}
