import { useEffect, useState, type ReactNode } from 'react';
import type { AuditRow } from '../data/collectionQueries.js';
import { loadCustomerAggregate, type CustomerAggregate } from '../data/customerAggregate.js';
import { useCaseRecord } from '../data/useCaseRecord.js';
import { BalancesAsOf } from '../components/BalancesAsOf.js';
import { OwnerLabel } from '../components/OwnerLabel.js';
import {
  BucketPill, EmptyState, FieldList, Icon, OrgBadge, StatusPill, formatCount, formatDate, formatMoney,
} from '../components/primitives.js';
import { useCrmSession } from '../shell/context.js';
import { describeFailure } from '../platform/errors.js';

/**
 * The right-hand pane of a V1 Split layout.
 *
 * Each preview is read on demand from the organisation — never from the list's row — so what it
 * says is what the server holds. None of them calculates: a case preview renders the stored MIS
 * position, a customer preview renders the aggregate the Customer 360 already builds, an audit
 * preview renders the entry's own fields. *Open* is the only way into the full record.
 */

export function PreviewPrompt({ message, testId }: { message: string; testId: string }) {
  return <div className="preview-empty" data-testid={testId}><EmptyState icon="info" message={message} /></div>;
}

/** Room above a preview for the row's own words — a work item's title, a promise's terms. */
export function PreviewHeading({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="preview-heading">
      <p className="preview-eyebrow">{eyebrow}</p>
      <h3 className="preview-title">{title}</h3>
      {children}
    </div>
  );
}

// ── A case ───────────────────────────────────────────────────────────────────

export function CasePreview({ caseId, reloadKey = 0, onOpen, onLogAction, onCapturePromise, testId = 'case-preview' }: {
  caseId: string | undefined;
  reloadKey?: number;
  onOpen: (caseId: string) => void;
  onLogAction?: (() => void) | undefined;
  onCapturePromise?: (() => void) | undefined;
  testId?: string;
}) {
  const record = useCaseRecord(caseId, reloadKey);
  if (!caseId) return <PreviewPrompt message="Choose a row to preview its case." testId={`${testId}-empty`} />;
  if (record.status === 'loading') return <div className="empty-state" data-testid={`${testId}-loading`}>Loading the case…</div>;
  if (record.status !== 'ready') {
    // The id is known even when the record cannot be read here, so the way in is still offered.
    return (
      <div className="preview" data-testid={`${testId}-unavailable`}>
        <EmptyState icon="info" message="This case could not be read in this session." />
        <div className="action-row">
          <button type="button" className="btn primary" onClick={() => onOpen(caseId)} data-testid={`${testId}-open`}>Open case</button>
        </div>
      </div>
    );
  }

  const { detail, customer } = record;
  const name = customer?.displayName ?? detail.customerName ?? detail.customerBusinessId;
  return (
    <div className="preview" data-testid={testId} data-case-id={detail.id}>
      <div className="preview-head">
        <div className="preview-names">
          <h3 className="preview-title" data-testid={`${testId}-customer`}>{name}</h3>
          <p className="preview-sub">
            {detail.caseNumber} · facility {detail.facilityNumber}{detail.productDescription ? ` · ${detail.productDescription}` : ''}
          </p>
          <p className="row-actions">
            <BucketPill bucket={detail.bucket} /><StatusPill status={detail.status} /><OrgBadge org={detail.organization} />
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => onOpen(detail.id)} data-testid={`${testId}-open`}>Open case</button>
      </div>
      <FieldList testId={`${testId}-fields`} fields={[
        { label: 'Current arrears', value: formatMoney(detail.totalArrears) },
        { label: 'DPD', value: formatCount(detail.dpd) },
        { label: 'Loan balance', value: formatMoney(detail.loanBalance) },
        { label: 'Strategy', value: detail.strategyName ?? 'Not assigned' },
        { label: 'Customer type', value: detail.customerType ?? '—' },
        { label: 'Owner', value: <OwnerLabel ownerId={detail.ownerId} ownerName={detail.ownerName} /> },
        { label: 'Episode', value: formatCount(detail.episodeNumber) },
        { label: 'Opened', value: formatDate(detail.openDate) },
      ]} />
      <BalancesAsOf asOf={detail.misAsOfDate} />
      {(onLogAction || onCapturePromise) && (
        <div className="action-row" role="toolbar" aria-label="Case commands">
          {onLogAction && <CaseCommand label="Log action" icon="add" onClick={onLogAction} isOpen={detail.isOpen} testId={`${testId}-log-action`} />}
          {onCapturePromise && <CaseCommand label="Capture PTP" icon="promise" onClick={onCapturePromise} isOpen={detail.isOpen} testId={`${testId}-capture-ptp`} />}
        </div>
      )}
    </div>
  );
}

