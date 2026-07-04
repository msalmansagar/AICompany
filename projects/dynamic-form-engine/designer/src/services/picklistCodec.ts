// Dataverse Option Set (picklist) attributes are stored as integers. These helpers
// convert between the typed design values and their stored picklist codes so styling
// round-trips correctly instead of writing raw strings/numbers into picklist columns.
// Option-set values are org-verified (org5869857f) — all design picklists are 100000001-based.

/** Maps a stored picklist integer back to its typed value, or the fallback when absent/unknown. */
export function fromPicklist<T>(raw: unknown, map: Record<number, T>, fallback: T): T {
  const code = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(code) && map[code] !== undefined ? map[code] : fallback;
}

/** Maps a typed value to its picklist integer for writing, or the fallback code when unmapped. */
export function toPicklist(value: string | number | undefined, map: Record<string, number>, fallbackCode: number): number {
  if (value == null) return fallbackCode;
  return map[String(value)] ?? fallbackCode;
}
