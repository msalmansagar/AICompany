import { useState, type KeyboardEvent } from 'react';
import type { FinancialUnit, PortfolioSummary } from '../../data/customerAggregate.js';
import type { NextPlannedAction } from '../../data/customerNextActions.js';
import { financialUnitTerms, financialUnitsHeading, type FinancialUnitTerms } from '../../data/financialUnit.js';
import { BucketBadge, StatusBadge, statusBadgeTone } from '../../components/StatusBadge.js';
import type { SectionState } from '../../components/SectionBoundary.js';
import { BucketBar, OrgBadge, formatCount, formatMoney } from '../../components/primitives.js';
import { OwnerLabel } from '../../components/OwnerLabel.js';

/** Rows rendered at a time; more are added on request, so the list never grows the DOM unbounded. */
export const UNIT_PAGE = 10;

/** The terms a unit is spoken of in — Loan Account for HL, Facility for BFD, never the other way. */
export function useUnitTerm(unit: Pick<FinancialUnit, 'organization'>): FinancialUnitTerms {
  return financialUnitTerms(unit.organization);
}

export const unitKey = (unit: Pick<FinancialUnit, 'sourceSystem' | 'unitNumber'>) => `${unit.sourceSystem}|${unit.unitNumber}`;

export interface UnitCommands {
  onSelect: (key: string) => void;
  onOpenCase: (caseId: string) => void;
  onLogAction: (unit: FinancialUnit) => void;
  onCapturePromise: (unit: FinancialUnit) => void;
}

/**
 * The customer's Loan Accounts and/or Facilities, most days past due first. Every unit is
 * selectable — with or without a case — by mouse or by Enter/Space, and the selection drives the
 * Collection Summary and the Delinquency History beside it without re-reading the screen.
 */
export function FinancialUnitList({ units, portfolio, nextActions, selectedKey, commands }: {
  units: readonly FinancialUnit[];
  portfolio: PortfolioSummary | undefined;
  nextActions: SectionState<ReadonlyMap<string, NextPlannedAction>>;
  selectedKey: string | undefined;
  commands: UnitCommands;
}) {
  const [shown, setShown] = useState(UNIT_PAGE);
  const isCrossSource = new Set(units.map(unit => unit.kind)).size > 1;
  const heading = financialUnitsHeading(units.map(unit => unit.kind));
  return (
    <section className="section-card c360-units-card" aria-labelledby="c360-units-title" data-testid="c360-units-card">
      <div className="c360-section-head">
        <h3 id="c360-units-title">{heading}</h3>
        <span className="c360-portfolio" data-testid="c360-portfolio">{describePortfolio(portfolio, units, isCrossSource)}</span>
      </div>
      {!portfolio && <p className="c360-hint" data-testid="c360-units-partial">This customer has more cases than one read returns, so the units below are those read.</p>}
      {units.length === 0 && <p className="c360-empty" data-testid="c360-units-empty">No Loan Account or Facility is recorded for this customer.</p>}
      <ul className="c360-unit-list" role="listbox" aria-label={heading} data-testid="c360-units">
        {units.slice(0, shown).map(unit => (
          <FinancialUnitRow
            key={unitKey(unit)} unit={unit} isCrossSource={isCrossSource} isSelected={unitKey(unit) === selectedKey}
            nextAction={nextActions.status === 'ready' ? nextActions.data.get(unit.case.id) : undefined}
            nextActionsState={nextActions.status} commands={commands}
          />
        ))}
      </ul>
      {units.length > shown && (
        <button type="button" className="btn c360-more" onClick={() => setShown(count => count + UNIT_PAGE)} data-testid="c360-units-more">
          Show {Math.min(UNIT_PAGE, units.length - shown)} more of {units.length - shown}
        </button>
      )}
    </section>
  );
}

/** "7 Loan Accounts · 3 open cases · 3 delinquent · 4 current" — whole-portfolio counts or nothing. */
function describePortfolio(portfolio: PortfolioSummary | undefined, units: readonly FinancialUnit[], isCrossSource: boolean): string {
  if (!portfolio) return `${formatCount(units.length)} read · counts not available for a partial portfolio`;
  const noun = isCrossSource ? 'units' : units[0]?.kind === 'facility' ? 'Facilities' : 'Loan Accounts';
  const nounFor = (count: number) => (count === 1 ? noun.replace(/ies$/, 'y').replace(/s$/, '').replace(/^unit$/, 'unit') : noun);
  return [
    `${portfolio.units} ${nounFor(portfolio.units)}`,
    `${portfolio.openCases} open ${portfolio.openCases === 1 ? 'case' : 'cases'}`,
    `${portfolio.pastDue} delinquent`,
    `${portfolio.current} current`,
  ].join(' · ');
}

