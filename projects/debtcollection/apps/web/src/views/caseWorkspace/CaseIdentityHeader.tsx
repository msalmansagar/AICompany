import type { ReactNode } from 'react';
import type { CaseDetail, CustomerProfile } from '../../data/caseQueries.js';
import { financialUnitTerms } from '../../data/financialUnit.js';
import { OrgBadge, StatusPill, formatCount, formatMoney } from '../../components/primitives.js';
import { BucketBadge } from '../../components/StatusBadge.js';
import { BalancesAsOf } from '../../components/BalancesAsOf.js';
import { OwnerLabel } from '../../components/OwnerLabel.js';
import { CustomerLink } from '../../shell/RecordLinks.js';

/**
 * The Case Workspace's sticky header: who, which unit, which case, and the stored position.
 *
 * HL cases name a Loan Account, BFD cases a Facility — the word comes from the case's own source
 * system. The figures are the last MIS position DCP stored, with the date they are from; none is a
 * live MIS read. The customer's name opens Customer 360; the case number is this page.
 */
export function CaseIdentityHeader({ detail, customer, onBack, actions }: {
  detail: CaseDetail;
  customer: CustomerProfile | undefined;
  onBack: () => void;
  /** The action bar, kept inside the sticky block so the commands stay reachable while scrolling. */
  actions: ReactNode;
}) {
  const name = customer?.displayName ?? detail.customerName ?? detail.customerBusinessId;
  return (
    <header className="cw-sticky" data-testid="cw-header">
      <div className="cw-identity">
        <button type="button" className="btn cw-back" onClick={onBack} data-testid="cw-back">← Collection Cases</button>
        <div className="cw-names">
          <h2 className="cw-customer" data-testid="cw-customer">
            <CustomerLink customerBusinessId={detail.customerBusinessId} fromCaseId={detail.id}>{name}</CustomerLink>
          </h2>
          <IdentityLine detail={detail} />
        </div>
      </div>
      <PositionStrip detail={detail} />
      {actions}
    </header>
  );
}

function IdentityLine({ detail }: { detail: CaseDetail }) {
  const terms = financialUnitTerms(detail.sourceSystem);
  return (
    <p className="cw-sub" data-testid="cw-identity">
      {detail.customerType && <span className="c360-chip">{detail.customerType}</span>}
      <span>{terms.noun} <b>{detail.facilityNumber}</b></span>
      <span aria-current="page">Case <b>{detail.caseNumber}</b></span>
      <StatusPill status={detail.status} />
      <OrgBadge org={detail.organization} />
      <span>Owner <OwnerLabel ownerId={detail.ownerId} ownerName={detail.ownerName} /></span>
    </p>
  );
}

/** The authoritative figures, each labelled; a missing one reads as a dash, never as zero. */
function PositionStrip({ detail }: { detail: CaseDetail }) {
  const terms = financialUnitTerms(detail.sourceSystem);
  return (
    <div className="cw-position" data-testid="cw-position">
      <dl className="cw-figures">
        <Figure label="DPD" value={formatCount(detail.dpd)} />
        <Figure label="Bucket" value={<BucketBadge bucket={detail.bucket} />} />
        <Figure label="Arrears" value={formatMoney(detail.totalArrears)} isStrong />
        <Figure label={terms.balanceLabel} value={formatMoney(detail.loanBalance)} />
      </dl>
      <BalancesAsOf asOf={detail.misAsOfDate} className="cw-as-of" />
    </div>
  );
}

function Figure({ label, value, isStrong }: { label: string; value: ReactNode; isStrong?: true }) {
  return (
    <div className={isStrong ? 'cw-figure strong' : 'cw-figure'}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
