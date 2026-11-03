import { ActivityDialog } from './ActivityDialog.js';
import { PromiseDialog } from './PromiseDialog.js';

/**
 * The two writes a list can start on its chosen case — V1's own dialogs, which carry the business
 * rules, re-skinned rather than copied. Whichever list hosts them, the case id is the only thing they
 * need, and a save is reported back so the host can re-read what it shows.
 */
export type CaseCommandDialog = 'activity' | 'promise' | null;

export function CaseCommandDialogs({ caseId, dialog, onClose, onSaved, contextNote }: {
  caseId: string | undefined;
  dialog: CaseCommandDialog;
  onClose: () => void;
  onSaved: (message: string) => void;
  /** Which unit and case the command was opened for, when the caller chose it on the officer's behalf. */
  contextNote?: string | undefined;
}) {
  if (!caseId || dialog === null) return null;
  if (dialog === 'activity') {
    return <ActivityDialog mode="create" caseId={caseId} onClose={onClose} onSaved={() => onSaved('Action recorded.')} contextNote={contextNote} />;
  }
  return <PromiseDialog mode="create" caseId={caseId} onClose={onClose} onSaved={() => onSaved('Promise recorded.')} />;
}
