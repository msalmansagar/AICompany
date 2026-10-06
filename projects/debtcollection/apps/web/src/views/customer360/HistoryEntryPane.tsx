import type { HistoryEntry } from '@dcp/domain';
import { ActivityDialog } from '../ActivityDialog.js';
import { Dialog } from '../../components/forms.js';
import { OwnerLabel } from '../../components/OwnerLabel.js';
import { StatusBadge } from '../../components/StatusBadge.js';
import { badgeFor, detailOf, momentOf, typeOf, whatHappened } from './historyEntryText.js';

type EntryContext = { unit: string; caseNumber: string } | undefined;

/**
 * The record behind a history row, in the right-side pane, over the list it was opened from.
 *
 * A collection activity opens in the same activity pane the case uses, so it can be read, updated
 * or completed there — CRM security decides which. A message or a hand-off is shown as the platform
 * recorded it, read-only: DCP does not edit a sent message, and a hand-off's lifecycle belongs to
 * BFD Case Management or BFD Legal.
 */
export function HistoryEntryPane({ entry, context, onClose, onSaved }: {
  entry: HistoryEntry; context: EntryContext; onClose: () => void; onSaved: () => void;
}) {
  if (entry.source === 'activity' && entry.caseId) {
    return <ActivityDialog mode="edit" caseId={entry.caseId} activityId={entry.id} onClose={onClose} onSaved={onSaved} contextNote={contextNoteOf(context)} />;
  }
  return <HistoryRecordDetails entry={entry} context={context} onClose={onClose} />;
}

function contextNoteOf(context: EntryContext): string | undefined {
  return context ? `${context.unit} · Case ${context.caseNumber}` : undefined;
}

function HistoryRecordDetails({ entry, context, onClose }: { entry: HistoryEntry; context: EntryContext; onClose: () => void }) {
  const badge = badgeFor(entry);
  const footer = <button type="button" className="btn" onClick={onClose} data-testid="history-record-close-button">Close</button>;
  return (
    <Dialog title={whatHappened(entry)} subtitle={`${typeOf(entry)} · ${momentOf(entry.occurredAt)}`} onClose={onClose} footer={footer} testId="history-record">
      <dl className="history-record-fields">
        <dt>Status</dt><dd>{badge ? <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge> : 'Not recorded'}</dd>
        <dt>Direction</dt><dd>{DIRECTION_LABELS[entry.direction]}</dd>
        <dt>Subject</dt><dd>{entry.subject || '—'}</dd>
        <dt>Detail</dt><dd>{detailOf(entry) ?? '—'}</dd>
        <dt>Where</dt><dd>{context ? `${context.unit} · Case ${context.caseNumber}` : 'Case not recorded'}</dd>
        <dt>Recorded by</dt><dd><OwnerLabel ownerId={entry.recordedById} ownerName={entry.recordedBy} /></dd>
      </dl>
    </Dialog>
  );
}

const DIRECTION_LABELS: Readonly<Record<HistoryEntry['direction'], string>> = {
  outbound: 'To the customer', inbound: 'From the customer', unknown: 'Not recorded',
};
