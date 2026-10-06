import { useMemo } from 'react';
import type { SnapshotRow } from '../../data/caseQueries.js';
import { formatCount } from '../../components/primitives.js';
import { axisLabelsFor, formatSnapshotDay } from './snapshotDates.js';

/**
 * A line through the stored points only — no interpolation, no smoothing. A point with no DPD is
 * left out, never invented.
 *
 * The vertical scale runs from the lowest to the highest value shown, with a margin, not from zero:
 * from zero, 60 → 74 sat flat along the top of the chart and the movement an officer needs to see
 * disappeared. Every point keeps its own value label, so the scale itself needs no axis numbers.
 */
const WIDTH = 320;
const HEIGHT = 150;
const PAD_X = 28;
const PLOT_TOP = 22;
const PLOT_BOTTOM = HEIGHT - 30;
const BASELINE = PLOT_BOTTOM + 6;
const MAX_AXIS_LABELS = 6;

interface PlottedPoint { point: SnapshotRow; x: number; y: number; axisLabel: string | undefined }

export function DpdChart({ points }: { points: readonly SnapshotRow[] }) {
  const plotted = useMemo(() => plot(points), [points]);
  const description = `Days past due by stored date: ${plotted.map(p => `${formatSnapshotDay(p.point.snapshotDate)} ${formatCount(p.point.dpd)}`).join(', ')}.`;
  return (
    <svg className="c360-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={description} data-testid="c360-dpd-chart">
      <line className="c360-chart-baseline" x1={PAD_X / 2} x2={WIDTH - PAD_X / 2} y1={BASELINE} y2={BASELINE} />
      <polyline className="c360-chart-line" points={plotted.map(p => `${p.x},${p.y}`).join(' ')} fill="none" />
      {plotted.map(p => (
        <g key={p.point.id}>
          <circle className="c360-chart-point" cx={p.x} cy={p.y} r={3.5} />
          <text className="c360-chart-label" x={p.x} y={p.y - 8} textAnchor="middle">{formatCount(p.point.dpd)}</text>
          {p.axisLabel && <text className="c360-chart-axis" x={p.x} y={HEIGHT - 6} textAnchor="middle">{p.axisLabel}</text>}
        </g>
      ))}
    </svg>
  );
}

function plot(points: readonly SnapshotRow[]): PlottedPoint[] {
  const known = points.filter(point => point.dpd !== undefined);
  const scale = verticalScale(known.map(point => point.dpd!));
  const step = known.length > 1 ? (WIDTH - 2 * PAD_X) / (known.length - 1) : 0;
  const labels = axisLabelsFor(known.map(point => point.snapshotDate));
  const labelEvery = Math.ceil(known.length / MAX_AXIS_LABELS);
  return known.map((point, index) => ({
    point,
    x: PAD_X + index * step,
    y: scale(point.dpd!),
    // Counted back from the newest, so the latest observation is always labelled.
    axisLabel: (known.length - 1 - index) % labelEvery === 0 ? labels[index] : undefined,
  }));
}

/** Maps a DPD to a y position over the range of the values shown, padded so no point sits on an edge. */
function verticalScale(values: readonly number[]): (value: number) => number {
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const margin = Math.max((highest - lowest) * 0.15, 1);
  const bottom = Math.max(lowest - margin, 0);
  const top = highest + margin;
  return value => PLOT_TOP + ((top - value) / (top - bottom)) * (PLOT_BOTTOM - PLOT_TOP);
}
