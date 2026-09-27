import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DISPUTE_LOGGING_NOTICE, activityStatusFromCode, concludability, deriveFollowUpDate,
  type ActivityStatus, type RowVersion,
} from '@dcp/domain';
import {
  Dialog, FieldGrid, ReadOnlyField, SaveStatus, SelectField, TextAreaField, TextField, DateField,
  type SelectChoice,
} from '../components/forms.js';
import { Icon, StatusPill, formatDate } from '../components/primitives.js';
import { loadActivityTypes, loadOutcomes, type ActivityTypeOption, type OutcomeOption } from '../data/configurationCatalog.js';
import { ENTITY_SETS, ACTIVITY_COLUMNS } from '../data/schema.js';
import { isConcernTypeCode } from '../data/caseConcerns.js';
import { ActivityService } from '../services/activityService.js';
import { useSaveOperation } from '../services/useSaveOperation.js';
import { useCrmSession } from '../shell/context.js';
import { describeFailure } from '../platform/errors.js';

/**
 * Logging a collection action, and working one that already exists.
 *
 * The rule this file exists to obey: **it constructs no write.** It gathers what the officer typed
 * and hands it to `ActivityService`, which asks the domain whether it is allowed and turns the answer
 * into Dataverse columns. There is no `qdb_` name here, no `@odata.bind`, no ETag and no lifecycle
 * rule — which is also why the same component works against on-premise, where the transport differs
 * and none of what this file knows does.
 *
 * What it *does* decide is presentation: which fields to show, which to mark required, and which
 * buttons to offer. All of that is a duplicate of a server-side rule and never a substitute for one.
 * An officer who reaches a forbidden transition anyway gets a refusal from the plugin, which is the
 * outcome the authorisation requires.
 */

export type ActivityDialogMode = 'create' | 'edit';

export interface ActivityDialogProps {
  mode: ActivityDialogMode;
  caseId: string;
  /** Required in `edit`; the activity being worked. */
  activityId?: string | undefined;
  onClose: () => void;
  /** Called after a successful write so the list behind the dialog re-reads. */
  onSaved: () => void;
}

/** The record as the form holds it, with the version every write must carry. */
interface LoadedActivity {
  version: RowVersion;
  status: ActivityStatus;
  statusLabel: string;
  subject: string;
  activityDate: string;
  followUpDate: string;
  notes: string;
  activityTypeId: string;
  activityNumber: string;
}

