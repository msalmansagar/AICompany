import { useEffect, useState } from 'react';
import {
  explainLegalWait, litigationExists, type LegalWorkState, type LegalWorkStateName,
} from '@dcp/domain';
import { describeFailure } from '../platform/errors.js';
import { findLegalTypeId, loadCaseLegalTraces, type LegalTraceRow } from '../data/caseLegalTraces.js';
import { useActivityTypeId, useConcludability } from '../data/useConcludability.js';
import { Card, Icon } from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';

/**
 * What QDB's Legal process says about this case.
 *
 * **A read-only window onto another process.** There is no control here that starts, advances,
 * approves, settles, closes, reassigns or escalates a Litigation Request — Legal owns its
 * lifecycle, and the Collection Workspace is not a second Legal application.
 *
 * There is also, deliberately, **no "Send to Legal" control**. WP9 proved a hand-off is technically
 * possible; nothing has established what qualifies a recommendation for one. A button here would
 * settle that question by shipping.
 *
 * The distinction the card exists to preserve is between *no Litigation Request* and *a Litigation
 * Request you cannot see*. On this organisation the second is what a real Collection Officer gets,
 * because no DCP security role holds read permission on the Legal entity.
 */
export function CaseLegalTrace({ caseId, episodeNumber, customer }: {
  caseId: string;
  episodeNumber?: number | undefined;
  /** The case's own customer. An account resolves for Legal; a contact does not (KI-108). */
  customer?: { table?: 'account' | 'contact'; id?: string } | undefined;
}) {
  const { adapter } = useCrmSession();
  const [rows, setRows] = useState<readonly LegalTraceRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const concluding = useConcludability(adapter, useActivityTypeId(adapter, findLegalTypeId));

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setRows([]);
    loadCaseLegalTraces(adapter, caseId, episodeNumber, customer ?? {})
      .then(result => { if (!cancelled) { setRows(result); setState('ready'); } })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(describeFailure(failure));
        setState('error');
      });
    // Cancelling on a case change is what stops a slow read painting the previous case's Legal
    // information over the new one.
    return () => { cancelled = true; };
  }, [adapter, caseId, episodeNumber, customer?.table, customer?.id]);

  if (state === 'loading') {
    return <div className="empty-state" data-testid="legal-loading">Loading Legal…</div>;
  }
  if (state === 'error') {
    return (
      <Card title="Legal">
        <div className="info-banner bad" data-testid="legal-error">
          <Icon name="warn" />
          <div><b>Legal information could not be read.</b><p>{error}</p></div>
        </div>
      </Card>
    );
  }
  if (rows.length === 0) return null;

  return (
    <Card
      title="Legal"
      subtitle="What the Legal process records for this case. Legal owns these requests; this is a view of them."
    >
      <table className="grid" data-testid="case-legal">
        <thead>
          <tr>
            <th>Legal recommendation</th>
            <th style={{ width: '120px' }}>Recorded</th>
            <th style={{ width: '150px' }}>With</th>
            <th style={{ width: '180px' }}>Raised by</th>
            <th style={{ width: '250px' }}>Legal hand-off</th>
            <th style={{ width: '240px' }}>Legal request</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} data-testid={`legal-row-${row.key}`}
              data-current={String(row.trace.isCurrent)}
              data-handoff-available={String(row.trace.handoffAvailable)}>
              <td>
                {row.recommendation}
                <span className="cell-sub">{row.activityStatus}</span>
              </td>
              <td>{row.recordedOn}</td>
              <td>{row.ownerName}</td>
              <td>{row.origin}</td>
              <td><span className={legalTone(row.trace.state)}>{row.trace.label}</span></td>
              <td><LitigationCell trace={row.trace} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <LegalWaits rows={rows} />
      {!concluding.available && (
        <div className="info-banner" data-testid="legal-conclude-unavailable">
          <Icon name="info" />
          <div>
            {concluding.reason} A Legal recommendation stays open until QDB configures what
            concluding one means.
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * What the blocked recommendations on this case are waiting on — once per reason, not once per row.
 *
 * Deliberately text, not a control. Nothing an officer does here moves either wait, and the
 * sentence says who does.
 */
function LegalWaits({ rows }: { rows: readonly LegalTraceRow[] }) {
  const waits = [...new Set(rows.map(row => row.trace.state))]
    .flatMap(state => {
      const explanation = explainLegalWait(state);
      return explanation ? [{ state, explanation }] : [];
    });
  return (
    <>
      {waits.map(({ state, explanation }) => (
        <div key={state} className="info-banner" data-testid={`legal-wait-${state}`}>
          <Icon name="info" />
          <div>{explanation}</div>
        </div>
      ))}
    </>
  );
}

/**
 * The Litigation Request's own details, or an honest blank.
 *
 * The status shown is the Legal process's own label, passed through from the platform. Nothing
 * here maps, groups or re-interprets it — a second copy of Legal's 25 stages would drift the first
 * time Legal added one.
 */
function LitigationCell({ trace }: { trace: LegalWorkState }) {
  if (!trace.litigation) {
    return <span className="pill muted">{litigationExists(trace.state) ? 'Not shown' : '—'}</span>;
  }
  const { reference, status, customerName } = trace.litigation;
  return (
    <>
      <b>{reference}</b>
      <span className="cell-sub">{status ?? 'Status not recorded'}</span>
      {customerName && <span className="cell-sub">{customerName}</span>}
    </>
  );
}

/**
 * Colour follows meaning, and "cannot be seen" is not "does not exist".
 *
 * An inaccessible request is deliberately not muted like an absent one: muting it would make the
 * most dangerous state on this screen look like the most ordinary.
 */
function legalTone(state: LegalWorkStateName): string {
  if (state === 'LitigationVisible' || state === 'ReadyForHandoff') return 'pill ok';
  if (state === 'LitigationNotVisible' || state === 'LitigationLinkBroken'
    || state === 'LitigationUnavailable') return 'pill warn';
  if (state === 'CustomerResolutionRequired' || state === 'QualificationPending') return 'pill info';
  return 'pill muted';
}
