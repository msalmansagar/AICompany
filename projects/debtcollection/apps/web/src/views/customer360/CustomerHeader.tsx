import type { ReactNode } from 'react';
import type { CustomerAggregate } from '../../data/customerAggregate.js';
import type { PromisePerformance } from '../../data/customerAggregate.js';
import { BucketBadge } from '../../components/StatusBadge.js';
import { formatCount, formatMoney } from '../../components/primitives.js';
import type { SectionState } from '../../components/SectionBoundary.js';
import { initialsOf } from '../../components/initials.js';

/**
 * Who the customer is, compactly: initials, the name exactly as CRM holds it, where the customer
 * lives (Housing Loan contact or BFD account), the customer type, the source identifier, and the
 * mobile number — or "Not available", never a blank.
 */
export function CustomerHeader({ aggregate, actions }: { aggregate: CustomerAggregate; actions: ReactNode }) {
  const profile = aggregate.profile;
  const name = profile?.displayName ?? aggregate.customerBusinessId;
  const identifierLabel = profile?.table === 'account' ? 'CR number' : profile?.table === 'contact' ? 'QID' : 'Customer id';
  return (
    <header className="c360-header" data-testid="c360-head" aria-label="Customer">
      <span className="c360-avatar" aria-hidden="true">{initialsOf(name)}</span>
      <div className="c360-identity">
        <h2 className="c360-name" data-testid="c360-name">{name}</h2>
        <div className="c360-chips" data-testid="c360-tags">
          {profile ? <span className="c360-chip">{profile.table === 'contact' ? 'Housing Loan · Contact' : 'BFD · Account'}</span> : <span className="c360-chip warn">No linked CRM record</span>}
          {aggregate.segments.map(segment => <span key={segment} className="c360-chip muted">{segment}</span>)}
        </div>
        <p className="c360-sub" data-testid="c360-sub">
          <span>{identifierLabel} {aggregate.customerBusinessId}</span>
          <span data-testid="c360-mobile">Mobile {profile?.mobile ?? 'Not available'}</span>
        </p>
      </div>
      <div className="c360-header-actions" role="toolbar" aria-label="Customer commands">{actions}</div>
    </header>
  );
}

export const PTP_PERFORMANCE_HINT = 'As recorded by officers. Payments are not verified against MIS.';

/**
 * The customer's position across open cases, summed by the platform. The worst DPD carries the
 * bucket of the unit it came from. Promise performance is "N / M kept" as officers recorded it —
 * never called payment performance, never verified.
 */
export function CollectionKpiStrip({ aggregate, promises }: { aggregate: CustomerAggregate; promises: SectionState<PromisePerformance> }) {
  const partial = aggregate.position.source === 'rows' && !aggregate.isComplete ? ' (partial)' : '';
  const worst = aggregate.financialUnits[0];
  const worstBucket = aggregate.isComplete && worst?.dpd === aggregate.position.worstDpd ? worst?.bucket : undefined;
  return (
    <section className="c360-kpis" aria-label="Collection position" data-testid="c360-kpis">
      <Kpi label={`Total Exposure${partial}`} value={formatMoney(aggregate.position.totalExposure)} hint="Over units with an open case" />
      <Kpi label={`Total Overdue${partial}`} value={formatMoney(aggregate.position.totalOverdue)} />
      <Kpi label="Worst DPD" value={formatCount(aggregate.position.worstDpd)} emphasis extra={worstBucket ? <BucketBadge bucket={worstBucket} /> : undefined} />
      <Kpi label="Open Cases" value={formatCount(aggregate.position.openCases)} />
      <Kpi label="Promises kept" value={describePromises(promises)} hint="As recorded by officers" title={PTP_PERFORMANCE_HINT} testId="c360-kpi-ptp" />
    </section>
  );
}

function Kpi({ label, value, hint, title, emphasis, extra, testId }: {
  label: string; value: string; hint?: string; title?: string; emphasis?: boolean; extra?: ReactNode | undefined; testId?: string;
}) {
  return (
    <div className={emphasis ? 'c360-kpi emphasis' : 'c360-kpi'} title={title} data-testid={testId}>
      <span className="c360-kpi-label">{label}</span>
      <span className="c360-kpi-value">{value}{extra}</span>
      {hint && <span className="c360-kpi-hint">{hint}</span>}
    </div>
  );
}

/** "2 of 4"; none recorded and unknown are said as themselves, never as zero. */
export function describePromises(state: SectionState<PromisePerformance>): string {
  if (state.status === 'loading') return '—';
  if (state.status === 'error' || state.data.recorded === undefined) return 'Not available';
  if (state.data.recorded === 0) return 'None recorded';
  return `${formatCount(state.data.kept)} of ${formatCount(state.data.recorded)}`;
}