function CaseCommand({ label, icon, onClick, isOpen, testId }: {
  label: string; icon: string; onClick: () => void; isOpen: boolean; testId: string;
}) {
  return (
    <button
      type="button" className="btn" onClick={isOpen ? onClick : undefined} disabled={!isOpen}
      title={isOpen ? label : 'This case is closed.'} data-testid={testId}
    >
      <Icon name={icon} />{label}
    </button>
  );
}

// ── An audit entry ───────────────────────────────────────────────────────────

/** Everything the entry holds, laid out; the list only had room for three columns of it. */
export function AuditEntryPreview({ entry, testId = 'audit-preview' }: { entry: AuditRow | undefined; testId?: string }) {
  if (!entry) return <PreviewPrompt message="Choose an entry to read it in full." testId={`${testId}-empty`} />;
  return (
    <div className="preview" data-testid={testId} data-entry-id={entry.id}>
      <PreviewHeading eyebrow={entry.isException ? 'Exception' : 'Log entry'} title={entry.subject ?? '—'} />
      <FieldList testId={`${testId}-fields`} fields={[
        { label: 'When', value: entry.createdOn ? entry.createdOn.slice(0, 19).replace('T', ' ') : '—' },
        { label: 'Source', value: entry.source ?? '—' },
        { label: 'Type', value: entry.type ?? '—' },
        { label: 'Exception', value: entry.isException ? 'Yes' : 'No' },
      ]} />
      {entry.diagnostics && <pre className="preview-code" data-testid={`${testId}-diagnostics`}>{entry.diagnostics}</pre>}
    </div>
  );
}

// ── A customer ───────────────────────────────────────────────────────────────

type CustomerState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; aggregate: CustomerAggregate };

/** The Customer 360 aggregate, in brief: who, how exposed, over how many cases. */
export function CustomerPreview({ customerBusinessId, onOpen, onOpenCase, testId = 'customer-preview' }: {
  customerBusinessId: string | undefined;
  onOpen: (customerBusinessId: string) => void;
  onOpenCase: (caseId: string) => void;
  testId?: string;
}) {
  const { adapter } = useCrmSession();
  const [state, setState] = useState<CustomerState>({ status: 'loading' });

  useEffect(() => {
    if (!customerBusinessId) return undefined;
    let cancelled = false;
    setState({ status: 'loading' });
    loadCustomerAggregate(adapter, customerBusinessId)
      .then(aggregate => { if (!cancelled) setState({ status: 'ready', aggregate }); })
      .catch((failure: unknown) => { if (!cancelled) setState({ status: 'error', message: describeFailure(failure) }); });
    return () => { cancelled = true; };
  }, [adapter, customerBusinessId]);

  if (!customerBusinessId) return <PreviewPrompt message="Choose a customer to preview their position." testId={`${testId}-empty`} />;
  if (state.status === 'loading') return <div className="empty-state" data-testid={`${testId}-loading`}>Loading the customer…</div>;
  if (state.status === 'error') return <PreviewPrompt message={state.message} testId={`${testId}-unavailable`} />;

  const { aggregate } = state;
  const partial = aggregate.position.source === 'rows' && !aggregate.isComplete ? ' (partial)' : '';
  return (
    <div className="preview" data-testid={testId} data-customer-id={customerBusinessId}>
      <div className="preview-head">
        <div className="preview-names">
          <h3 className="preview-title" data-testid={`${testId}-name`}>{aggregate.profile?.displayName ?? customerBusinessId}</h3>
          <p className="preview-sub">{customerBusinessId}{aggregate.profile ? ` · ${aggregate.profile.table === 'contact' ? 'Housing Loan contact' : 'BFD account'}` : ' · no linked CRM record'}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => onOpen(customerBusinessId)} data-testid={`${testId}-open`}>Open Customer 360</button>
      </div>
      <FieldList testId={`${testId}-fields`} fields={[
        { label: `Total overdue${partial}`, value: formatMoney(aggregate.position.totalOverdue) },
        { label: `Total exposure${partial}`, value: formatMoney(aggregate.position.totalExposure) },
        { label: 'Worst DPD', value: formatCount(aggregate.position.worstDpd) },
        { label: 'Open cases', value: formatCount(aggregate.position.openCases) },
        { label: 'Loan accounts / facilities', value: formatCount(aggregate.financialUnits.length) },
        { label: 'Mobile', value: aggregate.profile?.mobile ?? '—' },
      ]} />
      <ul className="preview-list" data-testid={`${testId}-cases`}>
        {aggregate.cases.map(c => (
          <li key={c.id} className="preview-list-row">
            <span className="row-lead"><OrgBadge org={c.organization} />{c.caseNumber}</span>
            <span className="cell-sub">{formatCount(c.dpd)} DPD · {formatMoney(c.totalArrears)}</span>
            <StatusPill status={c.status} />
            <button type="button" className="btn sm" onClick={() => onOpenCase(c.id)} aria-label={`Open case ${c.caseNumber}`}>Open</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
