import { dpdChange } from '@dcp/domain';
import type { SnapshotRow } from '../../data/caseQueries.js';
import type { UnitSnapshots } from '../../data/unitSnapshots.js';
import { BucketBadge } from '../../components/StatusBadge.js';
import { formatCount } from '../../components/primitives.js';
import { DpdChart } from './DpdChart.js';
import { formatSnapshotDay } from './snapshotDates.js';

/**
 * The selected unit's stored MIS observations — never live MIS, never written by viewing.
 *
 *   0 points — an empty state;
 *   1 point  — one observation, no line and no movement;
 *   2+       — the figures first (current, previous, change), then the line through the real points
 *              only, then the stored values newest first; 3+ also states the change since the first
 *              observation shown.
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

function SingleObservation({ point }: { point: SnapshotRow }) {
  return (
    <dl className="c360-facts" data-testid="c360-snapshot-single">
      <div className="c360-fact"><dt>As of</dt><dd>{formatSnapshotDay(point.snapshotDate)}</dd></div>
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
  const first = points[0]!;
  const latest = points[points.length - 1]!;
  const sinceFirst = describeChange(dpdChange(first.dpd, latest.dpd));
  return (
    <>
      <Movement latest={latest} previous={points[points.length - 2]!} />
      {points.length >= 3 && sinceFirst.text !== '—' && (
        <p className="c360-dpd-since" data-testid="c360-dpd-since">{sinceFirst.text === 'No change' ? `No change in DPD since ${formatSnapshotDay(first.snapshotDate)}` : `${sinceFirst.text} DPD since ${formatSnapshotDay(first.snapshotDate)}`}</p>
      )}
      <DpdChart points={points} />
      <StoredValues points={points} />
    </>
  );
}

/** Current, previous and the change between them — three tiles, each with what it is measured against. */
function Movement({ latest, previous }: { latest: SnapshotRow; previous: SnapshotRow }) {
  const change = describeChange(dpdChange(previous.dpd, latest.dpd));
  return (
    <dl className="c360-tiles" data-testid="c360-movement">
      <Tile label="Current DPD" value={formatCount(latest.dpd)} caption={formatSnapshotDay(latest.snapshotDate)} />
      <Tile label="Previous DPD" value={formatCount(previous.dpd)} caption={formatSnapshotDay(previous.snapshotDate)} />
      <div className="c360-tile">
        <dt>Change</dt>
        <dd className="c360-tile-value" aria-label={change.label} data-testid="c360-dpd-change">{change.text}</dd>
        <dd className="c360-tile-caption">vs previous</dd>
      </div>
    </dl>
  );
}

function Tile({ label, value, caption }: { label: string; value: string; caption: string }) {
  return (
    <div className="c360-tile">
      <dt>{label}</dt>
      <dd className="c360-tile-value">{value}</dd>
      <dd className="c360-tile-caption">{caption}</dd>
    </div>
  );
}

/** The stored values as plain rows, newest first. A table for assistive technology, quiet on screen. */
function StoredValues({ points }: { points: readonly SnapshotRow[] }) {
  return (
    <>
      <p className="c360-hint c360-values-title">Stored values, newest first</p>
      <table className="c360-values" data-testid="c360-snapshot-values">
        <thead className="c360-visually-hidden"><tr><th scope="col">As of</th><th scope="col">DPD</th><th scope="col">Bucket</th></tr></thead>
        <tbody>
          {[...points].reverse().map(point => (
            <tr key={point.id}>
              <td>{formatSnapshotDay(point.snapshotDate)}</td>
              <td className="c360-values-dpd">{point.dpd === undefined ? '—' : `${formatCount(point.dpd)} DPD`}</td>
              <td className="c360-values-bucket">{point.bucket ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
