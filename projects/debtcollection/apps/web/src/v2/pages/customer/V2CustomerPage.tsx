import { useEffect, useState, type FormEvent } from 'react';
import { loadCustomerAggregate, type CustomerAggregate } from '../../../data/customerAggregate.js';
import { OrgBadge, StatusPill, formatCount, formatMoney } from '../../../components/primitives.js';
import { describeFailure } from '../../../platform/errors.js';
import { useCrmSession } from '../../../shell/context.js';
import type { ViewRequest } from '../../V2Workspace.js';
import { useV2Shell } from '../../shell/V2Shell.js';
import { BucketBadge, Card, EmptyState, ErrorState, KeyValueList, LoadingSkeleton } from '../../components/primitives.js';
import { initialsOf } from '../case/CaseHeader.js';

/**
 * Customer 360 V2 — one customer across both CRMs.
 *
 * An aggregation read, never a customer master: the customer's cases are read by their canonical
 * business id (a bounded read), and totals are derived from them. When the customer holds more cases
 * than one read returns, every total is marked **partial**. HL customers are CRM contacts and BFD
 * customers are accounts; there is no `qdb_customer`.
 */
type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; aggregate: CustomerAggregate };

export function V2CustomerPage({ request }: { request: ViewRequest }) {
  const customerId = request.recordId;
  if (!customerId) return <ChooseCustomer />;
  return <CustomerView customerId={customerId} onOpenCase={request.onOpenCase} />;
}

function ChooseCustomer() {
  const { go } = useV2Shell();
  const [value, setValue] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) go('customer', value.trim());
  };
  return (
    <Card title="Open a customer" subtitle="Customer 360 is reached from a case, or by the customer's business id.">
      <form className="v2-toolbar-row" onSubmit={submit}>
        <input className="v2-input" value={value} onChange={e => setValue(e.target.value)} placeholder="Customer business id" aria-label="Customer business id" data-testid="v2-customer-id" />
        <button type="submit" className="v2-btn v2-btn-primary">Open</button>
      </form>
    </Card>
  );
}

function CustomerView({ customerId, onOpenCase }: { customerId: string; onOpenCase: (id: string) => void }) {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadCustomerAggregate(adapter, customerId)
      .then(aggregate => { if (!cancelled) setState({ status: 'ready', aggregate }); })
      .catch((failure: unknown) => { if (!cancelled) setState({ status: 'error', message: describeFailure(failure) }); });
    return () => { cancelled = true; };
  }, [adapter, customerId, attempt]);

  if (state.status === 'loading') return <Card><LoadingSkeleton rows={6} label="Loading the customer" testId="v2-customer-loading" /></Card>;
  if (state.status === 'error') return <Card><ErrorState title="This customer could not be read." message={state.message} onRetry={() => setAttempt(a => a + 1)} /></Card>;

  const { aggregate } = state;
  if (aggregate.cases.length === 0) {
    return <Card><EmptyState title="No collection case is recorded for this customer." message={`Customer id ${customerId}.`} testId="v2-customer-none" /></Card>;
  }
  return <CustomerLayout aggregate={aggregate} onOpenCase={onOpenCase} />;
}

