import { useState, useRef, useCallback } from 'react';
import { ConditionBuilder, type ConditionBuilderHandle } from '@/components/FetchXmlBuilder/ConditionBuilder';
import { parseFetchXmlFilter, formatReadableFilter } from '@/services/fetchXmlReadable';
import { findRouteDraftErrors, canSaveRouteDraft, errorFor } from '@/services/routeDraftValidation';
import type { RouteDraft } from '@/services/routeDraftValidation';
import { EMPTY_FILTER } from '@/services/routeFilter';
import type { WorkflowStep } from '@/types/WorkflowTypes';

/**
 * The Route Configuration screen.
 *
 * Everything a route needs lives here, including the condition builder itself rather
 * than a second dialog stacked on this one. Save stays disabled until the builder has
 * actually loaded and every mandatory field is filled, because each of those omissions
 * fails later and less helpfully: two are refused by the engine and one is dropped by
 * the save path.
 */

interface RouteConfigDialogProps {
  open: boolean;
  /** Steps this route may lead to. */
  availableSteps: readonly WorkflowStep[];
  /** Sequence to suggest, normally one past the highest already used. */
  suggestedSequence: number;
  /** Whether the decision already has a fallback, so the effect of choosing one is clear. */
  hasExistingFallback: boolean;
  entityLogicalName: string;
  objectTypeCode: number;
  clientUrl: string;
  onSave: (draft: RouteDraft) => void;
  onDismiss: () => void;
}

export function RouteConfigDialog({
  open,
  availableSteps,
  suggestedSequence,
  hasExistingFallback,
  entityLogicalName,
  objectTypeCode,
  clientUrl,
  onSave,
  onDismiss,
}: RouteConfigDialogProps) {
  const [name, setName] = useState('');
  const [sequenceNumber, setSequenceNumber] = useState(suggestedSequence);
  const [nextStepId, setNextStepId] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(false);
  const [filter, setFilter] = useState('');
  const [isBuilderReady, setIsBuilderReady] = useState(false);
  const [hasAttemptedSave, setHasAttemptedSave] = useState(false);
  const builderRef = useRef<ConditionBuilderHandle>(null);

  const draft: RouteDraft = { name, sequenceNumber, nextStepId, isDefault, filter };
  const errors = findRouteDraftErrors(draft);
  const showErrors = hasAttemptedSave;

  // The iframe builder holds the live query inside the CRM control, so the current
  // condition is only known once it has been read out.
  const captureCondition = useCallback((): string => {
    const read = builderRef.current?.read() ?? null;
    const captured = read ?? filter;
    setFilter(captured);
    return captured;
  }, [filter]);

  function handleSave(): void {
    setHasAttemptedSave(true);
    const captured = isDefault ? EMPTY_FILTER : captureCondition();
    const finalDraft: RouteDraft = { ...draft, filter: captured };
    if (!canSaveRouteDraft(finalDraft, isBuilderReady)) return;
    onSave(finalDraft);
  }

  if (!open) return null;

  const readable = parseFetchXmlFilter(filter);
  const saveBlockedReason = !isBuilderReady
    ? 'Waiting for the condition builder to load…'
    : errors.length > 0
      ? `${errors.length} field${errors.length === 1 ? '' : 's'} still to complete`
      : null;

  return (
    <div className="dialog-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="dialog" style={{ width: 'min(880px, 94vw)' }} role="dialog" aria-modal="true" aria-label="Route configuration">
        <div className="dialog-head">
          <h2>Route configuration</h2>
        </div>

        <div className="dialog-body" style={bodyStyle}>
          <div style={fieldRow}>
            <Field label="Route name" error={showErrors ? errorFor(errors, 'name') : null}>
              <input
                className="fluent-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. CEO Approval"
                autoFocus
              />
            </Field>

            <Field label="Sequence" error={showErrors ? errorFor(errors, 'sequenceNumber') : null} width={110}>
              <input
                className="fluent-input"
                type="number"
                min={1}
                value={sequenceNumber}
                onChange={(e) => setSequenceNumber(parseInt(e.target.value, 10))}
              />
            </Field>
          </div>

          <Field label="Next step" error={showErrors ? errorFor(errors, 'nextStepId') : null}>
            <select
              className="fluent-select"
              value={nextStepId ?? ''}
              onChange={(e) => setNextStepId(e.target.value || null)}
            >
              <option value="">— Choose a step —</option>
              {availableSteps.map((step) => (
                <option key={step.crmId} value={step.crmId}>
                  {step.sequenceNo}. {step.name}
                </option>
              ))}
            </select>
          </Field>

          <label style={checkRow}>
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            <span>
              <b>Fallback route</b> — taken when no other route matches. Needs no condition.
              {isDefault && hasExistingFallback && (
                <em style={replaceNote}> This will replace the decision&apos;s current fallback.</em>
              )}
            </span>
          </label>

          {!isDefault && (
            <div>
              <div className="lbl" style={{ marginBottom: 4 }}>Condition</div>
              {showErrors && errorFor(errors, 'condition') && (
                <div className="notice error" role="alert" style={{ marginBottom: 8 }}>
                  {errorFor(errors, 'condition')}
                </div>
              )}
              <ConditionBuilder
                ref={builderRef}
                entityLogicalName={entityLogicalName}
                objectTypeCode={objectTypeCode}
                clientUrl={clientUrl}
                onReadyChange={setIsBuilderReady}
                onChange={setFilter}
              />
              <button type="button" className="btn" style={{ marginTop: 8 }} onClick={captureCondition}>
                Preview condition
              </button>
              {readable && (
                <div style={readableBox}>
                  {formatReadableFilter(readable).map((line, i) => (
                    <div key={i} style={readableLine}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dialog-foot">
          {saveBlockedReason && <span style={blockedNote}>{saveBlockedReason}</span>}
          <button type="button" className="btn" onClick={onDismiss}>Cancel</button>
          <button
            type="button"
            className="btn primary"
            onClick={handleSave}
            disabled={!isBuilderReady}
            title={saveBlockedReason ?? 'Save this route'}
          >
            Save route
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  width,
  children,
}: {
  label: string;
  error: string | null;
  width?: number;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: width ? '0 0 auto' : 1, width }}>
      <div className="lbl">{label}</div>
      {children}
      {error && <div style={errorText} role="alert">{error}</div>}
    </div>
  );
}

const bodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  maxHeight: '68vh',
  overflowY: 'auto',
};

const fieldRow: React.CSSProperties = { display: 'flex', gap: 12, alignItems: 'flex-start' };

const checkRow: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'flex-start',
  fontSize: 12.5,
  lineHeight: 1.5,
  cursor: 'pointer',
};

const replaceNote: React.CSSProperties = { color: 'var(--warning)', fontStyle: 'italic' };

const errorText: React.CSSProperties = { fontSize: 11.5, color: 'var(--error)' };

const blockedNote: React.CSSProperties = {
  marginRight: 'auto',
  fontSize: 11.5,
  color: 'var(--text-secondary)',
};

const readableBox: React.CSSProperties = {
  marginTop: 8,
  background: 'var(--surface-alt)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '8px 10px',
};

const readableLine: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  lineHeight: 1.65,
  whiteSpace: 'pre',
  color: 'var(--text)',
};
