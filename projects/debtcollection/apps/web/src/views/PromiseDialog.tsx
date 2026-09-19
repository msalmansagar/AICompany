import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  PTP_TRANSITIONS, describePromiseVerification, ptpStatusFromCode,
  type PtpStatus, type RowVersion,
} from '@dcp/domain';
import {
  DateField, Dialog, FieldGrid, NumberField, ReadOnlyField, SaveStatus, SelectField, TextAreaField,
  TextField,
} from '../components/forms.js';
import { Icon, StatusPill, formatDate, formatMoney } from '../components/primitives.js';
import { loadActivityTypes, type ActivityTypeOption } from '../data/configurationCatalog.js';
import { ENTITY_SETS, PTP_COLUMNS } from '../data/schema.js';
import { ActivityService } from '../services/activityService.js';
import { useSaveOperation } from '../services/useSaveOperation.js';
import { useCrmSession } from '../shell/context.js';

/**
 * Capturing and working a promise to pay.
 *
 * A promise is a **collection activity carrying promise columns** — `qdb_collectionactivity` with an
 * activity type of PTP — and this form never suggests otherwise. There is no promise entity to
 * create, no parallel model, and the same service and the same concurrency guard as every other
 * activity.
 *
 * The hardest requirement in this file is a negative one: **nothing here may imply that a promise
 * outcome has been financially verified.** A collector marking a promise Kept is recording what they
 * believe happened. Nothing in the platform can confirm that money arrived — the MIS payment
 * contract does not exist (KI-53) — so a recorded outcome is shown with the fact that it is
 * unverified attached to it, every time, rather than as a green tick that reads as settled.
 *
 * No limit is offered or enforced on the amount, the horizon, or how many promises a case may carry.
 * All of those are QDB policy and none is in evidence (**KI-72**).
 */

export type PromiseDialogMode = 'create' | 'edit';

export interface PromiseDialogProps {
  mode: PromiseDialogMode;
  caseId: string;
  promiseId?: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}

interface LoadedPromise {
  version: RowVersion;
  status: PtpStatus;
  statusLabel: string;
  subject: string;
  promisedAmount: string;
  promiseDate: string;
  amountReceived: string;
  paymentDate: string;
  brokenReason: string;
  notes: string;
}

/** The code the PTP activity type carries, as seeded for Phase 6 and configured thereafter. */
const PROMISE_TYPE_CODE_FRAGMENT = 'PTP';

