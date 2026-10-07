import { ActivityDialog, type ActivityDialogMode } from '../ActivityDialog.js';
import { PromiseDialog, type PromiseDialogMode } from '../PromiseDialog.js';
import { CreateComplaintPane } from '../CreateComplaintPane.js';
import { CaseMessagePane } from '../CommunicationCenter.js';
import { FOLLOW_UP_COMPLETED } from '../FollowUpCompletion.js';

/**
 * The one pane the Case Workspace has open, if any — always an existing, canonical component.
 *
 * Log action, Log the call and Complete follow-up are the activity pane; Capture PTP and View are the
 * promise pane; SMS and Email are the case's composer on that channel; Raise complaint is the Case
 * Management pane. Every pane is told which customer, unit and case it records against, so nothing
 * is reselected. A save closes the pane, names what was saved and re-reads the case; a sent message
 * keeps its pane open (the officer reads what was handed over) while the case re-reads behind it.
 */
export type CasePane =
  | { kind: 'activity'; mode: ActivityDialogMode; activityId?: string; note?: string }
  | { kind: 'promise'; mode: PromiseDialogMode; promiseId?: string }
  | { kind: 'message'; channel: 'SMS' | 'Email' }
  | { kind: 'complaint' };

export interface PaneOutcome {
  onClose: () => void;
  /** Closes the pane, says what was saved, re-reads the case. */
  onSaved: (message: string) => void;
  /** Re-reads the case and leaves the pane open. */
  onRefresh: () => void;
}

export function CasePanes({ caseId, context, pane, outcome }: {
  caseId: string;
  /** "Customer · Loan Account … · Case …" — what every pane records against. */
  context: string;
  pane: CasePane | undefined;
  outcome: PaneOutcome;
}) {
  if (!pane) return null;
  if (pane.kind === 'complaint') return <CreateComplaintPane caseId={caseId} onClose={outcome.onClose} />;
  if (pane.kind === 'message') return <CaseMessagePane caseId={caseId} channel={pane.channel} onClose={outcome.onClose} onSent={outcome.onRefresh} />;
  if (pane.kind === 'promise') {
    return (
      <PromiseDialog
        mode={pane.mode} caseId={caseId} {...(pane.promiseId ? { promiseId: pane.promiseId } : {})} contextNote={context}
        onClose={outcome.onClose} onSaved={() => outcome.onSaved('The promise was saved.')}
      />
    );
  }
  return (
    <ActivityDialog
      mode={pane.mode} caseId={caseId} {...(pane.activityId ? { activityId: pane.activityId } : {})}
      contextNote={pane.note ? `${context}. ${pane.note}` : context} onClose={outcome.onClose}
      onSaved={() => outcome.onSaved(pane.mode === 'complete' ? FOLLOW_UP_COMPLETED : 'The action was saved.')}
    />
  );
}
