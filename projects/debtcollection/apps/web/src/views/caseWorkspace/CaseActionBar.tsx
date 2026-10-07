import type { CustomerProfile } from '../../data/caseQueries.js';
import type { CompletableWork } from '../../data/caseWorkPlan.js';
import { Icon, formatDay } from '../../components/primitives.js';
import { MenuButton, type MenuItem } from '../../components/MenuButton.js';

/**
 * The commands an officer works a case with, always in the same place and order.
 *
 * Contact ▾ · + Log action · Capture PTP · Complete follow-up · More ▾. Every command opens its pane
 * over the case; none navigates away. Only supported operations appear: there is no Legal hand-off
 * (no qualification rule is configured — KI-109) and no Reassign (ownership is not grantable yet —
 * KI-100), so neither is offered. A closed case offers nothing that writes.
 */
/** Which message channels this case can be sent on, from its organisation's configuration. */
export interface ContactChannels {
  /** The organisation's SMS table is configured (Letter on Housing Loan, Fax on BFD — never said). */
  canSms: boolean;
  /** The customer has an email address. */
  canEmail: boolean;
}

export interface CaseCommands {
  onLogAction: () => void;
  onLogCall: () => void;
  onMessage: (channel: 'SMS' | 'Email') => void;
  onCapturePromise: () => void;
  onComplete: (activityId: string) => void;
  onViewPromise: (promiseId: string) => void;
  onRaiseComplaint: () => void;
  onRecordDispute: () => void;
  onOpenResolution: () => void;
}

export function CaseActionBar({ isOpen, organization, customer, channels, followUps, commands }: {
  isOpen: boolean;
  organization: string;
  customer: CustomerProfile | undefined;
  channels: ContactChannels;
  /** What Complete follow-up offers; empty while the work is still loading or when nothing is due. */
  followUps: readonly CompletableWork[];
  commands: CaseCommands;
}) {
  if (!isOpen) {
    return <div className="cw-actions" role="toolbar" aria-label="Case commands" data-testid="cw-actions"><span className="cw-closed">This case is closed; nothing can be recorded on it.</span></div>;
  }
  return (
    <div className="cw-actions" role="toolbar" aria-label="Case commands" data-testid="cw-actions">
      <MenuButton label="Contact" icon="send" items={contactItems(customer, channels, commands)} testId="cw-contact" />
      <button type="button" className="btn primary" onClick={commands.onLogAction} data-testid="cw-log-action"><Icon name="add" />Log action</button>
      <button type="button" className="btn" onClick={commands.onCapturePromise} data-testid="cw-capture-ptp"><Icon name="promise" />Capture PTP</button>
      <CompleteFollowUp followUps={followUps} onComplete={commands.onComplete} />
      <MenuButton label="More" items={moreItems(organization, commands)} testId="cw-more" />
    </div>
  );
}

/**
 * Only channels that can be used on this case, in business words. Calls are the customer's own
 * numbers, followed by "Log the call" so the outcome is recorded without hunting for the form. SMS
 * needs the organisation's message table; Email needs an address. WhatsApp is not offered: no screen
 * can send one yet for any organisation, and a menu entry must not promise it.
 */
function contactItems(customer: CustomerProfile | undefined, channels: ContactChannels, commands: CaseCommands): readonly MenuItem[] {
  const calls: MenuItem[] = [
    ...(customer?.mobile ? [{ id: 'call-mobile', label: 'Call', hint: `Mobile ${customer.mobile}`, href: `tel:${customer.mobile}` }] : []),
    ...(customer?.phone ? [{ id: 'call-phone', label: 'Call', hint: `Phone ${customer.phone}`, href: `tel:${customer.phone}` }] : []),
  ];
  const logCall: MenuItem = { id: 'log-call', label: 'Log the call…', hint: 'Record what the customer said', onSelect: commands.onLogCall };
  const sms: MenuItem = { id: 'sms', label: 'SMS…', onSelect: () => commands.onMessage('SMS') };
  const email: MenuItem = { id: 'email', label: 'Email…', onSelect: () => commands.onMessage('Email'), ...(customer?.email ? { hint: customer.email } : {}) };
  return [...calls, ...(calls.length > 0 ? [logCall] : []), ...(channels.canSms ? [sms] : []), ...(channels.canEmail ? [email] : [])];
}

/**
 * Secondary processes. A complaint is raised in Case Management from Housing Loan cases only — the
 * Integration Service supports no other route yet — while a dispute is recorded as a collection
 * action on any case. Deceased review, Legal traces and the full picture are in Resolution.
 */
function moreItems(organization: string, commands: CaseCommands): readonly MenuItem[] {
  return [
    ...(organization === 'HL' ? [{ id: 'complaint', label: 'Raise complaint', hint: 'In Case Management', onSelect: commands.onRaiseComplaint }] : []),
    { id: 'dispute', label: 'Record a dispute', hint: 'As a collection action', onSelect: commands.onRecordDispute },
    { id: 'resolution', label: 'Resolution: complaint, legal, deceased', onSelect: commands.onOpenResolution },
  ];
}

function CompleteFollowUp({ followUps, onComplete }: { followUps: readonly CompletableWork[]; onComplete: (activityId: string) => void }) {
  if (followUps.length === 0) {
    return <button type="button" className="btn" disabled title="No follow-up is due on this case." data-testid="cw-complete-followup"><Icon name="check" />Complete follow-up</button>;
  }
  if (followUps.length === 1) {
    const only = followUps[0]!;
    return (
      <button type="button" className="btn" onClick={() => onComplete(only.activityId)} title={only.title} data-testid="cw-complete-followup">
        <Icon name="check" />Complete follow-up
      </button>
    );
  }
  const items: MenuItem[] = followUps.map(item => ({
    id: item.key, label: item.title, onSelect: () => onComplete(item.activityId),
    ...(item.dateIso ? { hint: formatDay(item.dateIso) } : {}),
  }));
  return <MenuButton label={`Complete follow-up (${followUps.length})`} icon="check" items={items} testId="cw-complete-followup" />;
}