export function PromiseDialog({ mode, caseId, promiseId, onClose, onSaved }: PromiseDialogProps) {
  const { adapter } = useCrmSession();
  const service = useMemo(() => new ActivityService(adapter), [adapter]);
  const save = useSaveOperation<unknown>();
  // Only the stable `reset` is taken into the read effect below. Depending on the whole save object
  // would re-create `load` whenever save state changed — and `load` calls `reset`, so the effect
  // would re-fire itself for ever. It did, before this line.
  const resetSaveState = save.reset;

  /** Minted once on open — the idempotency key of ADR-DCP-19, not a per-click value. */
  const [newPromiseId] = useState(() => crypto.randomUUID());

  const [types, setTypes] = useState<readonly ActivityTypeOption[]>([]);
  const [loaded, setLoaded] = useState<LoadedPromise | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(mode === 'create' ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState('');

  const [subject, setSubject] = useState('Promise to pay');
  const [promisedAmount, setPromisedAmount] = useState('');
  const [promiseDate, setPromiseDate] = useState('');
  const [promiseType, setPromiseType] = useState<'Full' | 'Partial' | ''>('');
  const [notes, setNotes] = useState('');

  // Recording an outcome.
  const [targetStatus, setTargetStatus] = useState<PtpStatus | ''>('');
  const [amountReceived, setAmountReceived] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [brokenReason, setBrokenReason] = useState('');

  const load = useCallback(async () => {
    if (mode === 'create' || !promiseId) return;
    setLoadState('loading');
    try {
      const record = await adapter.retrieveVersioned(
        { entity: ENTITY_SETS.collectionActivity, id: promiseId },
        [...PTP_COLUMNS, 'description'],
      );
      if (!record) { setLoadError('This promise could no longer be read.'); setLoadState('error'); return; }
      const next = toLoadedPromise(record.record, record.version);
      setLoaded(next);
      setSubject(next.subject);
      setPromisedAmount(next.promisedAmount);
      setPromiseDate(next.promiseDate);
      setNotes(next.notes);
      setTargetStatus('');
      setLoadState('ready');
      resetSaveState();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setLoadState('error');
    }
  }, [adapter, promiseId, mode, resetSaveState]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    loadActivityTypes(adapter)
      .then(rows => { if (!cancelled) setTypes(rows); })
      .catch(() => { if (!cancelled) setTypes([]); });
    return () => { cancelled = true; };
  }, [adapter]);

  /**
   * The activity type a new promise is logged under.
   *
   * Found in configuration by its code rather than hard-coded as a GUID: the id differs between the
   * sandbox, on-premise and production, and a constant here would work in exactly one of them.
   */
  const promiseTypeRow = types.find(type => (type.code ?? '').toUpperCase().includes(PROMISE_TYPE_CODE_FRAGMENT));
  const status = loaded?.status;
  const settled = status !== undefined && !['Active', 'Rescheduled'].includes(status);
  const allowedTransitions = status ? PTP_TRANSITIONS[status] : [];

  const handleCreate = () => save.run(() => service.createPromise(newPromiseId, {
    caseId,
    activityTypeId: promiseTypeRow?.id ?? '',
    subject,
    promisedAmount: Number(promisedAmount),
    promiseDate: promiseDate ? new Date(promiseDate).toISOString() : '',
    ...(promiseType ? { promiseType } : {}),
    notes,
  })).then(result => { if (result) onSaved(); });

  const handleUpdate = () => {
    if (!loaded || !promiseId) return;
    void save.run(() => service.updatePromise(
      { id: promiseId, version: loaded.version },
      {
        currentStatus: loaded.status,
        promisedAmount: Number(promisedAmount),
        notes,
        ...(promiseDate ? { promiseDate: new Date(promiseDate).toISOString() } : {}),
      },
    )).then(result => { if (result) { onSaved(); void load(); } });
  };

  const handleTransition = () => {
    if (!loaded || !promiseId || !targetStatus) return;
    void save.run(() => service.movePromise(
      { id: promiseId, version: loaded.version }, loaded.status, targetStatus,
      {
        ...(amountReceived ? { amountReceived: Number(amountReceived) } : {}),
        ...(paymentDate ? { paymentDate: new Date(paymentDate).toISOString() } : {}),
        ...(brokenReason ? { brokenReason } : {}),
      },
    )).then(result => { if (result) { onSaved(); void load(); } });
  };

  return (
    <Dialog
      title={mode === 'create' ? 'Capture a promise to pay' : 'Promise to pay'}
      subtitle={mode === 'create' ? 'Recorded as a collection activity on this case.' : loaded?.subject}
      onClose={onClose}
      testId="promise-dialog"
      wide
      footer={
        mode === 'create'
          ? (
            <>
              <button type="button" className="btn" onClick={onClose} disabled={save.busy}>Cancel</button>
              <button
                type="button" className="btn primary" onClick={() => void handleCreate()}
                disabled={save.busy} data-busy={save.busy} data-testid="promise-save"
              >
                {save.busy ? 'Saving…' : 'Capture promise'}
              </button>
            </>
          )
          : (
            <>
              <button type="button" className="btn" onClick={onClose} disabled={save.busy}>Close</button>
              {!settled && (
                <button
                  type="button" className="btn" onClick={handleUpdate} disabled={save.busy} data-busy={save.busy}
                  data-testid="promise-update"
                >
                  {save.busy ? 'Saving…' : 'Save terms'}
                </button>
              )}
              {allowedTransitions.length > 0 && (
                <button
                  type="button" className="btn primary" onClick={handleTransition}
                  disabled={save.busy || !targetStatus} data-busy={save.busy} data-testid="promise-transition"
                >
                  {save.busy ? 'Saving…' : 'Record outcome'}
                </button>
              )}
            </>
          )
      }
    >
      {loadState === 'loading' && <div className="empty-state" data-testid="promise-dialog-loading">Loading the promise…</div>}
      {loadState === 'error' && (
        <div className="info-banner bad" data-testid="promise-dialog-load-error">
          <Icon name="warn" />
          <div><b>The promise could not be read.</b><p>{loadError}</p></div>
        </div>
      )}

      {loadState === 'ready' && (
        <>
          <SaveStatus state={save.state} onReload={mode === 'edit' ? () => void load() : undefined} testId="promise-dialog" />

          {mode === 'create' && !promiseTypeRow && (
            <div className="info-banner warn" data-testid="promise-no-type">
              <Icon name="warn" />
              <div>
                <b>No promise activity type is configured.</b>
                <p>
                  A promise is logged against an activity type whose code identifies it as a promise to
                  pay. Until one is active in configuration, a promise cannot be captured here.
                </p>
              </div>
            </div>
          )}

          <UnverifiedNotice status={status} />

          {settled && (
            <div className="info-banner" data-testid="promise-settled">
              <Icon name="lock" />
              <div>
                This promise is <b>{loaded?.statusLabel}</b>. Its terms are part of the record and can no
                longer be changed.
              </div>
            </div>
          )}

          <FieldGrid>
            {loaded && (
              <ReadOnlyField
                label="Current status"
                value={<StatusPill status={loaded.statusLabel} />}
                hint="Recorded by a collection officer."
              />
            )}

            <TextField
              label="Subject" required testId="promise-subject"
              value={subject} onChange={setSubject} disabled={settled || save.busy}
              refusal={save.refusalFor('subject')}
            />

            <NumberField
              label="Promised amount" required testId="promise-amount"
              value={promisedAmount} onChange={setPromisedAmount} disabled={settled || save.busy}
              refusal={save.refusalFor('promisedAmount')}
            />

            <DateField
              label="Promised for" required testId="promise-date"
              value={promiseDate} onChange={setPromiseDate} disabled={settled || save.busy}
              refusal={save.refusalFor('promiseDate')}
            />

            {mode === 'create' && (
              <SelectField
                label="Promise type" testId="promise-type"
                value={promiseType} onChange={value => setPromiseType(value as 'Full' | 'Partial' | '')}
                disabled={save.busy}
                choices={[{ value: 'Full', label: 'Full' }, { value: 'Partial', label: 'Partial' }]}
              />
            )}

            <TextAreaField
              label="Notes" testId="promise-notes"
              value={notes} onChange={setNotes} disabled={settled || save.busy}
              refusal={save.refusalFor('notes')}
            />
          </FieldGrid>

          {mode === 'edit' && loaded && (
            <RecordedOutcome loaded={loaded} />
          )}

          {mode === 'edit' && allowedTransitions.length > 0 && (
            <>
              <h3>Record what happened</h3>
              <FieldGrid>
                <SelectField
                  label="Outcome" testId="promise-target-status"
                  value={targetStatus} onChange={value => setTargetStatus(value as PtpStatus | '')}
                  disabled={save.busy}
                  choices={allowedTransitions.map(next => ({ value: next, label: PTP_STATUS_LABELS[next] }))}
                  hint="Only the transitions the lifecycle permits are offered. The server enforces the same rule."
                  refusal={save.refusalFor('ptpStatus')}
                />
                <NumberField
                  label="Amount the customer reported paying" testId="promise-amount-received"
                  value={amountReceived} onChange={setAmountReceived} disabled={save.busy}
                  refusal={save.refusalFor('amountReceived')}
                  hint="What the officer was told. Not a verified payment."
                />
                <DateField
                  label="Reported payment date" testId="promise-payment-date"
                  value={paymentDate} onChange={setPaymentDate} disabled={save.busy}
                  refusal={save.refusalFor('paymentDate')}
                />
                {targetStatus === 'Broken' && (
                  <TextAreaField
                    label="Why it was broken" testId="promise-broken-reason"
                    value={brokenReason} onChange={setBrokenReason} disabled={save.busy}
                  />
                )}
              </FieldGrid>
            </>
          )}
        </>
      )}
    </Dialog>
  );
}

