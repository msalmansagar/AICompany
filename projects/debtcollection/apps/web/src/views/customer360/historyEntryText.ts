import type { HistoryEntry } from '@dcp/domain';
import { statusBadgeTone, type BadgeTone } from '../../components/StatusBadge.js';
import { formatMoney } from '../../components/primitives.js';
import { formatWithShortMonths } from '../../components/shortMonths.js';

/**
 * How a history entry is worded, shared by the timeline row and the pane that opens from it, so
 * the two never describe the same record differently.
 */

const MOMENT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function momentOf(iso: string): string {
  return Number.isNaN(Date.parse(iso)) ? '—' : formatWithShortMonths(MOMENT, new Date(iso));
}

export function typeOf(entry: HistoryEntry): string {
  if (entry.category === 'communications') return entry.channel;
  if (entry.externalReference) return entry.externalReference.process === 'Complaint' ? 'Complaint / Dispute' : 'Legal';
  return entry.channel;
}

/** A hand-off says where it went; everything else says what the record says. */
export function whatHappened(entry: HistoryEntry): string {
  if (entry.externalReference?.process === 'Complaint') return 'Referred to BFD Case Management';
  if (entry.externalReference?.process === 'Legal') return 'Referred to BFD Legal';
  return entry.subject || entry.channel;
}

export function detailOf(entry: HistoryEntry): string | undefined {
  const reference = entry.externalReference;
  if (reference) {
    const owner = reference.process === 'Complaint' ? 'BFD Case Management' : 'BFD Legal';
    return `External reference ${reference.recordNumber ?? 'not yet issued'} · Lifecycle owned by ${owner}`;
  }
  const parts = [entry.detail, entry.amount !== undefined && !entry.detail ? formatMoney(entry.amount) : undefined, entry.outcome && entry.status ? `Activity ${entry.status}` : undefined];
  return parts.filter(Boolean).join(' · ') || undefined;
}

/** The recorded outcome is the badge; the activity's own status goes to the detail line. */
export function badgeFor(entry: HistoryEntry): { text: string; tone: BadgeTone } | undefined {
  if (entry.externalReference) return { text: entry.externalReference.process === 'Complaint' ? 'Complaint referral' : 'Legal referral', tone: 'referral' };
  if (entry.outcome) return { text: entry.outcome, tone: statusBadgeTone(entry.outcome) };
  if (entry.status) return { text: entry.status, tone: statusBadgeTone(entry.status) };
  return undefined;
}
