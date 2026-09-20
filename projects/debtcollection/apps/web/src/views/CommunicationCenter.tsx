import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  composePermissions, renderTemplate, selectableTemplates,
  type CommunicationRequest, type CommunicationTemplate,
  type HistoryEntry, type TemplateChannel, type TemplateLanguage,
} from '@dcp/domain';
import { Card, EmptyState, InfoBanner, StatusPill, formatDate } from '../components/primitives.js';
import { SelectField, TextAreaField, TextField } from '../components/forms.js';
import { loadTemplateCatalogue } from '../data/templateQueries.js';
import {
  nextHistoryPage, startHistory, type HistoryCursor,
} from '../data/communicationHistoryQueries.js';
import { retrieveCase, retrieveCustomer, type CustomerProfile } from '../data/caseQueries.js';
import { resolveContactHoldPolicy, type ContactHoldResolution } from '../data/contactHoldPolicy.js';
import { CommunicationService } from '../services/communicationService.js';
import { useCrmSession } from '../shell/context.js';
import { CasesView } from './index.js';

/**
 * The Communication Centre — one case, its history, and a composer.
 *
 * Three rules shape every line of this file, and all three were paid for earlier in the programme.
 *
 * **React constructs nothing.** It never names a column, never composes a payload, never learns
 * that an SMS is a Fax row. It assembles a `CommunicationRequest` and hands it to
 * `CommunicationService`, which is where the translation lives.
 *
 * **Nothing here claims a message was delivered.** DCP creates the native record; QDB's own
 * mechanism sends it, and that mechanism is not installed on the Cloud organisation (KI-83). So the
 * confirmation says the message was *handed over*, and the history shows the platform's own status
 * text rather than a word this screen invented.
 *
 * **An incomplete message is refused, not improvised.** An unresolved placeholder reaching a real
 * customer is worse than a failed send, so the Send control cannot be reached while one remains.
 */

const CHANNELS: readonly { value: TemplateChannel; label: string }[] = [
  { value: 'SMS', label: 'SMS' },
  { value: 'Email', label: 'Email' },
];

const LANGUAGES: readonly { value: TemplateLanguage; label: string }[] = [
  { value: 'English', label: 'English' },
  { value: 'Arabic', label: 'العربية' },
];

const HISTORY_PAGE = 20;

export function CommunicationCenterView({ caseId, onSelectCase }: {
  caseId?: string | undefined;
  onSelectCase: (id: string) => void;
}) {
  if (!caseId) {
    return (
      <div data-testid="view-comms">
        <InfoBanner>
          Communications belong to a case. Choose one to see its history and to send from it.
        </InfoBanner>
        <Card title="Choose a case">
          <CasesView onOpenCase={onSelectCase} />
        </Card>
      </div>
    );
  }
  return <CaseCommunications caseId={caseId} />;
}

function CaseCommunications({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const [recipient, setRecipient] = useState<CustomerProfile | null>(null);
  const [hold, setHold] = useState<ContactHoldResolution | null>(null);

  // The recipient is the case's own customer, read from whichever table the lookup points at —
  // contact for Housing Loan, account for BFD. One code path, no branch on the organisation.
  useEffect(() => {
    let live = true;
    void (async () => {
      const detail = await retrieveCase(adapter, caseId);
      if (!detail) return;

      // Keyed by the case's own organisation. HL and BFD share a Dataverse and each has its own
      // active configuration, so resolving without this key would let a decision recorded for one
      // organisation permit sending on the other's cases.
      const resolved = await resolveContactHoldPolicy(adapter, detail.organization);
      if (live) setHold(resolved);

      if (!detail.customerTable || !detail.customerId) return;
      const profile = await retrieveCustomer(adapter, detail.customerTable, detail.customerId);
      if (live) setRecipient(profile);
    })();
    return () => { live = false; };
  }, [adapter, caseId]);

  return (
    <div data-testid="view-comms" className="comms-layout">
      <InfoBanner>
        DCP records the message; <b>QDB's own mechanism delivers it</b>. This screen never reports a
        message as delivered — the status shown is the platform's own.
      </InfoBanner>

      {hold?.blocked && (
        <div className="field-error" data-testid="hold-blocked">{hold.explanation}</div>
      )}
      {hold && <Composer caseId={caseId} recipient={recipient} hold={hold} />}
      <History caseId={caseId} />
    </div>
  );
}

// ── Composing ────────────────────────────────────────────────────────────────

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'handedOver'; activityId: string; repaired: boolean }
  | { kind: 'refused'; messages: readonly string[] }
  | { kind: 'failed'; message: string };

