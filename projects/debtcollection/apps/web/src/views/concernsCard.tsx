import { useEffect, useState } from 'react';
import type { ConcernRow } from '@dcp/domain';
import { describeFailure } from '../platform/errors.js';
import {
  findConcernTypeId, loadCaseConcerns, type CaseConcerns as CaseConcernsData,
} from '../data/caseConcerns.js';
import { useActivityTypeId, useConcludability } from '../data/useConcludability.js';
import { Card, Icon } from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';

/**
 * Collection Disputes and formal Customer Complaints, on one screen and never in one list.
 *
 * QDB treats these as different business concepts, and the screen makes the difference obvious:
 * two tables, two headings, two vocabularies. A dispute names the collection information the
 * customer contests; a Complaint names Case Management's own Case number and status.
 *
 * **There is no combined "Complaint / Dispute" action**, even though the underlying activity type
 * still carries that label (KI-118). The label is configuration; it is not the model.
 *
 * Nothing here pauses collection, suppresses a message, touches delinquency or changes the case —
 * recording either concern changes no collection behaviour, because no QDB policy says it should
 * (KI-119).
 */
export function CaseConcerns({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const [concerns, setConcerns] = useState<CaseConcernsData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const concluding = useConcludability(adapter, useActivityTypeId(adapter, findConcernTypeId));

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setConcerns(null);
    loadCaseConcerns(adapter, caseId)
      .then(result => { if (!cancelled) { setConcerns(result); setState('ready'); } })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(describeFailure(failure));
        setState('error');
      });
    // Cancelling on a case change is what stops a slow read painting the previous case's
    // complaints over the new one.
    return () => { cancelled = true; };
  }, [adapter, caseId]);

  if (state === 'loading') {
    return <div className="empty-state" data-testid="concerns-loading">Loading disputes…</div>;
  }
  if (state === 'error') {
    return (
      <Card title="Disputes and complaints">
        <div className="info-banner bad" data-testid="concerns-error">
          <Icon name="warn" />
          <div><b>This could not be read.</b><p>{error}</p></div>
        </div>
      </Card>
    );
  }
  if (!concerns || (concerns.disputes.length === 0 && concerns.complaints.length === 0)) return null;

  return (
    <>
      {concerns.disputes.length > 0 && (
        <Card
          title="Collection disputes"
          subtitle="Collection information this customer contests. Recording one changes nothing about collection."
        >
          <ConcernTable
            rows={concerns.disputes}
            firstHeading="Disputed information"
            secondHeading="Detail"
            testId="case-disputes"
          />
          {!concluding.available && (
            <div className="info-banner" data-testid="dispute-conclude-unavailable">
              <Icon name="info" />
              <div>
                {concluding.reason} A dispute stays open until QDB configures what concluding one
                means.
              </div>
            </div>
          )}
        </Card>
      )}
      {concerns.complaints.length > 0 && (
        <Card
          title="Customer complaints"
          subtitle="Formal complaints raised for this customer. The complaints team owns these; this is a view of them."
        >
          <ConcernTable
            rows={concerns.complaints}
            firstHeading="Complaint"
            secondHeading="Kind"
            testId="case-complaints"
          />
        </Card>
      )}
    </>
  );
}

/**
 * A complaint's status is Case Management's; a dispute's is DCP's own.
 *
 * Kept out of the `className` expression deliberately. A comparison inline there reads as a class
 * name to anything scanning the source — the style contract flagged `CustomerComplaint` as a
 * class with no rule behind it, which was fair.
 */
function concernTone(concern: ConcernRow['concern']): string {
  return concern === 'CustomerComplaint' ? 'pill info' : 'pill muted';
}

/** One concern list. The same shape twice, with different headings, never merged into one table. */
function ConcernTable({ rows, firstHeading, secondHeading, testId }: {
  rows: readonly ConcernRow[];
  firstHeading: string;
  secondHeading: string;
  testId: string;
}) {
  return (
    <table className="grid" data-testid={testId}>
      <thead>
        <tr>
          <th>{firstHeading}</th>
          <th>{secondHeading}</th>
          <th style={{ width: '130px' }}>Recorded</th>
          <th style={{ width: '220px' }}>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.key} data-testid={`concern-${row.concern}`} data-concern={row.concern}>
            <td>{row.heading}</td>
            <td>{row.detail}</td>
            <td>{row.recordedOn}</td>
            <td><span className={concernTone(row.concern)}>{row.status}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