/**
 * The verification line, stated wherever a promise outcome is shown.
 *
 * `describePromiseVerification` is the single source of this sentence, so no screen has to remember
 * to say it and none can drift into implying something stronger.
 */
function UnverifiedNotice({ status }: { status: PtpStatus | undefined }) {
  if (!status || status === 'Active' || status === 'Rescheduled') return null;
  const described = describePromiseVerification(status);
  return (
    <div className="info-banner" data-testid="promise-unverified" data-verified="false">
      <Icon name="info" />
      <div>
        <b>Recorded, not verified.</b>
        <p>{described.note}</p>
      </div>
    </div>
  );
}

/** What was recorded against the promise, shown as facts rather than as a settlement. */
function RecordedOutcome({ loaded }: { loaded: LoadedPromise }) {
  if (!loaded.amountReceived && !loaded.paymentDate && !loaded.brokenReason) return null;
  return (
    <>
      <h3>What was recorded</h3>
      <FieldGrid>
        <ReadOnlyField
          label="Amount reported"
          value={loaded.amountReceived ? formatMoney(Number(loaded.amountReceived)) : '—'}
          hint="As the customer reported it to the officer."
        />
        <ReadOnlyField label="Reported payment date" value={formatDate(loaded.paymentDate) } />
        {loaded.brokenReason && <ReadOnlyField label="Broken reason" value={loaded.brokenReason} />}
      </FieldGrid>
    </>
  );
}

/** Labels for the promise statuses, matching the provisioned choice. */
const PTP_STATUS_LABELS: Readonly<Record<PtpStatus, string>> = {
  Active: 'Active',
  Kept: 'Kept',
  PartiallyKept: 'Partially kept',
  Broken: 'Broken',
  Rescheduled: 'Rescheduled',
  Cancelled: 'Cancelled',
};

function toLoadedPromise(record: Record<string, unknown>, version: RowVersion): LoadedPromise {
  const statusCode = typeof record['qdb_ptpstatus'] === 'number' ? record['qdb_ptpstatus'] : undefined;
  const formatted = record['qdb_ptpstatus@OData.Community.Display.V1.FormattedValue'];
  const text = (key: string) => String(record[key] ?? '');
  return {
    version,
    status: (statusCode !== undefined ? ptpStatusFromCode(statusCode) : undefined) ?? 'Active',
    statusLabel: typeof formatted === 'string' ? formatted : 'Active',
    subject: text('subject'),
    promisedAmount: text('qdb_promisedamount'),
    promiseDate: text('qdb_ptpdate').slice(0, 10),
    amountReceived: text('qdb_amountreceived'),
    paymentDate: text('qdb_paymentreceiveddate').slice(0, 10),
    brokenReason: text('qdb_brokenreason'),
    notes: text('description'),
  };
}