function Composer({ caseId, recipient, hold }: {
  caseId: string;
  recipient: CustomerProfile | null;
  hold: ContactHoldResolution;
}) {
  const { adapter } = useCrmSession();
  const [catalogue, setCatalogue] = useState<readonly CommunicationTemplate[]>([]);
  const [channel, setChannel] = useState<TemplateChannel>('SMS');
  const [language, setLanguage] = useState<TemplateLanguage>('English');
  const [templateId, setTemplateId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<SendState>({ kind: 'idle' });

  useEffect(() => {
    let live = true;
    void loadTemplateCatalogue(adapter).then(loaded => { if (live) setCatalogue(loaded); });
    return () => { live = false; };
  }, [adapter]);

  const offered = useMemo(
    () => selectableTemplates(catalogue, channel, language),
    [catalogue, channel, language]);

  const template = offered.find(t => t.id === templateId) ?? null;
  const permissions = composePermissions(template);

  // Rendered once and read three times — for the preview, for the refusal message and for the
  // request. Rendering separately per use is how a preview and a sent message come to differ.
  const rendered = template ? renderTemplate(template, values) : null;

  const send = useCallback(async () => {
    if (!template || !rendered?.rendered || !recipient) return;
    setState({ kind: 'sending' });

    const request = buildRequest(caseId, channel, recipient, rendered.subject, rendered.body);
    if (!request) {
      setState({ kind: 'refused', messages: ['This case has no customer to send to.'] });
      return;
    }

    try {
      const service = new CommunicationService(adapter);
      // The id is minted here, once, when the officer commits — so a double-click or a retry
      // reaches the same record rather than creating a second one (ADR-DCP-19).
      const outcome = await service.send(crypto.randomUUID(), request, {
        contactHold: hold.verdict,
        contactHoldPolicy: hold.policy,
      });

      if (outcome.status === 'refused') {
        setState({ kind: 'refused', messages: outcome.refusals.map(r => r.message) });
      } else if (outcome.status === 'incomplete') {
        // The row exists but its recipient does not, so it is not a communication. Reported as not
        // sent, because it is not (KI-86).
        setState({ kind: 'failed', message: 'The message could not be completed. Nothing was sent — try again.' });
      } else {
        setState({ kind: 'handedOver', activityId: outcome.activityId, repaired: outcome.repaired });
      }
    } catch (error) {
      setState({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }, [adapter, caseId, channel, hold, recipient, rendered, template]);

  const unresolved = rendered && !rendered.rendered ? rendered.unresolved : [];
  // Blocked means blocked: the officer is told before composing, not after pressing Send.
  const canSend = Boolean(template) && Boolean(rendered?.rendered) && Boolean(recipient)
    && !hold.blocked && state.kind !== 'sending';

  return (
    <Card title="New message" subtitle="Templates come from configuration — no wording is written into this screen.">
      <div className="field-grid" data-testid="composer">
        <SelectField
          label="Channel" value={channel} testId="composer-channel"
          choices={CHANNELS.map(c => ({ value: c.value, label: c.label }))}
          onChange={next => { setChannel(next as TemplateChannel); setTemplateId(''); }}
        />
        <SelectField
          label="Language" value={language} testId="composer-language"
          choices={LANGUAGES.map(l => ({ value: l.value, label: l.label }))}
          onChange={next => { setLanguage(next as TemplateLanguage); setTemplateId(''); }}
        />
        <SelectField
          label="Template" value={templateId} testId="composer-template"
          placeholder={offered.length === 0 ? 'No approved template for this channel' : 'Choose a template'}
          choices={offered.map(t => ({ value: t.id, label: `${t.code} — ${t.name}` }))}
          onChange={setTemplateId}
        />
      </div>

      {offered.length === 0 && (
        <EmptyState
          icon="letter"
          message={
            'No template is available for this channel and language. A template must be active, '
            + 'approved where approval is required, and within its effective dates.'
          }
        />
      )}

      {template && (
        <>
          {template.placeholders.map(name => (
            <TextField
              key={name}
              label={name}
              testId={`placeholder-${name}`}
              value={values[name] ?? ''}
              onChange={next => setValues(current => ({ ...current, [name]: next }))}
            />
          ))}

          <TextAreaField
            label="Message"
            testId="composer-preview"
            rows={5}
            value={rendered?.rendered ? rendered.body : template.body}
            disabled={!permissions.mayEditTemplateBody}
            hint={permissions.mayEditTemplateBody
              ? 'This template allows editing before sending.'
              : 'This template’s approved wording cannot be edited.'}
            onChange={() => { /* editing lands with the free-text package */ }}
          />

          {unresolved.length > 0 && (
            <p className="field-error" data-testid="composer-unresolved">
              This message still needs {unresolved.join(', ')}. Nothing is sent until it is complete.
            </p>
          )}
        </>
      )}

      <div className="action-row">
        <button
          type="button" className="btn primary" data-testid="composer-send"
          disabled={!canSend} onClick={() => { void send(); }}
        >
          {state.kind === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>

      <SendResult state={state} />
    </Card>
  );
}

/** What happened, in words an officer can act on and with no transport terminology. */
function SendResult({ state }: { state: SendState }) {
  if (state.kind === 'idle' || state.kind === 'sending') return null;

  if (state.kind === 'handedOver') {
    return (
      <p className="hint" data-testid="send-result">
        The message has been recorded and handed to the bank&rsquo;s messaging service. It will appear
        in the history below. Delivery is reported by that service, not by this screen.
      </p>
    );
  }
  if (state.kind === 'refused') {
    return (
      <div className="field-error" data-testid="send-result">
        This message was not sent:
        <ul>{state.messages.map(message => <li key={message}>{message}</li>)}</ul>
      </div>
    );
  }
  return <p className="field-error" data-testid="send-result">{state.message}</p>;
}

/**
 * The eligibility context for this send.
 *
 * `contactHold.available: false` is the honest answer: **no authoritative QDB Contact Hold source
 * has been identified** (KI-79). Paired with `refuse-when-unverifiable`, that fails closed — a
 * customer who may be on hold is not contacted. Defaulting to allow would be the opposite of what
 * the authorisation requires, and the failure would be silent.
 */


/** Assembles the request from the case's own customer. Returns null when there is nobody to send to. */
function buildRequest(
  caseId: string,
  channel: TemplateChannel,
  customer: CustomerProfile,
  subject: string,
  body: string,
): CommunicationRequest | null {
  if (!customer.id) return null;

  return {
    channel: channel === 'Email' ? 'Email' : 'SMS',
    caseId,
    body,
    ...(channel === 'Email' ? { subject } : {}),
    recipient: {
      table: customer.table,
      id: customer.id,
      displayName: customer.displayName,
      ...(customer.mobile ? { mobile: customer.mobile } : {}),
      ...(customer.email ? { email: customer.email } : {}),
      restrictions: customer.restrictions,
    },
  };
}

// ── History ──────────────────────────────────────────────────────────────────

/**
 * The unified history.
 *
 * Paged from three native tables and merged; the browser never holds the case's whole history. The
 * "Show more" control exists because a page may legitimately come back short — the merge withholds
 * rows another source could still displace, which is a correctness property rather than an
 * inconvenience.
 */
function History({ caseId }: { caseId: string }) {
  const { adapter } = useCrmSession();
  const [entries, setEntries] = useState<readonly HistoryEntry[]>([]);
  const [cursor, setCursor] = useState<HistoryCursor>(() => startHistory());
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const more = useCallback(async (from: HistoryCursor, reset = false) => {
    setLoading(true);
    setError(null);
    try {
      const page = await nextHistoryPage(adapter, caseId, from, HISTORY_PAGE);
      setEntries(current => (reset ? page.entries : [...current, ...page.entries]));
      setCursor(page.cursor);
      setComplete(page.complete);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLoading(false);
    }
  }, [adapter, caseId]);

  useEffect(() => {
    const fresh = startHistory();
    setEntries([]);
    setComplete(false);
    void more(fresh, true);
  }, [more]);

  return (
    <Card title="Communication history" subtitle="SMS, WhatsApp, email and logged activity, in one timeline.">
      {error && <p className="field-error" data-testid="history-error">{error}</p>}

      {entries.length === 0 && !loading && !error && (
        <EmptyState icon="send" message="Nothing has been sent or logged on this case yet." />
      )}

      {entries.length > 0 && (
        <table className="comms-table" data-testid="history-table">
          <thead>
            <tr><th>When</th><th>Channel</th><th>Subject</th><th>Status</th></tr>
          </thead>
          <tbody>
            {entries.map(entry => (
              <tr key={`${entry.source}-${entry.id}`} data-testid="history-row" data-source={entry.source}>
                <td>{formatDate(entry.occurredAt)}</td>
                <td>{entry.channel}</td>
                <td>{entry.subject || '—'}</td>
                <td><StatusPill status={entry.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!complete && (
        <div className="action-row">
          <button
            type="button" className="btn" data-testid="history-more"
            disabled={loading} onClick={() => { void more(cursor); }}
          >
            {loading ? 'Loading…' : 'Show more'}
          </button>
        </div>
      )}
    </Card>
  );
}
