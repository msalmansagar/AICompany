import { useCallback, useMemo, useState } from 'react';
import { loadCustomerAggregate, type CustomerAggregate, type FinancialUnit } from '../data/customerAggregate.js';
import { describeFinancialUnit } from '../data/financialUnit.js';
import { SectionBoundary, SkeletonLines, useSectionData } from '../components/SectionBoundary.js';
import { useCrmSession } from '../shell/context.js';
import { CaseCommandDialogs, type CaseCommandDialog } from './CaseCommandDialogs.js';
import { CustomersView } from './CustomersView.js';
import { CollectionHistoryTimeline } from './customer360/CollectionHistoryTimeline.js';
import { CollectionSummaryPanel } from './customer360/CollectionSummaryPanel.js';
import { ContactPreferences } from './customer360/ContactPreferences.js';
import { CollectionKpiStrip, CustomerHeader } from './customer360/CustomerHeader.js';
import { CustomerLogActionButton } from './customer360/CustomerLogAction.js';
import { DelinquencyHistory } from './customer360/DelinquencyHistory.js';
import { FinancialUnitList, unitKey } from './customer360/FinancialUnitList.js';
import { BalancesAsOf } from '../components/BalancesAsOf.js';
import { formatWithShortMonths } from '../components/shortMonths.js';
import { useCustomer360Sections } from './customer360/useCustomer360Sections.js';

/**
 * Customer 360 — one customer's collection position, as a read model over records that exist.
 *
 * Shared by V1 and V2 (V2 hosts it inside its frame); there is one implementation of the content,
 * the reads and the actions. HL customers are CRM contacts with Loan Accounts; BFD customers are CRM
 * accounts with Facilities; a Loan Account is never called a Facility. Nothing here is a master,
 * a workflow or a Rule Engine decision, and nothing here writes: the figures are the last stored MIS
 * position, labelled as such, and viewing the screen changes no collection state.
 */
export function Customer360View({ customerBusinessId, onOpenCase, onOpenActionPlan, onOpenCustomer }: {
  customerBusinessId?: string | undefined;
  onOpenCase?: (caseId: string) => void;
  /** Opens the case on its Action Plan; falls back to the case itself where a host has no such tab. */
  onOpenActionPlan?: (caseId: string) => void;
  onOpenCustomer?: (customerBusinessId: string) => void;
}) {
  if (!customerBusinessId) {
    return <CustomersView onOpenCustomer={id => onOpenCustomer?.(id)} onOpenCase={id => onOpenCase?.(id)} />;
  }
  const navigation: CaseNavigation = {
    onOpenCase: id => onOpenCase?.(id),
    onOpenActionPlan: id => (onOpenActionPlan ?? onOpenCase)?.(id),
  };
  return <Customer360Page customerBusinessId={customerBusinessId} navigation={navigation} />;
}

/** Where Customer 360 can send the officer: the case itself, or straight to its Action Plan. */
interface CaseNavigation {
  onOpenCase: (caseId: string) => void;
  onOpenActionPlan: (caseId: string) => void;
}

function Customer360Page({ customerBusinessId, navigation }: { customerBusinessId: string; navigation: CaseNavigation }) {
  const { adapter } = useCrmSession();
  const [reloadKey, setReloadKey] = useState(0);
  const customer = useSectionData(() => loadCustomerAggregate(adapter, customerBusinessId), [adapter, customerBusinessId, reloadKey]);
  return (
    <div className="c360" data-testid="view-customer" data-customer-id={customerBusinessId}>
      <SectionBoundary label="The customer" state={customer.state} onRetry={customer.retry} skeleton={<SkeletonLines lines={4} height={20} />} testId="c360-customer">
        {aggregate => aggregate.cases.length === 0
          ? <p className="c360-empty section-card" data-testid="c360-no-cases">No Collection Case names customer {customerBusinessId}, so there is nothing to show.</p>
          : <Customer360Content aggregate={aggregate} reloadKey={reloadKey} onSaved={() => setReloadKey(key => key + 1)} navigation={navigation} />}
      </SectionBoundary>
    </div>
  );
}

