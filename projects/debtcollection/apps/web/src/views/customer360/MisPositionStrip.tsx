/**
 * Where the financial figures come from, in exactly one state, derived from what is real.
 *
 *   Stored         — the last synchronised MIS position; no current position was retrieved.
 *   Live           — a read-only retrieval just now (only when a live adapter exists).
 *   Fallback       — a live retrieval was tried and failed; the stored position is shown.
 *   Not available  — no stored position, and no live retrieval.
 *
 * This workspace has no live MIS adapter (KI-53), so it produces Stored or Not available, and no
 * Retrieve button is offered. The age is counted from the dates themselves; no threshold is
 * applied and nothing is called stale.
 */
export type MisPositionState =
  | { kind: 'stored'; asOf: string; recordedOn?: string | undefined }
  | { kind: 'live'; retrievedOn: string }
  | { kind: 'fallback'; asOf: string; lastSuccessOn?: string | undefined }
  | { kind: 'unavailable' };

export function misStateFromStored(asOf: string | undefined, recordedOn: string | undefined): MisPositionState {
  return asOf ? { kind: 'stored', asOf, recordedOn } : { kind: 'unavailable' };
}

const QATAR_DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Qatar' });
const QATAR_MOMENT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Qatar' });
const DAY_MS = 86_400_000;

/** Whole days between the as-of date and today in Asia/Qatar. */
export function daysSince(iso: string, now: Date = new Date()): number | undefined {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return undefined;
  const dayOf = (date: Date) => Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Qatar' }).format(date));
  return Math.round((dayOf(now) - dayOf(at)) / DAY_MS);
}

function describeAge(iso: string, now?: Date): string {
  const days = daysSince(iso, now);
  if (days === undefined) return '';
  if (days === 0) return ' (today)';
  return days === 1 ? ' (1 day ago)' : ` (${days} days ago)`;
}

const day = (iso: string) => (Number.isNaN(Date.parse(iso)) ? '—' : QATAR_DAY.format(new Date(iso)));
const moment = (iso: string | undefined) => (iso && !Number.isNaN(Date.parse(iso)) ? QATAR_MOMENT.format(new Date(iso)) : 'not recorded');

export function MisPositionStrip({ state, onRetrieve, now }: { state: MisPositionState; onRetrieve?: (() => void) | undefined; now?: Date }) {
  return (
    <section className={`c360-mis ${state.kind}`} role="status" aria-label="MIS position" data-testid="c360-mis" data-state={state.kind}>
      <span className="c360-mis-tag">{TAGS[state.kind]}</span>
      <span className="c360-mis-text">{describe(state, now)}</span>
      {onRetrieve && state.kind !== 'live' && <button type="button" className="btn" onClick={onRetrieve} data-testid="c360-mis-retrieve">Retrieve current MIS position</button>}
    </section>
  );
}

const TAGS: Readonly<Record<MisPositionState['kind'], string>> = {
  stored: 'Stored MIS position', live: 'Live MIS position', fallback: 'Live MIS unavailable', unavailable: 'MIS position not available',
};

function describe(state: MisPositionState, now?: Date): string {
  switch (state.kind) {
    case 'stored': return `As of ${day(state.asOf)}${describeAge(state.asOf, now)} · Recorded ${moment(state.recordedOn)} · Current MIS position has not been retrieved.`;
    case 'live': return `Retrieved ${moment(state.retrievedOn)} (Asia/Qatar) · Read-only retrieval. Cases, snapshots and activities are not updated.`;
    case 'fallback': return `Last successful MIS position ${moment(state.lastSuccessOn)} · As of ${day(state.asOf)}${describeAge(state.asOf, now)}`;
    default: return 'No stored MIS position, and live MIS is not available.';
  }
}
