import type { HistoryEntry } from '@dcp/domain';
import type { FinancialUnit } from '../../data/customerAggregate.js';
import type { NextPlannedAction } from '../../data/customerNextActions.js';
import { BucketBadge, StatusBadge, statusBadgeTone } from '../../components/StatusBadge.js';
import { SectionBoundary, SkeletonLines, type SectionState } from '../../components/SectionBoundary.js';
import { formatCount } from '../../components/primitives.js';
import { describeDue, describeNext, useUnitTerm } from './FinancialUnitList.js';
import { OwnerLabel } from './OwnerLabel.js';

/**
 * The selected Loan Account or Facility and its Collection Case, as the platform records them.
 *
 * "Next Planned Action" is the next step of the case's Action Plan — never a recommendation. With no
 * open case the panel stays, says so, and shows only the unit's own DPD and bucket; it never shows
 * blank Case, Owner or Strategy rows. Open processes are listed as information, not as a contact hold.
 */
export function CollectionSummaryPanel({ unit, nextAction, nextActionsStatus, openProcesses, onRetryProcesses, onOpenActionPlan }: {
  unit: FinancialUnit | undefined;
  nextAction: NextPlannedAction | undefined;
  nextActionsStatus: SectionState<unknown>['status'];
  openProcesses: SectionState<readonly HistoryEntry[]>;
  onRetryProcesses: () => void;
  onOpenActionPlan: (caseId: string) => void;
}) {
  return (
    <section className="section-card c360-summary" aria-labelledby="c360-summary-title" data-testid="c360-summary">
      <h3 id="c360-summary-title">Collection Summary</h3>
      {unit ? <SummaryBody {...{ unit, nextAction, nextActionsStatus, openProcesses, onRetryProcesses, onOpenActionPlan }} /> : <p className="c360-empty">Select a Loan Account or Facility to see its collection summary.</p>}
    </section>
  );
}

function SummaryBody({ unit, nextAction, nextActionsStatus, openProcesses, onRetryProcesses, onOpenActionPlan }: {
  unit: FinancialUnit; nextAction: NextPlannedAction | undefined; nextActionsStatus: SectionState<unknown>['status'];
  openProcesses: SectionState<readonly HistoryEntry[]>; onRetryProcesses: () => void; onOpenActionPlan: (caseId: string) => void;
}) {
  const terms = useUnitTerm(unit);
  const hasPlan = Boolean(unit.case.strategyId);
  return (
    <>
      <p className="c360-summary-selected" data-testid="c360-summary-selected">
        <span className="c360-selected-tag">Selected</span> {unit.unitNumber}{unit.productDescription ? ` · ${unit.productDescription}` : ''}
      </p>
      {!unit.case.isOpen && <p className="c360-no-case" data-testid="c360-summary-no-case">No open Collection Case</p>}
      <dl className="c360-facts" data-testid="c360-summary-facts">
        {unit.case.isOpen && <Fact label="Collection Case" value={unit.case.caseNumber} />}
        {unit.case.isOpen && <Fact label="Status" value={<StatusBadge tone={statusBadgeTone(unit.case.status)}>{unit.case.status}</StatusBadge>} />}
        {unit.case.isOpen && <Fact label="Owner" value={<OwnerLabel ownerId={unit.case.ownerId} ownerName={unit.case.ownerName} />} />}
        {unit.case.isOpen && <Fact label={terms.noun} value={unit.unitNumber} />}
        <Fact label="Bucket" value={<BucketBadge bucket={unit.bucket} />} />
        <Fact label="DPD" value={formatCount(unit.dpd)} />
        {unit.case.isOpen && <Fact label="Strategy" value={unit.case.strategyName ?? 'Not resolved'} testId="c360-summary-strategy" />}
        {unit.case.isOpen && <Fact label="Next Planned Action" value={describeNext(nextAction, nextActionsStatus)} testId="c360-summary-next" />}
        {unit.case.isOpen && <Fact label="Due" value={describeDue(nextAction)} />}
      </dl>
      {unit.case.isOpen && <OpenProcesses state={openProcesses} onRetry={onRetryProcesses} />}
      {unit.case.isOpen && (
        <button
          type="button" className="btn" disabled={!hasPlan} title={hasPlan ? undefined : 'This case has no Action Plan: no strategy has been resolved for it.'}
          onClick={hasPlan ? () => onOpenActionPlan(unit.case.id) : undefined} aria-label={`Open Action Plan for case ${unit.case.caseNumber}`} data-testid="c360-open-plan"
        >Open Action Plan</button>
      )}
      {unit.case.isOpen && !hasPlan && <p className="c360-hint" data-testid="c360-no-plan-reason">No Action Plan: no strategy has been resolved for this case.</p>}
    </>
  );
}

function Fact({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) {
  return <div className="c360-fact" data-testid={testId}><dt>{label}</dt><dd>{value}</dd></div>;
}

function OpenProcesses({ state, onRetry }: { state: SectionState<readonly HistoryEntry[]>; onRetry: () => void }) {
  return (
    <div className="c360-processes" data-testid="c360-open-processes">
      <h4>Open processes on this case</h4>
      <SectionBoundary label="Open processes" state={state} onRetry={onRetry} skeleton={<SkeletonLines lines={2} />} testId="c360-processes">
        {entries => entries.length === 0
          ? <p className="c360-hint">None open. Shown for information; it does not restrict contact.</p>
          : (
            <ul className="c360-process-list">
              {entries.map(entry => (
                <li key={entry.id}>
                  <StatusBadge tone={entry.externalReference ? 'referral' : 'info'}>{processLabel(entry)}</StatusBadge> {entry.subject}
                </li>
              ))}
            </ul>
          )}
      </SectionBoundary>
    </div>
  );
}

function processLabel(entry: HistoryEntry): string {
  if (entry.category === 'complaint') return 'Complaint / Dispute';
  if (entry.category === 'legal') return 'Legal';
  return 'Deceased / Insurance';
}
