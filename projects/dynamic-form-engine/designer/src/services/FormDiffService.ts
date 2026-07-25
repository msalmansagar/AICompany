// Diff core for DFE-ENH-001 Workstream H.
//
// ADR-003: microdiff adopted as the diff data layer for FR-001 (conflict
// resolution dialog) and FR-004 (Phase 2 version diff viewer). This module is
// the shared foundation consumed by both features.
//
// WHY a wrapper exists: microdiff returns a discriminated union with microdiff's
// own "CHANGE" terminology. This wrapper re-exports a FormChange type with
// "UPDATE" for the modification case, keeping the caller API aligned with the
// rest of the DFE codebase (CREATE / UPDATE / REMOVE).

import diff from 'microdiff';
import type { Difference } from 'microdiff';

// ─── Public contract ──────────────────────────────────────────────────────────

/**
 * Normalised change kind.
 * microdiff's "CHANGE" is exposed as "UPDATE" to align with DFE event-type vocabulary.
 */
export type FormChangeKind = 'CREATE' | 'UPDATE' | 'REMOVE';

/**
 * A single typed change produced by diffForms.
 *
 * Consumed by:
 *   - FormDiffViewer component (this workstream)
 *   - FR-001 ConflictResolutionDialog (Workstream A)
 *   - FR-004 version diff panel (Phase 2)
 */
export interface FormChange {
  /** What happened to this property. */
  kind: FormChangeKind;
  /**
   * Full path from microdiff. Segments are strings or numeric array indices.
   * Example: ['fields', 0, 'label'] means the label of the first field changed.
   */
  path: (string | number)[];
  /**
   * Top-level grouping key derived from path[0].
   * 'root' when the path is empty (unlikely in practice but guarded).
   * Used by FormDiffViewer to section the diff UI.
   */
  area: string;
  /** State before the change. undefined when kind is CREATE. */
  oldValue: unknown;
  /** State after the change. undefined when kind is REMOVE. */
  newValue: unknown;
}

/**
 * Convenience alias: a diff result is an ordered list of FormChange records.
 * Workstream A (ConflictResolutionDialog) and FR-004 consume this shape.
 */
export type FormDiff = FormChange[];

/**
 * Human-readable summary of a diff — used by ConflictResolutionDialog (FR-001)
 * to render the body text without displaying the full change list.
 */
export interface DiffSummary {
  /** Total number of changed properties across all areas. */
  totalChanges: number;
  /** Prose summary, e.g. "3 fields changes, 1 rules change". */
  humanReadable: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function resolveArea(path: (string | number)[]): string {
  return path.length > 0 ? String(path[0]) : 'root';
}

function mapKind(type: Difference['type']): FormChangeKind {
  if (type === 'CREATE') return 'CREATE';
  if (type === 'REMOVE') return 'REMOVE';
  return 'UPDATE';
}

function mapDifferenceToChange(difference: Difference): FormChange {
  const area = resolveArea(difference.path);
  const kind = mapKind(difference.type);

  if (difference.type === 'CREATE') {
    return { kind, path: difference.path, area, oldValue: undefined, newValue: difference.value };
  }
  if (difference.type === 'REMOVE') {
    return { kind, path: difference.path, area, oldValue: difference.oldValue, newValue: undefined };
  }
  // CHANGE case — both oldValue and value are present on DifferenceChange
  return { kind, path: difference.path, area, oldValue: difference.oldValue, newValue: difference.value };
}

function formatAreaSummary(area: string, count: number): string {
  return `${count} ${area} ${count === 1 ? 'change' : 'changes'}`;
}

function countChangesByArea(changes: FormChange[]): Map<string, number> {
  return changes.reduce((acc, change) => {
    return acc.set(change.area, (acc.get(change.area) ?? 0) + 1);
  }, new Map<string, number>());
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Diffs two form definition snapshots and returns a typed FormChange array.
 *
 * FR-001 usage: `diffForms(localSnapshot, freshServerVersion)` on 412 conflict.
 * FR-004 usage: `diffForms(versionA.definition, versionB.definition)` for side-by-side compare.
 *
 * @param before - The earlier snapshot (local or older saved version)
 * @param after  - The later snapshot (server or newer saved version)
 * @returns      Ordered list of changes; empty when the two snapshots are equal
 */
export function diffForms(before: object, after: object): FormChange[] {
  // Type cast at the microdiff external-library boundary only.
  // microdiff accepts Record<string, any> | any[]. 'object' is the caller-facing
  // type which prevents callers from passing primitives by accident.
  type DiffInput = Parameters<typeof diff>[0];
  const rawChanges = diff(before as DiffInput, after as DiffInput);
  return rawChanges.map(mapDifferenceToChange);
}

/**
 * Produces a human-readable summary of a FormDiff for display in dialog bodies.
 *
 * FR-001 usage: ConflictResolutionDialog renders this in its body text before
 * the user decides to open the full FormDiffViewer.
 *
 * @param changes - Output of diffForms()
 * @returns       Summary with total count and prose description
 */
export function summarizeDiff(changes: FormChange[]): DiffSummary {
  const totalChanges = changes.length;
  if (totalChanges === 0) {
    return { totalChanges: 0, humanReadable: 'No changes' };
  }

  const parts = Array.from(countChangesByArea(changes).entries())
    .map(([area, count]) => formatAreaSummary(area, count));

  return { totalChanges, humanReadable: parts.join(', ') };
}
