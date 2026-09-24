import { useEffect, useState } from 'react';
import type { DeceasedReviewRow } from '@dcp/domain';
import { describeFailure } from '../platform/errors.js';
import { findDeceasedTypeId, loadDeceasedReviewRow, recordDeceasedReview } from '../data/deceasedQueries.js';
import { useActivityTypeId, useConcludability } from '../data/useConcludability.js';
import { Card, Icon, InfoBanner } from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';

/**
 * The QCB deceased indication, and whether anyone has reviewed it.
 *
 * **It never says a customer is deceased.** The indication arrives from the Qatar Central Bank
 * through the MIS extract, and nothing establishes whether it means a verified death, a reported
 * one, or an operational marker (KI-124). So the card says *verification required* and shows who,
 * if anyone, is looking — which is all DCP actually knows.
 *
 * **There is no insurance here.** The configured activity type is labelled *Deceased / Insurance*,
 * but WP15 found no credit-life, death-benefit or mortgage-protection process anywhere; the claims
 * entities that exist are credit guarantees and trade insurance, a different product family
 * (KI-125). The word in the label is not evidence, and nothing on this card names a policy, an
 * insurer, a claim or an eligibility.
 *
 * **Seeing it changes nothing.** No collection is paused, no message suppressed, no Legal touched,
 * no delinquency altered and no case closed — every one of those is an open QDB policy question
 * (KI-127), and the card is a view, not a trigger.
 */
export function CaseDeceasedReview({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const [row, setRow] = useState<DeceasedReviewRow | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [reload, setReload] = useState(0);
  // Resolved by code, once, and used both to start a review and to ask whether one could ever
  // be concluded. The same question every advanced-process card asks (KI-131).
  const deceasedTypeId = useActivityTypeId(adapter, findDeceasedTypeId);
  const concluding = useConcludability(adapter, deceasedTypeId);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setRow(null);
    loadDeceasedReviewRow(adapter, caseId)
      .then(result => { if (!cancelled) { setRow(result); setState('ready'); } })
      .catch((failure: unknown) => {
        if (cancelled) return;
        setError(describeFailure(failure));
        setState('error');
      });
    // Cancelling on a case change is what stops a slow read painting one case's indication over
    // another's — the most dangerous stale value on this screen.
    return () => { cancelled = true; };
  }, [adapter, caseId, reload]);

  /**
   * Starts the review, and asks the card to read itself again.
   *
   * The write is idempotent at a derived id, so a second click — or two officers at once — reaches
   * the same record and the platform refuses the duplicate. Nothing is assumed about the outcome:
   * the card re-reads rather than patching its own state from what it hoped happened.
   */
  const startReview = async (facilityNumber: string): Promise<void> => {
    setStarting(true);
    try {
      const activityTypeId = deceasedTypeId ?? await findDeceasedTypeId(adapter);
      if (!activityTypeId) {
        setError('No activity type is configured for deceased reviews, so one cannot be recorded.');
        setState('error');
        return;
      }
      await recordDeceasedReview(adapter, { caseId, facilityNumber, activityTypeId });
      setReload(previous => previous + 1);
    } catch (failure: unknown) {
      setError(describeFailure(failure));
      setState('error');
    } finally {
      setStarting(false);
    }
  };

  if (state === 'loading') {
    return <div className="empty-state" data-testid="deceased-loading">Loading…</div>;
  }
  if (state === 'error') {
    return (
      <Card title="Deceased review">
        <div className="info-banner bad" data-testid="deceased-error">
          <Icon name="warn" />
          <div><b>This could not be read.</b><p>{error}</p></div>
        </div>
      </Card>
    );
  }
  // Nothing to show where there is no indication and no review. An empty card would imply the
  // question had been asked and answered.
  if (!row || row.state === 'NoIndication') return null;

  return (
    <Card
      title="Deceased review"
      subtitle="An indication from the Qatar Central Bank that needs checking. It changes nothing about collection by itself."
    >
      <table className="grid" data-testid="case-deceased">
        <thead>
          <tr>
            <th>Indication</th>
            <th style={{ width: '230px' }}>Source</th>
            <th style={{ width: '110px' }}>As of</th>
            <th style={{ width: '160px' }}>Review</th>
            <th style={{ width: '150px' }}>With</th>
            <th style={{ width: '190px' }}>Outcome</th>
          </tr>
        </thead>
        <tbody>
          <tr data-testid="deceased-row" data-state={row.state}
            data-can-start-review={String(row.canStartReview)}>
            <td>{row.indication}</td>
            <td>{row.source}</td>
            <td>{row.asOf}</td>
            <td><span className={deceasedTone(row.state)}>{row.label}</span></td>
            <td>{row.ownerName}</td>
            <td>{row.reviewOutcome}</td>
          </tr>
        </tbody>
      </table>
      {row.canStartReview && row.facilityNumber && (
        <div className="row-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="deceased-start-review"
            disabled={starting}
            onClick={() => { void startReview(row.facilityNumber!); }}
          >
            {starting ? 'Recording…' : 'Record deceased review'}
          </button>
        </div>
      )}
      {row.state === 'UnderReview' && !concluding.available && (
        <div className="info-banner" data-testid="deceased-conclude-unavailable">
          <Icon name="info" />
          <div>
            {concluding.reason} A review stays open until QDB configures what concluding one
            means.
          </div>
        </div>
      )}
      <InfoBanner>
        Check who this customer is with before contacting them. There is no agreed handling rule
        for this indication yet, so collection, messages and legal action are unchanged. Recording
        a review says someone is checking — never that the customer has died.
      </InfoBanner>
    </Card>
  );
}

/**
 * Tone follows how settled the question is.
 *
 * An unreviewed indication is deliberately **not** muted: it is the state that most needs an
 * officer to stop and check, and muting it would make it look like housekeeping.
 */
function deceasedTone(state: DeceasedReviewRow['state']): string {
  if (state === 'AwaitingReview') return 'pill warn';
  if (state === 'UnderReview') return 'pill info';
  if (state === 'ReviewRecorded') return 'pill ok';
  return 'pill muted';
}
