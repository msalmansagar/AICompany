import type { CaseDetail, CustomerProfile } from '../../../data/caseQueries.js';
import { OrgBadge, StatusPill, formatCount, formatMoney } from '../../../components/primitives.js';
import { StoredPositionNotice } from '../../../components/Freshness.js';
import { BucketBadge, CommandBar, CommandButton } from '../../components/primitives.js';

/**
 * Who, which facility, how late, and what can be done — in one card.
 *
 * The figures are MIS's last reported position, stored on the case, and the notice beneath them says
 * so: this is never presented as a live read. Status and organisation badges are V1's own, so both
 * workspaces describe a status the same way. Only commands for real capabilities are offered.
 */
export function CaseHeader({ detail, customer, onBack, onLogAction, onCapturePromise, onMessage, onOpenCustomer }: {
  detail: CaseDetail;
  customer?: CustomerProfile | undefined;
  onBack: () => void;
  onLogAction: () => void;
  onCapturePromise: () => void;
  onMessage: () => void;
  onOpenCustomer: () => void;
}) {
  const name = customer?.displayName ?? detail.customerBusinessId;
  const closedReason = detail.isOpen ? undefined : 'This case is closed.';

  return (
    <div className="v2-case-head" data-testid="v2-case-header">
      <div className="v2-case-identity">
        <button type="button" className="v2-btn" onClick={onBack} data-testid="v2-case-back">
          ← Cases
        </button>
        <span className="v2-avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div className="v2-case-names">
          <div className="v2-case-nameline">
            <h2 className="v2-case-customer" data-testid="v2-case-customer">{name}</h2>
            <BucketBadge bucket={detail.bucket} />
            <StatusPill status={detail.status} />
            <OrgBadge org={detail.organization} />
          </div>
          <p className="v2-case-sub">
            {detail.caseNumber} · facility {detail.facilityNumber}
            {detail.productDescription ? ` · ${detail.productDescription}` : ''}
            {detail.episodeNumber !== undefined ? ` · episode ${formatCount(detail.episodeNumber)}` : ''}
          </p>
        </div>
      </div>

      <CommandBar label="Case commands">
        <CommandButton icon="add" label="Log action" isPrimary onClick={onLogAction} disabledReason={closedReason} testId="v2-cmd-log-action" />
        <CommandButton icon="promise" label="Capture PTP" onClick={onCapturePromise} disabledReason={closedReason} testId="v2-cmd-capture-ptp" />
        <CommandButton icon="send" label="Send message" onClick={onMessage} testId="v2-cmd-message" />
        <CommandButton icon="users" label="Customer 360" onClick={onOpenCustomer} testId="v2-cmd-customer" />
      </CommandBar>

      <dl className="v2-stats" data-testid="v2-case-stats">
        <Stat label="Arrears" value={formatMoney(detail.totalArrears)} isEmphasised />
        <Stat label="Loan balance" value={formatMoney(detail.loanBalance)} />
        <Stat label="DPD" value={formatCount(detail.dpd)} />
        <Stat label="Instalment" value={formatMoney(detail.installmentAmount)} />
        <Stat label="Owner" value={detail.ownerName ?? '—'} />
        <Stat label="Strategy" value={detail.strategyName ?? '—'} />
      </dl>
      <div className="v2-case-freshness">
        <StoredPositionNotice asOf={detail.misAsOfDate} syncedOn={detail.lastMisSyncOn} />
      </div>
    </div>
  );
}

function Stat({ label, value, isEmphasised = false }: { label: string; value: string; isEmphasised?: boolean }) {
  return (
    <div className="v2-stat">
      <dt className="v2-stat-label">{label}</dt>
      <dd className={isEmphasised ? 'v2-stat-value v2-stat-strong' : 'v2-stat-value'}>{value}</dd>
    </div>
  );
}

export function initialsOf(name: string): string {
  const letters = name.split(/\s+/).filter(part => /^\p{L}/u.test(part)).map(part => part[0]);
  return (letters.slice(0, 2).join('') || name.slice(0, 2)).toUpperCase();
}
