import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { buildHash } from './useHashRoute.js';

/**
 * The one way a customer name or a case number leads somewhere, in both workspaces.
 *
 * A customer name always opens Customer 360; a case number always opens the Collection Case. Both
 * are buttons, not anchors — an in-page anchor would change the hash, and the hash is the route, so
 * the link and the router would disagree about history. They sit inside clickable rows, so they stop
 * the click and the key from also activating the row: the officer goes where the words say.
 *
 * Navigation is presentation only. Opening a customer or a case reads it as the signed-in user, and
 * CRM security decides what comes back.
 */

export function navigateTo(viewId: string, recordId?: string, tab?: string): void {
  const next = buildHash(viewId, recordId, tab);
  if (window.location.hash !== next) window.location.hash = next;
}

/** A customer's name, opening that customer's Customer 360. Plain text when the id is unknown. */
export function CustomerLink({ customerBusinessId, children, className, fromCaseId }: {
  customerBusinessId: string | undefined;
  children: ReactNode;
  className?: string;
  /** The case the officer is leaving; Customer 360 opens on it and offers the way back. */
  fromCaseId?: string;
}) {
  if (!isKnownId(customerBusinessId)) return <span className={className}>{children}</span>;
  return (
    <RecordLink
      label={`Open Customer 360 for ${textOf(children)}`} className={className}
      onActivate={() => navigateTo('customer', customerBusinessId, fromCaseId)} testId="customer-link"
    >
      {children}
    </RecordLink>
  );
}

/** A case number, opening the Collection Case. Plain text when the id is unknown. */
export function CaseLink({ caseId, children, tab, className }: {
  caseId: string | undefined;
  children: ReactNode;
  /** The tab the link is about, when it is about one — a promise opens Promises. */
  tab?: string;
  className?: string;
}) {
  if (!isKnownId(caseId)) return <span className={className}>{children}</span>;
  return (
    <RecordLink
      label={`Open case ${textOf(children)}`} className={className}
      onActivate={() => navigateTo('case', caseId, tab)} testId="case-link"
    >
      {children}
    </RecordLink>
  );
}

function RecordLink({ label, className, onActivate, testId, children }: {
  label: string;
  className: string | undefined;
  onActivate: () => void;
  testId: string;
  children: ReactNode;
}) {
  const onClick = (event: MouseEvent) => { event.stopPropagation(); onActivate(); };
  // Enter and Space are the button's own; stopping them keeps a row's keyboard handler out of it.
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); };
  return (
    <button
      type="button" className={className ? `record-link ${className}` : 'record-link'}
      aria-label={label} title={label} onClick={onClick} onKeyDown={onKeyDown} data-testid={testId}
    >
      {children}
    </button>
  );
}

function isKnownId(id: string | undefined): id is string {
  return id !== undefined && id !== '' && id !== '—';
}

function textOf(children: ReactNode): string {
  return typeof children === 'string' || typeof children === 'number' ? String(children) : 'this record';
}
