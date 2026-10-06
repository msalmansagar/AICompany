import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import type { ActivityRow } from '../data/caseQueries.js';
import { ActivityDialog } from './ActivityDialog.js';

/**
 * Completing a follow-up straight from My Day, in V1 and V2 alike (WP4).
 *
 * A follow-up is a date on the activity that set it, so completing the activity is completing the
 * follow-up. The pane is the existing activity pane opened at completion, so the outcome, notes and
 * next follow-up the outcome's configuration requires are still required — nothing is bypassed — and
 * an activity whose type has no configured outcome opens as an edit that says so.
 */
/** Said wherever a follow-up is completed — My Day and the Case Workspace — so the two never drift. */
export const FOLLOW_UP_COMPLETED = 'The follow-up was completed.';

export interface FollowUpCompletion {
  /** Re-reads the list after a completion; part of the list's query. */
  reloadKey: number;
  /** "The follow-up was completed." after a save, until the next one. */
  notice: string;
  open: (row: ActivityRow) => void;
  pane: ReactNode;
}

export function useFollowUpCompletion(): FollowUpCompletion {
  const [row, setRow] = useState<ActivityRow | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [notice, setNotice] = useState('');
  const done = () => { setRow(undefined); setReloadKey(key => key + 1); setNotice(FOLLOW_UP_COMPLETED); };
  const pane = row?.caseId
    ? (
      <ActivityDialog
        mode="complete" caseId={row.caseId} activityId={row.id} contextNote={contextOf(row)}
        onClose={() => setRow(undefined)} onSaved={done}
      />
    )
    : null;
  return { reloadKey, notice, open: setRow, pane };
}

function contextOf(row: ActivityRow): string {
  return [row.caseNumber ? `Case ${row.caseNumber}` : undefined, row.subject].filter(Boolean).join(' · ');
}

/** The row's Complete control. It stops the click so the row does not also open the case. */
export function CompleteFollowUpButton({ row, onComplete, className = 'btn sm' }: {
  row: ActivityRow;
  onComplete: (row: ActivityRow) => void;
  className?: string;
}) {
  if (!row.caseId || row.stateCode === 1 || row.stateCode === 2) return null;
  const onClick = (event: MouseEvent) => { event.stopPropagation(); onComplete(row); };
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); };
  return (
    <button type="button" className={className} onClick={onClick} onKeyDown={onKeyDown} aria-label={`Complete ${row.subject}`} data-testid="followup-complete">
      Complete
    </button>
  );
}
