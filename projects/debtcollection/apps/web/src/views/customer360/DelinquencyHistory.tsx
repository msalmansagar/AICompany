import { useMemo } from 'react';
import { dpdChange } from '@dcp/domain';
import type { SnapshotRow } from '../../data/caseQueries.js';
import type { UnitSnapshots } from '../../data/unitSnapshots.js';
import { BucketBadge } from '../../components/StatusBadge.js';
import { formatCount } from '../../components/primitives.js';

/**
 * The selected unit's stored MIS observations — never live MIS, never written by viewing.
 *
 *   0 points — an empty state;
 *   1 point  — one observation, no line and no movement;
 *   2+       — a DPD line through the real points only (no interpolation, no smoothing), labelled,
 *              with a values table, and a factual movement row; 3+ also states the change since the
 *              first observation shown.
 * No judgement words: the numbers are stated, not graded.
 */
export function DelinquencyHistory({ unitNumber, snapshots }: { unitNumber: string; snapshots: UnitSnapshots }) {
  const points = snapshots.points;
  return (
    <section className="section-card c360-delinquency" aria-labelledby="c360-delinquency-title" data-testid="c360-delinquency">
      <h3 id="c360-delinquency-title">Delinquency History · {unitNumber}</h3>
      <p className="c360-hint">Stored snapshots. Not live MIS.</p>
      {points.length === 0 && <p className="c360-empty" data-testid="c360-snapshots-empty">No MIS snapshot has been stored for this unit.</p>}
      {points.length === 1 && <SingleObservation point={points[0]!} />}
      {points.length >= 2 && <Trend points={points} />}
      {snapshots.hasEarlier && <p className="c360-hint" data-testid="c360-snapshots-earlier">Earlier observations are stored and not shown.</p>}
    </section>
  );
}

const day = (iso: string | undefined) => (iso ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)).replace(/ /g, '-') : '—');

function SingleObservation({ point }: { point: SnapshotRow }) {
  return (
    <dl className="c360-facts" data-testid="c360-snapshot-single">
      <div className="c360-fact"><dt>As of</dt><dd>{day(point.snapshotDate)}</dd></div>
      <div className="c360-fact"><dt>DPD</dt><dd>{formatCount(point.dpd)}</dd></div>
      <div className="c360-fact"><dt>Bucket</dt><dd><BucketBadge bucket={point.bucket} /></dd></div>
    </dl>
  );
}

export function describeChange(change: number | undefined): { text: string; label: string } {
  if (change === undefined) return { text: '—', label: 'Change not available' };
  if (change === 0) return { text: 'No change', label: 'No change in days past due' };
  const direction = change > 0 ? 'up' : 'down';
  return { text: `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}`, label: `Days past due ${direction} by ${Math.abs(change)}` };
}

function Trend({ points }: { points: readonly SnapshotRow[] }) {
  const latest = points[points.length - 1]!;
  const previous = points[points.length - 2]!;
  const first = points[0]!;
  const change = describeChange(dpdChange(previous.dpd, latest.dpd));
  const sinceFirst = describeChange(dpdChange(first.dpd, latest.dpd));
  return (
    <>
      <DpdChart points={points} />
      <dl className="c360-movement" data-testid="c360-movement">
        <div className="c360-fact"><dt>Current DPD</dt><dd>{formatCount(latest.dpd)} · {day(latest.snapshotDate)}</dd></div>
        <div className="c360-fact"><dt>Previous DPD</dt><dd>{formatCount(previous.dpd)} · {day(previous.snapshotDate)}</dd></div>
        <div className="c360-fact"><dt>Change</dt><dd aria-label={change.label} data-testid="c360-dpd-change">{change.text}</dd></div>
      </dl>
      {points.length >= 3 && sinceFirst.text !== '—' && (
        <p className="c360-hint" data-testid="c360-dpd-since">{sinceFirst.text === 'No change' ? `No change in DPD since ${day(first.snapshotDate)}` : `${sinceFirst.text} DPD since ${day(first.snapshotDate)}`}</p>
      )}
      <table className="grid c360-values" data-testid="c360-snapshot-values">
        <caption className="c360-visually-hidden">Stored DPD by date</caption>
        <thead><tr><th scope="col">As of</th><th scope="col">DPD</th><th scope="col">Bucket</th></tr></thead>
        <tbody>
          {[...points].reverse().map(point => (
            <tr key={point.id}><td>{day(point.snapshotDate)}</td><td>{formatCount(point.dpd)}</td><td><BucketBadge bucket={point.bucket} /></td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const WIDTH = 300;
const HEIGHT = 110;
const PAD = 18;

/** A line through the stored points only. A point with no DPD is left out, never invented. */
function DpdChart({ points }: { points: readonly SnapshotRow[] }) {
  const plotted = useMemo(() => {
    const known = points.filter(point => point.dpd !== undefined);
    const values = known.map(point => point.dpd!);
    const top = Math.max(...values, 1);
    const step = known.length > 1 ? (WIDTH - 2 * PAD) / (known.length - 1) : 0;
    return known.map((point, index) => ({ point, x: PAD + index * step, y: HEIGHT - PAD - ((point.dpd! / top) * (HEIGHT - 2 * PAD)) }));
  }, [points]);
  const description = `Days past due by stored date: ${plotted.map(p => `${day(p.point.snapshotDate)} ${formatCount(p.point.dpd)}`).join(', ')}.`;
  return (
    <svg className="c360-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={description} data-testid="c360-dpd-chart">
      <polyline className="c360-chart-line" points={plotted.map(p => `${p.x},${p.y}`).join(' ')} fill="none" />
      {plotted.map(p => (
        <g key={p.point.id}>
          <circle className="c360-chart-point" cx={p.x} cy={p.y} r={3} />
          <text className="c360-chart-label" x={p.x} y={p.y - 6} textAnchor="middle">{formatCount(p.point.dpd)}</text>
        </g>
      ))}
      <text className="c360-chart-axis" x={PAD} y={HEIGHT - 2}>{day(plotted[0]?.point.snapshotDate)}</text>
      <text className="c360-chart-axis" x={WIDTH - PAD} y={HEIGHT - 2} textAnchor="end">{day(plotted[plotted.length - 1]?.point.snapshotDate)}</text>
    </svg>
  );
}