export function ActivityDialog({ mode, caseId, activityId, onClose, onSaved }: ActivityDialogProps) {
  const { adapter } = useCrmSession();
  const service = useMemo(() => new ActivityService(adapter), [adapter]);
  const save = useSaveOperation<unknown>();
  // Only the stable `reset` is taken into the read effect below. Depending on the whole save object
  // would re-create `load` whenever save state changed — and `load` calls `reset`, so the effect
  // would re-fire itself for ever. It did, before this line.
  const resetSaveState = save.reset;

  /**
   * The idempotency key, minted **once when the dialog opens** (ADR-DCP-19).
   *
   * `useState` with an initialiser rather than `useMemo`: a memo may be recomputed, and an id that
   * changed between two clicks would make the second click a different record — which is precisely
   * the duplicate this exists to prevent. Disabling the button is the visible protection; this is the
   * one that survives a retry after a response was lost.
   */
  const [newActivityId] = useState(() => crypto.randomUUID());

  const [types, setTypes] = useState<readonly ActivityTypeOption[]>([]);
  const [outcomes, setOutcomes] = useState<readonly OutcomeOption[]>([]);
  // Not known until the type's catalogue answers. Only an answered catalogue may say it is empty.
  const [catalogue, setCatalogue] = useState<'loading' | 'answered' | 'unreadable'>('loading');
  const [loaded, setLoaded] = useState<LoadedActivity | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>(mode === 'create' ? 'ready' : 'loading');
  const [loadError, setLoadError] = useState<string>('');

  // Editable state.
  const [activityTypeId, setActivityTypeId] = useState('');
  const [subject, setSubject] = useState('');
  const [activityDate, setActivityDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [followUpDate, setFollowUpDate] = useState('');
  /** Whether the date on screen was typed by the officer or previewed from configuration. */
  const [followUpSource, setFollowUpSource] = useState<'none' | 'derived' | 'user'>('none');
  const [notes, setNotes] = useState('');
  const [outcomeId, setOutcomeId] = useState('');
  const [completing, setCompleting] = useState(false);

  /** Reads the record and its version. Also the **Reload latest** path after a conflict. */
  const load = useCallback(async () => {
    if (mode === 'create' || !activityId) return;
    setLoadState('loading');
    try {
      const record = await adapter.retrieveVersioned(
        { entity: ENTITY_SETS.collectionActivity, id: activityId },
        [...ACTIVITY_COLUMNS, 'description'],
      );
      if (!record) { setLoadError('This activity could no longer be read.'); setLoadState('error'); return; }
      const next = toLoadedActivity(record.record, record.version);
      setLoaded(next);
      setActivityTypeId(next.activityTypeId);
      setSubject(next.subject);
      setActivityDate(next.activityDate);
      setFollowUpDate(next.followUpDate);
      setFollowUpSource(next.followUpDate ? 'user' : 'none');
      setNotes(next.notes);
      setLoadState('ready');
      resetSaveState();
    } catch (error) {
      setLoadError(describeFailure(error));
      setLoadState('error');
    }
  }, [adapter, activityId, mode, resetSaveState]);

  useEffect(() => { void load(); }, [load]);

  // The catalogues. The current type is passed so a retired one still renders on the record using it.
  useEffect(() => {
    let cancelled = false;
    loadActivityTypes(adapter, { currentId: loaded?.activityTypeId })
      .then(rows => { if (!cancelled) setTypes(rows); })
      .catch(() => { if (!cancelled) setTypes([]); });
    return () => { cancelled = true; };
  }, [adapter, loaded?.activityTypeId]);

  useEffect(() => {
    let cancelled = false;
    setOutcomes([]);
    setCatalogue('loading');
    if (!activityTypeId) return;
    loadOutcomes(adapter, activityTypeId)
      .then(rows => { if (!cancelled) { setOutcomes(rows); setCatalogue('answered'); } })
      .catch(() => { if (!cancelled) setCatalogue('unreadable'); });
    return () => { cancelled = true; };
  }, [adapter, activityTypeId]);

  const outcome = outcomes.find(row => row.id === outcomeId);

  /**
   * Whether this type can be concluded at all.
   *
   * One generic question, asked of the configuration — never a rule about Legal, Deceased or
   * Dispute specifically. Before this, the Complete action was offered for types with no
   * outcomes at all, and completing then changed the status with nothing recorded against it.
   */
  const concluding = concludability(catalogue === 'answered' ? outcomes.length : undefined);
  // Completion is offered only on an answered catalogue with something in it; an unknown one is
  // not permission, because the domain's zero-outcome rule cannot apply to a count nobody has.
  const canConclude = catalogue === 'answered' && concluding.available;
  const status = loaded?.status;
  const isImmutable = status === 'Completed' || status === 'Cancelled';

  /**
   * Shows the officer the follow-up configuration will write, **before** they commit.
   *
   * The runtime defect this fixes was not a lost calculation — `planCompleteActivity` derived the
   * date correctly all along. It was that the derivation happened invisibly, at save time, so an
   * officer who saved through the adjacent button saw "Saved" and no follow-up, with nothing on
   * screen to say a follow-up had ever been implied.
   *
   * **The date is the domain's, not this component's.** `deriveFollowUpDate` is the single
   * implementation of the rule; the form only displays what it returns. Computing "+3 days" here
   * would be a second implementation, and it would be the one the user believed.
   *
   * A date the officer typed is never overwritten — `followUpSource` is what tells the two apart.
   */
  useEffect(() => {
    if (followUpSource === 'user') return;
    const derived = deriveFollowUpDate(outcome, new Date());
    if (derived.kind === 'derived') {
      setFollowUpDate(derived.date.slice(0, 10));
      setFollowUpSource('derived');
      return;
    }
    // The outcome no longer implies one, so a previously previewed date must go — leaving it would
    // schedule work the chosen outcome never asked for.
    if (followUpSource === 'derived') {
      setFollowUpDate('');
      setFollowUpSource('none');
    }
  }, [outcome, followUpSource]);

  const handleCreate = () => save.run(() => service.createActivity(newActivityId, {
    caseId, activityTypeId, subject, notes,
    ...(activityDate ? { activityDate: new Date(activityDate).toISOString() } : {}),
    ...(followUpDate ? { followUpDate: new Date(followUpDate).toISOString() } : {}),
  })).then(result => { if (result) onSaved(); });

  const handleUpdate = () => {
    if (!loaded || !activityId) return;
    void save.run(() => service.updateActivity(
      { id: activityId, version: loaded.version },
      {
        currentStatus: loaded.status, subject, notes,
        ...(activityDate ? { activityDate: new Date(activityDate).toISOString() } : {}),
      },
    )).then(result => { if (result) { onSaved(); void load(); } });
  };

  const handleComplete = () => {
    if (!loaded || !activityId) return;
    void save.run(() => service.completeActivity(
      { id: activityId, version: loaded.version },
      {
        currentStatus: loaded.status,
        // What the type actually offers. Zero is a configuration fact (KI-131), and the domain
        // refuses on it rather than completing an activity with nothing recorded against it.
        configuredOutcomeCount: outcomes.length,
        ...(outcome ? { outcome } : {}),
        notes,
        ...(followUpDate ? { followUpDate: new Date(followUpDate).toISOString() } : {}),
      },
    )).then(result => { if (result) { onSaved(); void load(); } });
  };

  const handleCancelActivity = () => {
    if (!loaded || !activityId) return;
    void save.run(() => service.moveActivity(
      { id: activityId, version: loaded.version }, loaded.status, 'Cancelled',
    )).then(result => { if (result) { onSaved(); void load(); } });
  };

  const title = mode === 'create' ? 'Log a collection action' : loaded?.subject || 'Collection action';

  return (
    <Dialog
      title={title}
      subtitle={mode === 'create' ? 'Recorded against this case as soon as it is saved.' : loaded?.activityNumber}
      onClose={onClose}
      testId="activity-dialog"
      footer={
        <ActivityFooter
          mode={mode} busy={save.busy} immutable={isImmutable} completing={completing}
          canComplete={Boolean(loaded) && !isImmutable && canConclude}
          onClose={onClose}
          onCreate={() => void handleCreate()}
          onUpdate={handleUpdate}
          onStartComplete={() => { setCompleting(true); save.reset(); }}
          onComplete={handleComplete}
          onCancelActivity={handleCancelActivity}
        />
      }
    >
      {loadState === 'loading' && <div className="empty-state" data-testid="activity-dialog-loading">Loading the activity…</div>}
      {loadState === 'error' && (
        <div className="info-banner bad" data-testid="activity-dialog-load-error">
          <Icon name="warn" />
          <div><b>The activity could not be read.</b><p>{loadError}</p></div>
        </div>
      )}

      {loadState === 'ready' && (
        <>
          <SaveStatus state={save.state} onReload={mode === 'edit' ? () => void load() : undefined} testId="activity-dialog" />

          {!isImmutable && !completing && loaded && !concluding.available && (
            <div className="info-banner" data-testid="conclude-unavailable">
              <Icon name="info" />
              <div>{concluding.reason}</div>
            </div>
          )}
          {!isImmutable && !completing && loaded && catalogue === 'unreadable' && (
            <div className="info-banner" data-testid="outcomes-unreadable">
              <Icon name="info" />
              <div>The outcomes for this activity type could not be read just now, so completion is not offered.</div>
            </div>
          )}
          {!isImmutable && !completing && loaded && (
            <div className="info-banner" data-testid="activity-complete-hint">
              <Icon name="info" />
              <div>
                <b>Save changes</b> updates the subject, date and notes only. Recording an
                <b> outcome</b> — and the follow-up its configuration schedules — is done with
                <b> Complete…</b>.
              </div>
            </div>
          )}

          {isImmutable && (
            <div className="info-banner" data-testid="activity-dialog-readonly">
              <Icon name="lock" />
              <div>
                This activity is <b>{loaded?.statusLabel}</b> and is part of the record. It can be read but
                no longer changed.
              </div>
            </div>
          )}

          {isConcernTypeCode(types.find(type => type.id === activityTypeId)?.code) && (
            <div className="info-banner" data-testid="activity-dispute-notice">
              <Icon name="info" />
              <div>{DISPUTE_LOGGING_NOTICE}</div>
            </div>
          )}

          <FieldGrid>
            {loaded && <ReadOnlyField label="Status" value={<StatusPill status={loaded.statusLabel} />} />}

            <SelectField
              label="Activity type" required testId="activity-type"
              value={activityTypeId} onChange={setActivityTypeId}
              // The type is what its outcomes hang off, so changing it on an existing activity would
              // orphan a recorded outcome. It is chosen once, when the action is logged.
              disabled={mode === 'edit' || save.busy}
              choices={typeChoices(types)}
              refusal={save.refusalFor('activityTypeId')}
              hint={mode === 'edit' ? 'Set when the action was logged.' : 'From configuration.'}
            />


            <TextField
              label="Subject" required testId="activity-subject"
              value={subject} onChange={setSubject} disabled={isImmutable || save.busy}
              refusal={save.refusalFor('subject')}
            />

            <DateField
              label="When" testId="activity-date"
              value={activityDate} onChange={setActivityDate} disabled={isImmutable || save.busy}
              refusal={save.refusalFor('activityDate')}
            />

            <DateField
              label="Follow-up" testId="activity-followup"
              value={followUpDate}
              onChange={value => { setFollowUpDate(value); setFollowUpSource(value ? 'user' : 'none'); }}
              disabled={isImmutable || save.busy}
              refusal={save.refusalFor('followUpDate')}
              hint={followUpHint(completing, outcome)}
            />

            {completing && (
              <SelectField
                label="Outcome" testId="activity-outcome"
                value={outcomeId} onChange={setOutcomeId} disabled={save.busy}
                choices={outcomes.map(row => ({ value: row.id, label: row.name, disabled: !row.isActive }))}
                refusal={save.refusalFor('outcome')}
                hint={concluding.available ? 'From configuration.' : concluding.reason}
              />
            )}

            <TextAreaField
              label="Notes" testId="activity-notes"
              required={outcome?.requiresNotes === true}
              value={notes} onChange={setNotes} disabled={isImmutable || save.busy}
              refusal={save.refusalFor('notes')}
            />
          </FieldGrid>

          {completing && outcome && <OutcomeEffects outcome={outcome} />}

          {loaded && (
            <div className="hint" data-testid="activity-dialog-meta">
              Follow-up currently {loaded.followUpDate ? `set for ${formatDate(loaded.followUpDate)}` : 'not set'}.
            </div>
          )}
        </>
      )}
    </Dialog>
  );
}

/**
 * What choosing this outcome will do, shown before it is saved.
 *
 * Configuration drives the behaviour, so the officer is told what the configuration says rather than
 * being surprised by a refusal. **Escalation is stated, not performed**: `qdb_escalationrequired` is
 * recorded in Phase 6 and acted on in Phase 8, and this says exactly that instead of implying
 * something is about to happen.
 */
function OutcomeEffects({ outcome }: { outcome: OutcomeOption }) {
  return (
    <div className="outcome-effects" data-testid="outcome-effects">
      {outcome.requiresNotes && <span className="chip">A note is required</span>}
      {outcome.requiresFollowUp && (
        <span className="chip">
          {outcome.followUpDays === undefined
            ? 'A follow-up date is required'
            : `Follow-up in ${outcome.followUpDays} days`}
        </span>
      )}
      {outcome.closesActivity && <span className="chip">Closes the activity</span>}
      {outcome.escalationRequired && (
        <span className="chip" title="Recorded as configuration. Automated escalation is Phase 8.">
          Flagged for escalation — Phase 8 acts on it
        </span>
      )}
    </div>
  );
}

function ActivityFooter({
  mode, busy, immutable, completing, canComplete,
  onClose, onCreate, onUpdate, onStartComplete, onComplete, onCancelActivity,
}: {
  mode: ActivityDialogMode; busy: boolean; immutable: boolean; completing: boolean; canComplete: boolean;
  onClose: () => void; onCreate: () => void; onUpdate: () => void;
  onStartComplete: () => void; onComplete: () => void; onCancelActivity: () => void;
}) {
  if (mode === 'create') {
    return (
      <>
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          type="button" className="btn primary" onClick={onCreate} disabled={busy} data-busy={busy}
          data-testid="activity-save"
        >
          {busy ? 'Saving…' : 'Log action'}
        </button>
      </>
    );
  }

  if (immutable) {
    return <button type="button" className="btn" onClick={onClose} data-testid="activity-close">Close</button>;
  }

  return (
    <>
      <button type="button" className="btn" onClick={onClose} disabled={busy}>Close</button>
      <button
        type="button" className="btn danger" onClick={onCancelActivity} disabled={busy}
        data-testid="activity-cancel-activity"
      >
        Cancel action
      </button>
      {!completing && (
        <>
          <button
            type="button" className="btn" onClick={onUpdate} disabled={busy} data-busy={busy}
            data-testid="activity-update"
          >
            {busy ? 'Saving…' : 'Save notes & details'}
          </button>
          <button
            type="button" className="btn primary" onClick={onStartComplete} disabled={busy || !canComplete}
            data-testid="activity-start-complete"
          >
            Complete…
          </button>
        </>
      )}
      {completing && (
        <button
          type="button" className="btn primary" onClick={onComplete} disabled={busy} data-busy={busy}
          data-testid="activity-complete"
        >
          {busy ? 'Saving…' : 'Complete activity'}
        </button>
      )}
    </>
  );
}

function typeChoices(types: readonly ActivityTypeOption[]): readonly SelectChoice[] {
  return types.map(type => ({
    value: type.id,
    label: type.isActive ? type.name : `${type.name} (retired)`,
    disabled: !type.isActive,
  }));
}

function followUpHint(completing: boolean, outcome: OutcomeOption | undefined): string | undefined {
  if (!completing || !outcome?.requiresFollowUp) return undefined;
  return outcome.followUpDays === undefined
    ? 'This outcome needs a follow-up date, and configuration sets no default period.'
    : `Left blank, configuration schedules it ${outcome.followUpDays} days out.`;
}

/** Shapes the platform's row into what the form edits. Reading only — no rule lives here. */
function toLoadedActivity(record: Record<string, unknown>, version: RowVersion): LoadedActivity {
  const statusCode = typeof record['statuscode'] === 'number' ? record['statuscode'] : undefined;
  const formatted = record['statuscode@OData.Community.Display.V1.FormattedValue'];
  return {
    version,
    // An unrecognised status code is treated as Open rather than crashing the form: the server
    // decides the transition either way, and refusing to render a record because its status is
    // unfamiliar would hide work an officer can see in CRM.
    status: (statusCode !== undefined ? activityStatusFromCode(statusCode) : undefined) ?? 'Open',
    statusLabel: typeof formatted === 'string' ? formatted : 'Open',
    subject: String(record['subject'] ?? ''),
    activityDate: String(record['qdb_activitydate'] ?? '').slice(0, 10),
    followUpDate: String(record['qdb_followupdate'] ?? '').slice(0, 10),
    notes: String(record['description'] ?? ''),
    activityTypeId: String(record['_qdb_activitytypeid_value'] ?? ''),
    activityNumber: String(record['qdb_activitynumber'] ?? ''),
  };
}
