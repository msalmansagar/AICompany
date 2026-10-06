import { ActivityDialog, type ActivityDialogMode } from '../ActivityDialog.js';
import { PromiseDialog, type PromiseDialogMode } from '../PromiseDialog.js';
import { CreateComplaintPane } from '../CreateComplaintPane.js';

/**
 * The one pane the Case Workspace has open, if any — always an existing, canonical component.
 *
 * Log action and Complete follow-up are the activity pane, Capture PTP and View are the promise
 * pane, Raise complaint is the Case Management pane. A successful save closes the pane and names
 * what was saved; the complaint pane closes itself once the officer has read its result.
 */
export type CasePane =
  | { kind: 'activity'; mode: ActivityDialogMode; activityId?: string; note?: string }
  | { kind: 'promise'; mode: PromiseDialogMode; promiseId?: string }
  | { kind: 'complaint' };

export function CasePanes({ caseId, pane, onClose, onSaved }: {
  caseId: string;
  pane: CasePane | undefined;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  if (!pane) return null;
  if (pane.kind === 'complaint') return <CreateComplaintPane caseId={caseId} onClose={onClose} />;
  if (pane.kind === 'promise') {
    return (
      <PromiseDialog
        mode={pane.mode} caseId={caseId} {...(pane.promiseId ? { promiseId: pane.promiseId } : {})}
        onClose={onClose} onSaved={() => onSaved('The promise was saved.')}
      />
    );
  }
  return (
    <ActivityDialog
      mode={pane.mode} caseId={caseId} {...(pane.activityId ? { activityId: pane.activityId } : {})}
      contextNote={pane.note} onClose={onClose}
      onSaved={() => onSaved(pane.mode === 'complete' ? 'The follow-up was completed.' : 'The action was saved.')}
    />
  );
}
