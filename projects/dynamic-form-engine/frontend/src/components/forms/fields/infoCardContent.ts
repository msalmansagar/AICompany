// Parses an Info Card's content field (`infoCardBody`). The field historically
// holds plain text; it may now also hold a JSON array of row items. Parsing is
// always safe: legacy text, empty, or malformed/invalid-shape values fall back
// to plain-text mode so the component never breaks.

export interface InfoCardItem {
  order: number;
  label: string;
  icon: string;
}

export type InfoCardContent =
  | { mode: 'text'; text: string }
  | { mode: 'items'; items: InfoCardItem[] };

// Icon fallback for items with a missing/blank icon. 'info' maps to the card's
// default info glyph in the renderer.
const DEFAULT_ICON = 'info';

export function parseInfoCardContent(raw: string | null | undefined): InfoCardContent {
  const text = raw ?? '';

  // Only a JSON array is treated as structured config; anything else is text.
  if (!text.trim().startsWith('[')) {
    return { mode: 'text', text };
  }

  const parsed = tryParseJson(text);
  if (!Array.isArray(parsed) || !parsed.every(isPlainObject)) {
    return { mode: 'text', text };
  }

  return { mode: 'items', items: normalizeAndSort(parsed) };
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Sort ascending by order; ties (and normalized-invalid orders) keep input order.
function normalizeAndSort(rawItems: Record<string, unknown>[]): InfoCardItem[] {
  return rawItems
    .map((raw, index) => ({ item: normalizeItem(raw), index }))
    .sort((a, b) => a.item.order - b.item.order || a.index - b.index)
    .map((entry) => entry.item);
}

function normalizeItem(raw: Record<string, unknown>): InfoCardItem {
  return {
    order: normalizeOrder(pick(raw, 'Order', 'order')),
    label: normalizeString(pick(raw, 'Label', 'label')),
    icon: normalizeIcon(pick(raw, 'icon', 'Icon')),
  };
}

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined) return raw[key];
  }
  return undefined;
}

// Missing/invalid order sinks to the bottom while preserving input order.
function normalizeOrder(value: unknown): number {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : Number.MAX_SAFE_INTEGER;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeIcon(value: unknown): string {
  const icon = normalizeString(value).trim();
  return icon.length > 0 ? icon : DEFAULT_ICON;
}