function CustomerLayout({ aggregate, onOpenCase }: { aggregate: CustomerAggregate; onOpenCase: (id: string) => void }) {
  const profile = aggregate.profile;
  const name = profile?.displayName ?? aggregate.customerBusinessId;
  const partial = aggregate.isComplete ? '' : ' (partial)';
  const crms = new Set(aggregate.cases.map(c => c.organization)).size;

  return (
    <div className="v2-customer" data-testid="v2-customer">
      <div className="v2-customer-main">
        <section className="v2-card">
          <div className="v2-case-identity">
            <span className="v2-avatar" aria-hidden="true">{initialsOf(name)}</span>
            <div className="v2-case-names">
              <div className="v2-case-nameline">
                <h2 className="v2-case-customer" data-testid="v2-customer-name">{name}</h2>
                {profile && <span className="v2-tag">{profile.table === 'contact' ? 'Housing Loan · contact' : 'BFD · account'}</span>}
              </div>
              <p className="v2-case-sub">
                {[aggregate.customerBusinessId, profile?.mobile, profile?.email, profile?.city].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <dl className="v2-stats" data-testid="v2-customer-stats">
            <Stat label={`Total exposure${partial}`} value={formatMoney(aggregate.totalExposure)} />
            <Stat label={`Total overdue${partial}`} value={formatMoney(aggregate.totalOverdue)} isStrong />
            <Stat label="Worst DPD" value={formatCount(aggregate.worstDpd)} />
            <Stat label="Open cases" value={`${aggregate.openCaseCount}${aggregate.isComplete ? '' : '+'} across ${crms} ${crms === 1 ? 'CRM' : 'CRMs'}`} />
          </dl>
          {!aggregate.isComplete && (
            <p className="v2-partial" data-testid="v2-customer-partial">
              This customer has more cases than one read returns. The totals above are partial — not the full exposure.
            </p>
          )}
        </section>

        <Card title="Facilities across both CRMs" subtitle="MIS's last reported position for each facility, stored on its case." flush testId="v2-customer-facilities">
          <ul className="v2-list">
            {aggregate.facilities.map(facility => (
              <li key={facility.facilityNumber} className="v2-facility">
                <span className="v2-facility-id">
                  <OrgBadge org={facility.organization} />
                  <span className="v2-two-line">
                    <span className="v2-two-line-main">{facility.productDescription ?? 'Facility'}</span>
                    <span className="v2-two-line-sub">{facility.facilityNumber} · case {facility.caseNumber}</span>
                  </span>
                </span>
                <Figure label="Balance" value={formatMoney(facility.loanBalance)} />
                <Figure label="Overdue" value={formatMoney(facility.totalArrears)} />
                <Figure label="DPD" value={formatCount(facility.dpd)} />
                <span className="v2-figure"><span className="v2-figure-label">Bucket</span><BucketBadge bucket={facility.bucket} /></span>
                <button type="button" className="v2-btn" onClick={() => onOpenCase(facility.caseId)}>Open case</button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <aside className="v2-customer-side" aria-label="Customer detail">
        <Card title="Cases" flush testId="v2-customer-cases">
          <ul className="v2-list">
            {aggregate.cases.map(c => (
              <li key={c.id} className="v2-list-row">
                <span className="v2-list-main">
                  <span className="v2-list-title">{c.caseNumber}</span>
                  <span className="v2-list-meta">{formatCount(c.dpd)} DPD · {formatMoney(c.totalArrears)}</span>
                </span>
                <StatusPill status={c.status} />
                <button type="button" className="v2-btn v2-btn-subtle" onClick={() => onOpenCase(c.id)} aria-label={`Open case ${c.caseNumber}`}>Open</button>
              </li>
            ))}
          </ul>
        </Card>
        {profile && (
          <Card title="Channel preferences" subtitle="The CRM's own do-not-contact settings. These are not a collections contact hold." flush testId="v2-customer-prefs">
            <KeyValueList items={[
              { label: 'Phone', value: profile.restrictions.doNotPhone ? 'Do not phone' : 'Allowed' },
              { label: 'Email', value: profile.restrictions.doNotEmail ? 'Do not email' : 'Allowed' },
              { label: 'SMS / fax channel', value: profile.restrictions.doNotFax ? 'Do not use' : 'Allowed' },
            ]} />
          </Card>
        )}
      </aside>
    </div>
  );
}

function Stat({ label, value, isStrong = false }: { label: string; value: string; isStrong?: boolean }) {
  return (
    <div className="v2-stat">
      <dt className="v2-stat-label">{label}</dt>
      <dd className={isStrong ? 'v2-stat-value v2-stat-strong' : 'v2-stat-value'}>{value}</dd>
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <span className="v2-figure">
      <span className="v2-figure-label">{label}</span>
      <span className="v2-figure-value">{value}</span>
    </span>
  );
}
