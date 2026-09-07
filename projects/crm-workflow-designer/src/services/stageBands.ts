import type { Node } from '@xyflow/react';
import { roleOfStepName } from './stageRoles';
import type { LayoutDir, ViewStepData } from './WorkflowGraphBuilder';

/**
 * Stage bands (CWFD-009 P5): the 7-chapter table of contents a 35-step
 * process needs.
 *
 * Bands are full-width strips across the flow axis, derived from the laid-out
 * positions — walk the cards in flow order, read each one's role hint from
 * its name, and merge neighbours that share a role. Because they follow the
 * layout instead of steering it, they can never collide with anything; they
 * are scenery behind the graph, labelled at the edge like BPMN phase lanes.
 */

export interface StageBandData extends Record<string, unknown> {
  label: string;
  bandWidth: number;
  bandHeight: number;
  layoutDir: LayoutDir;
  /** Alternating tint index so neighbouring bands read as different. */
  tintIndex: number;
}

const BAND_PADDING = 46;
const CROSS_PADDING = 120;
/** A band needs this many cards before it earns a label of its own. */
const MIN_STEPS_FOR_OWN_BAND = 1;

export function buildStageBands(nodes: Node[], dir: LayoutDir): Node[] {
  const cards = nodes.filter(
    (n) => n.type === 'viewStep' && !(n.data as ViewStepData).isCorrection
  );
  if (cards.length < 8) return [];

  const mainStart = (n: Node) => (dir === 'TB' ? n.position.y : n.position.x);
  const mainEnd = (n: Node) =>
    dir === 'TB'
      ? n.position.y + ((n.data as ViewStepData).nodeHeight ?? 78)
      : n.position.x + 280;

  // Cross-axis extent covers every node, pills and gateways included.
  const crossValues = nodes
    .filter((n) => n.type !== 'stageBand')
    .flatMap((n) =>
      dir === 'TB' ? [n.position.x, n.position.x + 280] : [n.position.y, n.position.y + 200]
    );
  const crossMin = Math.min(...crossValues) - CROSS_PADDING;
  const crossMax = Math.max(...crossValues) + CROSS_PADDING;

  // Group the cards into rank rows first. Parallel streams put different
  // roles side by side in the same row — a band labelled by single cards
  // alternated "EPD / Technical / EPD" down the parallel section. A row's
  // label is the SET of roles it holds ("EPD · Technical"), which is what is
  // actually happening there.
  const ordered = [...cards].sort((a, b) => mainStart(a) - mainStart(b));
  interface Row {
    roles: Set<string>;
    start: number;
    end: number;
    count: number;
  }
  const rows: Row[] = [];
  const ROW_TOLERANCE = 60;
  for (const card of ordered) {
    const role = roleOfStepName((card.data as ViewStepData).step.name);
    const current = rows[rows.length - 1];
    if (current && mainStart(card) - current.start < ROW_TOLERANCE) {
      if (role) current.roles.add(role);
      current.end = Math.max(current.end, mainEnd(card));
      current.count += 1;
    } else {
      rows.push({
        roles: new Set(role ? [role] : []),
        start: mainStart(card),
        end: mainEnd(card),
        count: 1,
      });
    }
  }

  // Rows inherit the previous row's roles when their own names say nothing,
  // then contiguous rows with the same role set merge into one band.
  interface Run {
    role: string;
    start: number;
    end: number;
    count: number;
  }
  const runs: Run[] = [];
  let lastLabel: string | null = null;
  for (const row of rows) {
    const label: string | null =
      row.roles.size > 0 ? [...row.roles].sort().join(' · ') : lastLabel;
    if (!label) continue;
    const current = runs[runs.length - 1];
    if (current && current.role === label) {
      current.end = Math.max(current.end, row.end);
      current.count += row.count;
    } else {
      runs.push({ role: label, start: row.start, end: row.end, count: row.count });
    }
    lastLabel = label;
  }

  const kept = runs.filter((run) => run.count >= MIN_STEPS_FOR_OWN_BAND);
  if (kept.length < 2) return [];

  // Bands meet halfway between neighbouring runs, so together they tile the
  // flow axis with no gaps and no overlaps.
  const bounds: Array<{ from: number; to: number }> = kept.map((run, index) => {
    const from =
      index === 0
        ? run.start - BAND_PADDING
        : (kept[index - 1].end + run.start) / 2;
    const to =
      index === kept.length - 1
        ? run.end + BAND_PADDING
        : (run.end + kept[index + 1].start) / 2;
    return { from, to };
  });

  return kept.map((run, index) => {
    const { from, to } = bounds[index];
    const data: StageBandData = {
      label: run.role,
      bandWidth: dir === 'TB' ? crossMax - crossMin : to - from,
      bandHeight: dir === 'TB' ? to - from : crossMax - crossMin,
      layoutDir: dir,
      tintIndex: index % 2,
    };
    return {
      id: `stage_band_${index}`,
      type: 'stageBand',
      position:
        dir === 'TB' ? { x: crossMin, y: from } : { x: from, y: crossMin },
      data,
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -20,
    } as Node;
  });
}
