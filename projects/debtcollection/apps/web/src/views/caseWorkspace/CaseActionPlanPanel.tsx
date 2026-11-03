import type { GroupedWork, PlanWorkItem, WorkGroup } from '../../data/caseWorkPlan.js';
import { COMPLETED_SHOWN } from '../../data/caseWorkPlan.js';
import { formatDay } from '../../components/primitives.js';
import { OwnerLabel } from '../../components/OwnerLabel.js';

/**
 * The case's Action Plan, by when: overdue, today, upcoming, completed.
 *
 * The lines are the existing plan — planned actions from the case's strategy and the follow-ups
 * officers set — grouped by the date each record carries. Open work offers Complete in place. The
 * full plan, with provenance and unattributed history, stays on the Action Plan tab.
 */
const GROUPS: readonly { id: WorkGroup; label: string; marker: string }[] = [
  { id: 'overdue', label: 'Overdue', marker: '●' },
  { id: 'today', label: 'Today', marker: '●' },
  { id: 'upcoming', label: 'Upcoming', marker: '○' },
  { id: 'completed', label: `Completed (latest ${COMPLETED_SHOWN})`, marker: '✓' },
];

export function CaseActionPlanPanel({ groups, canWrite, onComplete, onOpenFullPlan }: {
  groups: GroupedWork;
  canWrite: boolean;
  onComplete: (activityId: string) => void;
  onOpenFullPlan: () => void;
}) {
  const isEmpty = GROUPS.every(group => groups[group.id].length === 0);
  return (
    <section className="section-card cw-plan" aria-labelledby="cw-plan-title" data-testid="cw-plan">
      <div className="c360-section-head">
        <h3 id="cw-plan-title">Action Plan</h3>
        <button type="button" className="btn-link" onClick={onOpenFullPlan} data-testid="cw-plan-full">Full plan</button>
      </div>
      {isEmpty && <p className="c360-empty" data-testid="cw-plan-empty">Nothing is planned or due on this case.</p>}
      {GROUPS.filter(group => groups[group.id].length > 0).map(group => (
        <div key={group.id} className={`cw-plan-group ${group.id}`} data-testid={`cw-plan-${group.id}`}>
          <h4>{group.label}</h4>
          <ul>
            {groups[group.id].map(item => (
              <PlanLine key={item.key} item={item} marker={group.marker} onComplete={canWrite && group.id !== 'completed' ? onComplete : undefined} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function PlanLine({ item, marker, onComplete }: { item: PlanWorkItem; marker: string; onComplete: ((activityId: string) => void) | undefined }) {
  const activityId = item.activityId;
  return (
    <li className="cw-plan-line" data-testid="cw-plan-line">
      <span className="cw-plan-marker" aria-hidden="true">{marker}</span>
      <span className="cw-plan-title">
        {item.title}
        <span className="cw-plan-detail">
          {item.detail}{item.owner && <> · <OwnerLabel ownerId={item.owner.id} ownerName={item.owner.name} /></>}
        </span>
      </span>
      <span className="cw-plan-date">{item.dateIso ? formatDay(item.dateIso) : 'No date'}</span>
      {onComplete && activityId && (
        <button type="button" className="btn" onClick={() => onComplete(activityId)} aria-label={`Complete ${item.title}`} data-testid="cw-plan-complete">Complete</button>
      )}
    </li>
  );
}
