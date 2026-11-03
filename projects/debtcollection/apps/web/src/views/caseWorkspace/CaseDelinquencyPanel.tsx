import { useEffect, useMemo, useRef, useState } from 'react';
import { createSnapshotQuery, type SnapshotRow } from '../../data/caseQueries.js';
import { SectionBoundary, SkeletonLines, useSectionData } from '../../components/SectionBoundary.js';
import { BucketBadge } from '../../components/StatusBadge.js';
import { formatCount, formatMoney } from '../../components/primitives.js';
import { useCrmSession } from '../../shell/context.js';
import { formatSnapshotDay } from '../customer360/snapshotDates.js';

/**
 * This episode's last few stored MIS positions, newest first.
 *
 * Deliberately compact: the customer's whole portfolio over time is Customer 360's, and the full
 * snapshot list is the Delinquency history tab. Read only once the panel scrolls into view, so a
 * case opened for a quick action never pays for it.
 */
const SNAPSHOTS_SHOWN = 6;

export function CaseDelinquencyPanel({ caseId, onOpenAll }: { caseId: string; onOpenAll: () => void }) {
  const { adapter } = useCrmSession();
  const [anchor, isVisible] = useSeenOnce();
  const fetchPage = useMemo(() => createSnapshotQuery(adapter), [adapter]);
  const snapshots = useSectionData(
    isVisible ? async () => (await fetchPage({ caseId, pageSize: SNAPSHOTS_SHOWN })).items : undefined,
    [fetchPage, caseId, isVisible],
  );
  return (
    <section ref={anchor} className="section-card cw-delinquency" aria-labelledby="cw-delinquency-title" data-testid="cw-delinquency">
      <div className="c360-section-head">
        <h3 id="cw-delinquency-title">Delinquency</h3>
        <button type="button" className="btn-link" onClick={onOpenAll} data-testid="cw-delinquency-all">Full history</button>
      </div>
      <SectionBoundary label="The delinquency history" state={snapshots.state} onRetry={snapshots.retry} skeleton={<SkeletonLines lines={3} height={16} />} testId="cw-delinquency-section">
        {rows => <SnapshotList rows={rows} />}
      </SectionBoundary>
    </section>
  );
}

function SnapshotList({ rows }: { rows: readonly SnapshotRow[] }) {
  if (rows.length === 0) return <p className="c360-empty">No MIS position has been stored for this case.</p>;
  return (
    <table className="cw-snapshots" data-testid="cw-snapshots">
      <thead><tr><th scope="col">As of</th><th scope="col">DPD</th><th scope="col">Bucket</th><th scope="col">Arrears</th></tr></thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id}>
            <td>{formatSnapshotDay(row.snapshotDate)}</td>
            <td>{formatCount(row.dpd)}</td>
            <td><BucketBadge bucket={row.bucket} /></td>
            <td>{formatMoney(row.totalArrears)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** True from the first moment the element is on screen. Without IntersectionObserver, at once. */
function useSeenOnce(): [(element: HTMLElement | null) => void, boolean] {
  const [isVisible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => () => observer.current?.disconnect(), []);
  const anchor = (element: HTMLElement | null) => {
    if (!element || isVisible || observer.current) return;
    observer.current = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setVisible(true);
      observer.current?.disconnect();
    });
    observer.current.observe(element);
  };
  return [anchor, isVisible];
}
