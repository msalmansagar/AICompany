import type { PtpRow } from '../../data/caseQueries.js';
import type { ResolutionProcess, ResolutionStatus } from '../../data/caseWorkPlan.js';
import { formatDay } from '../../components/primitives.js';

/**
 * Complaint / Dispute, Legal and Deceased / Insurance on this case, in one compact list.
 *
 * Each process belongs to the system that runs it — Case Management, Legal, the deceased review —
 * so this says only what DCP has recorded: nothing ("Not initiated"), what is open with its stored
 * reference, or that earlier records are closed. Acting on a process is in the Resolution tab.
 */
const LABELS: Readonly<Record<ResolutionProcess, string>> = {
  complaint: 'Complaint / Dispute',
  legal: 'Legal',
  deceased: 'Deceased / Insurance',
};

export function CaseResolutionPanel({ statuses, onOpenResolution }: { statuses: readonly ResolutionStatus[]; onOpenResolution: () => void }) {
  return (
    <section className="section-card cw-resolution" aria-labelledby="cw-resolution-title" data-testid="cw-resolution">
      <div className="c360-section-head">
        <h3 id="cw-resolution-title">Resolution</h3>
        <button type="button" className="btn-link" onClick={onOpenResolution} data-testid="cw-resolution-open">Details</button>
      </div>
      <dl className="cw-resolution-list">
        {statuses.map(status => (
          <div key={status.process} data-testid={`cw-resolution-${status.process}`}>
            <dt>{LABELS[status.process]}</dt>
            <dd>{describe(status)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function describe(status: ResolutionStatus): string {
  const open = status.open[0];
  if (open) return `Open · ${open.subject}${reference(open)} · ${formatDay(open.createdOn)}`;
  if (status.recorded.length > 0) return `${status.recorded.length} recorded, none open`;
  return 'Not initiated';
}

function reference(activity: PtpRow): string {
  const number = activity.externalReference?.recordNumber;
  return number ? ` · ref ${number}` : '';
}
