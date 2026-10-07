import { useState } from 'react';
import { ActivityDialog } from '../ActivityDialog.js';
import type { WorkNavigation } from './useWorkNavigation.js';

/**
 * "← Previous · 3 of 18 · Overdue follow-ups · Next →" and Complete & Next, on a case opened from an
 * ordered list. Absent when the case was opened any other way: there is no order to move through.
 *
 * Complete & Next completes the item the officer came for — the follow-up or queue item, not some
 * other activity on the case — through the existing activity pane, so the outcome and whatever it
 * requires are still required. Only a successful save moves on; closing the pane stays put.
 */
export function CaseWorkNavigator({ navigation, isCaseOpen, onCompleted }: {
  navigation: WorkNavigation;
  isCaseOpen: boolean;
  /** Re-reads the case after the completion, before the step away. */
  onCompleted: () => void;
}) {
  const [isCompleting, setCompleting] = useState(false);
  const { context, position, note, isBusy, canGoBack, canGoForward, step } = navigation;
  if (!context) return null;
  const current = context.items[context.index];
  const completable = isCaseOpen && current?.activityId ? current : undefined;
  const completed = () => { setCompleting(false); onCompleted(); step(1); };

  return (
    <nav className="cw-worknav" aria-label="Work list" data-testid="cw-worknav">
      <button type="button" className="btn" onClick={() => step(-1)} disabled={!canGoBack || isBusy} data-testid="cw-previous">← Previous</button>
      <span className="cw-worknav-position" aria-live="polite" data-testid="cw-position-in-list">{isBusy ? 'Checking the next item…' : position}</span>
      <button type="button" className="btn" onClick={() => step(1)} disabled={!canGoForward || isBusy} data-testid="cw-next">Next →</button>
      {completable && (
        <button type="button" className="btn primary" onClick={() => setCompleting(true)} disabled={isBusy} data-testid="cw-complete-next">
          Complete &amp; Next
        </button>
      )}
      {note && <p className="cw-worknav-note" role="status" data-testid="cw-worknav-note">{note}</p>}
      {isCompleting && completable && (
        <ActivityDialog
          mode="complete" caseId={completable.caseId} activityId={completable.activityId}
          contextNote={`${completable.label} · then the next item in ${context.originLabel}`}
          onClose={() => setCompleting(false)} onSaved={completed}
        />
      )}
    </nav>
  );
}