function Customer360Content({ aggregate, reloadKey, onSaved, navigation }: {
  aggregate: CustomerAggregate; reloadKey: number; onSaved: () => void; navigation: CaseNavigation;
}) {
  const { onOpenCase } = navigation;
  const [selectedKey, setSelectedKey] = useState<string | undefined>(() => (aggregate.financialUnits[0] ? unitKey(aggregate.financialUnits[0]) : undefined));
  const selected = aggregate.financialUnits.find(unit => unitKey(unit) === selectedKey);
  const sections = useCustomer360Sections(aggregate, selected, reloadKey);
  const [command, setCommand] = useState<{ kind: CaseCommandDialog; caseId: string; note?: string } | undefined>(undefined);
  const openUnits = useMemo(() => aggregate.financialUnits.filter(unit => unit.case.isOpen), [aggregate.financialUnits]);
  // Stable across renders, so a selection change never looks like a new history question.
  const caseIds = useMemo(() => aggregate.cases.map(c => c.id), [aggregate.cases]);
  const contextOf = useCaseContext(aggregate);
  const commands = useMemo(() => ({
    onSelect: setSelectedKey,
    onOpenCase,
    onLogAction: (unit: FinancialUnit) => setCommand({ kind: 'activity', caseId: unit.case.id }),
    onCapturePromise: (unit: FinancialUnit) => setCommand({ kind: 'promise', caseId: unit.case.id }),
  }), [onOpenCase]);
  const nextOf = (unit: FinancialUnit | undefined) => (unit && sections.nextActions.state.status === 'ready' ? sections.nextActions.state.data.get(unit.case.id) : undefined);

  return (
    <>
      <CustomerHeader aggregate={aggregate} actions={<CustomerLogActionButton openUnits={openUnits} onChosen={(unit, note) => setCommand({ kind: 'activity', caseId: unit.case.id, note })} />} />
      <CollectionKpiStrip aggregate={aggregate} promises={sections.promises} />
      <BalancesAsOf asOf={aggregate.misAsOfDate} className="c360-balances-as-of" />
      <div className="c360-layout">
        <div className="c360-col-main">
          <div className="c360-slot-units">
            <FinancialUnitList units={aggregate.financialUnits} portfolio={aggregate.portfolio} nextActions={sections.nextActions.state} selectedKey={selectedKey} commands={commands} />
          </div>
          <div className="c360-slot-history">
            <SectionBoundary label="Collection History" state={sections.history.state} onRetry={sections.history.retry} skeleton={<SkeletonLines lines={5} height={18} />} testId="c360-history-section">
              {history => <CollectionHistoryTimeline caseIds={caseIds} history={history} counts={sections.counts.status === 'ready' ? sections.counts.data : undefined} contextOf={contextOf} />}
            </SectionBoundary>
          </div>
        </div>
        <div className="c360-col-side">
          <div className="c360-sticky-group">
            <div className="c360-slot-summary">
              <CollectionSummaryPanel
                unit={selected} nextAction={nextOf(selected)} nextActionsStatus={sections.nextActions.state.status}
                openProcesses={sections.openProcesses.state} onRetryProcesses={sections.openProcesses.retry} onOpenActionPlan={navigation.onOpenActionPlan}
              />
            </div>
            <div className="c360-slot-delinquency">
              {selected && (
                <SectionBoundary label="Delinquency History" state={sections.snapshots.state} onRetry={sections.snapshots.retry} skeleton={<SkeletonLines lines={4} height={18} />} testId="c360-delinquency-section">
                  {snapshots => <DelinquencyHistory unitNumber={selected.unitNumber} snapshots={snapshots} />}
                </SectionBoundary>
              )}
            </div>
          </div>
          <div className="c360-slot-prefs"><ContactPreferences profile={aggregate.profile} messageTable={sections.history.state.status === 'ready' ? sections.history.state.data.messaging.sms?.table : undefined} /></div>
        </div>
      </div>
      <CaseCommandDialogs
        caseId={command?.caseId} dialog={command?.kind ?? null} contextNote={command?.note}
        onClose={() => setCommand(undefined)} onSaved={() => { setCommand(undefined); onSaved(); }}
      />
    </>
  );
}

/** Each history entry's Loan Account / Facility and Collection Case, from the cases already read. */
function useCaseContext(aggregate: CustomerAggregate) {
  const byCase = useMemo(() => new Map(aggregate.cases.map(c => [c.id, { unit: describeFinancialUnit(c.organization, c.facilityNumber), caseNumber: c.caseNumber }])), [aggregate.cases]);
  return useCallback((caseId: string | undefined) => (caseId ? byCase.get(caseId) : undefined), [byCase]);
}

const MOMENT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** "29 Sept 2026 · 14:45", in the officer's time zone; an absent or unreadable moment is an em dash. */
export function formatMoment(value: string | undefined): string {
  if (!value) return '—';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '—';
  return formatWithShortMonths(MOMENT, at).replace(/ /g, ' ').replace(/, /, ' · ');
}