function FinancialUnitRow({ unit, isCrossSource, isSelected, nextAction, nextActionsState, commands }: {
  unit: FinancialUnit; isCrossSource: boolean; isSelected: boolean;
  nextAction: NextPlannedAction | undefined; nextActionsState: SectionState<unknown>['status']; commands: UnitCommands;
}) {
  const terms = useUnitTerm(unit);
  const select = () => commands.onSelect(unitKey(unit));
  const onKeyDown = (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); }
  };
  return (
    <li
      role="option" aria-selected={isSelected} tabIndex={0} onClick={select} onKeyDown={onKeyDown}
      className={isSelected ? 'c360-unit selected' : 'c360-unit'} data-testid="c360-unit" data-unit={unit.unitNumber} data-kind={unit.kind}
      aria-label={`${terms.noun} ${unit.unitNumber}`}
    >
      <div className="c360-unit-line">
        <BucketBar bucket={unit.bucket} />
        <span className="c360-unit-title">{unit.productDescription ?? terms.noun}</span>
        <span className="c360-unit-number" data-testid="c360-unit-number">{terms.noun} {unit.unitNumber}</span>
        {isCrossSource && <OrgBadge org={unit.organization} />}
        {isSelected && <span className="c360-selected-tag" data-testid="c360-unit-selected">Selected</span>}
      </div>
      <dl className="c360-metrics" data-testid="c360-unit-position">
        <Metric label={terms.balanceLabel} value={formatMoney(unit.loanBalance)} />
        <Metric label="Overdue" value={formatMoney(unit.totalArrears)} />
        <Metric label="DPD" value={formatCount(unit.dpd)} />
        <div className="c360-metric"><dt>Bucket</dt><dd><BucketBadge bucket={unit.bucket} /></dd></div>
      </dl>
      {unit.case.isOpen
        ? <CaseLine unit={unit} terms={terms} nextAction={nextAction} nextActionsState={nextActionsState} commands={commands} />
        : <p className="c360-no-case" data-testid="c360-unit-no-case">No open Collection Case</p>}
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="c360-metric"><dt>{label}</dt><dd>{value}</dd></div>;
}

function CaseLine({ unit, terms, nextAction, nextActionsState, commands }: {
  unit: FinancialUnit; terms: FinancialUnitTerms; nextAction: NextPlannedAction | undefined;
  nextActionsState: SectionState<unknown>['status']; commands: UnitCommands;
}) {
  const stop = (run: () => void) => (event: { stopPropagation: () => void }) => { event.stopPropagation(); run(); };
  const unitName = `${terms.noun} ${unit.unitNumber}`;
  return (
    <div className="c360-case-line" data-testid="c360-unit-case-line">
      <span className="c360-case-ref">
        <span data-testid="c360-unit-case">{unit.case.caseNumber}</span>
        <StatusBadge tone={statusBadgeTone(unit.case.status)}>{unit.case.status}</StatusBadge>
      </span>
      <span className="c360-case-meta">Owner <OwnerLabel ownerId={unit.case.ownerId} ownerName={unit.case.ownerName} /></span>
      <span className="c360-case-meta" data-testid="c360-next">Next {describeNext(nextAction, nextActionsState)}</span>
      <span className="c360-case-actions">
        <button type="button" className="btn primary" onClick={stop(() => commands.onOpenCase(unit.case.id))} aria-label={`Open case ${unit.case.caseNumber} for ${unitName}`} data-testid="c360-unit-open">Open case</button>
        <button type="button" className="btn" onClick={stop(() => commands.onLogAction(unit))} aria-label={`Log action on ${unitName}, case ${unit.case.caseNumber}`} data-testid="c360-unit-log-action">+ Log action</button>
        <button type="button" className="btn" onClick={stop(() => commands.onCapturePromise(unit))} aria-label={`Capture PTP on ${unitName}, case ${unit.case.caseNumber}`} data-testid="c360-unit-capture-ptp">Capture PTP</button>
      </span>
    </div>
  );
}

/** The two empty states are kept apart: no plan at all, or a plan with no next step. */
export function describeNext(next: NextPlannedAction | undefined, status: SectionState<unknown>['status']): string {
  if (status === 'loading') return '…';
  if (status === 'error' || !next) return 'Not available';
  if (next.kind === 'noPlan') return 'No Action Plan';
  if (next.kind === 'notConfigured') return 'Not configured';
  // The plan gives a date, or a statement that there is none; only a date takes the word "due".
  return hasDueDate(next.item.due) ? `${next.item.action} · due ${next.item.due}` : `${next.item.action} (no due date)`;
}

/**
 * The plan's due value is a formatted date, or a sentence saying none could be worked out (no start
 * rule is configured yet, KI-101). Only a date is shown as one; the sentence becomes "Not set yet".
 */
export function hasDueDate(due: string): boolean {
  return /^\d/.test(due);
}

export function describeDue(next: NextPlannedAction | undefined): string {
  if (next?.kind !== 'planned') return '—';
  return hasDueDate(next.item.due) ? next.item.due : 'Not set yet';
}
