import type { PtpRow } from '../../data/caseQueries.js';
import { PromiseOutcome, formatDay, formatMoney } from '../../components/primitives.js';

/**
 * The promise in force on this case, and the few before it.
 *
 * Every status is what an officer recorded — not a verified payment (no MIS payment contract yet).
 * View opens the promise in its own pane, where the update the promise's state allows is offered;
 * Capture PTP stays on the action bar. The full list is the Promises tab.
 */
const RECENT_SHOWN = 3;

export function CasePromisePanel({ current, promises, onView, onOpenAll }: {
  current: { promise: PtpRow; isOpen: boolean } | undefined;
  promises: readonly PtpRow[];
  onView: (promiseId: string) => void;
  onOpenAll: () => void;
}) {
  const earlier = promises.filter(promise => promise.id !== current?.promise.id).slice(0, RECENT_SHOWN);
  return (
    <section className="section-card cw-ptp" aria-labelledby="cw-ptp-title" data-testid="cw-ptp">
      <div className="c360-section-head">
        <h3 id="cw-ptp-title">Promise to Pay</h3>
        {promises.length > 0 && <button type="button" className="btn-link" onClick={onOpenAll} data-testid="cw-ptp-all">All promises ({promises.length})</button>}
      </div>
      {current ? <CurrentPromise current={current} onView={onView} /> : <p className="c360-empty" data-testid="cw-ptp-none">No promise has been recorded on this case.</p>}
      {earlier.length > 0 && (
        <ul className="cw-ptp-earlier" data-testid="cw-ptp-earlier">
          {earlier.map(promise => (
            <li key={promise.id}>
              <span>{formatMoney(promise.promisedAmount)} · {formatDay(promise.ptpDate)}</span>
              <PromiseOutcome status={promise.ptpStatus} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CurrentPromise({ current, onView }: { current: { promise: PtpRow; isOpen: boolean }; onView: (promiseId: string) => void }) {
  const { promise, isOpen } = current;
  return (
    <div className="cw-ptp-current" data-testid="cw-ptp-current">
      <p className="cw-ptp-label">{isOpen ? 'Current promise' : 'Latest promise'}</p>
      <p className="cw-ptp-amount">{formatMoney(promise.promisedAmount)}</p>
      <p>Due {formatDay(promise.ptpDate)} <PromiseOutcome status={promise.ptpStatus} /></p>
      <button type="button" className="btn" onClick={() => onView(promise.id)} data-testid="cw-ptp-view">View</button>
    </div>
  );
}
