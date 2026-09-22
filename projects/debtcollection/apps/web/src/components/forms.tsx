import type { ReactNode } from 'react';
import type { OperationRefusal } from '@dcp/domain';
import { Icon } from './primitives.js';
import { generalRefusals, type SaveState } from '../services/useSaveOperation.js';

/**
 * The Phase 6 form vocabulary, built from the approved prototype's own classes.
 *
 * `.dialog`, `.field-grid`, `.field`, `.lbl`, `.req`, `.fluent-input`, `.fluent-select` and
 * `.dialog-foot` were all in the ported stylesheet already — the prototype designed forms, Phase 5
 * simply had none to build. So this introduces no layout and no new look: it wires existing rules to
 * the Phase 6 screens. The one genuinely new pattern is an inline field error, which uses the
 * existing `--error` token.
 *
 * Nothing in this file knows what a collection activity is. A field renders a label, a value and a
 * refusal; it has no opinion about which fields exist or when one is required, because that is
 * configuration and domain, not presentation.
 */

// ── Dialog ───────────────────────────────────────────────────────────────────

export function Dialog({ title, subtitle, onClose, children, footer, testId, wide = false }: {
  title: string;
  subtitle?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  testId: string;
  wide?: boolean;
}) {
  return (
    <div className="scrim" data-testid={`${testId}-scrim`} role="presentation">
      <div className={wide ? 'dialog lg' : 'dialog'} role="dialog" aria-modal="true" aria-label={title} data-testid={testId}>
        <div className="dialog-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <div className="hint">{subtitle}</div>}
          </div>
          <button type="button" className="close-x" onClick={onClose} aria-label="Close" data-testid={`${testId}-close`}>
            ✕
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">{footer}</div>
      </div>
    </div>
  );
}

// ── Fields ───────────────────────────────────────────────────────────────────

interface FieldShellProps {
  label: string;
  required?: boolean;
  hint?: string | undefined;
  refusal?: OperationRefusal | undefined;
  wide?: boolean;
  children: ReactNode;
}

/**
 * What a caller passes a field: everything the shell needs except its control.
 *
 * The control is the wrapper component's own job, so leaking children into the public props would let
 * a caller replace the input with anything and quietly bypass the vocabulary this file exists to keep.
 */
type FieldProps = Omit<FieldShellProps, 'children'>;

/**
 * Label, control, hint and refusal.
 *
 * The refusal renders where the user is looking — beside the field it names — rather than in a
 * summary at the top. `OperationRefusal.field` exists for exactly this: the domain says which input
 * it is talking about, so the form never has to guess from the message text.
 */
function FieldShell({ label, required, hint, refusal, wide, children }: FieldShellProps) {
  return (
    <div className={wide ? 'field col-2' : 'field'}>
      <label className="lbl">
        {label}
        {required && <span className="req">*</span>}
      </label>
      {children}
      {hint && <span className="hint-inline">{hint}</span>}
      {refusal && <span className="field-error" role="alert">{refusal.message}</span>}
    </div>
  );
}

export function TextField({ value, onChange, disabled, testId, ...shell }: FieldProps & {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <FieldShell {...shell}>
      <input
        className="fluent-input" type="text" value={value} disabled={disabled} data-testid={testId}
        onChange={event => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export function TextAreaField({ value, onChange, disabled, rows = 3, testId, ...shell }: FieldProps & {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  rows?: number;
  testId: string;
}) {
  return (
    <FieldShell {...shell} wide>
      <textarea
        className="fluent-input" value={value} rows={rows} disabled={disabled} data-testid={testId}
        onChange={event => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

/**
 * A date input.
 *
 * The control is a native `date`, which speaks `YYYY-MM-DD`, and the value it is given is trimmed to
 * that. The domain takes an ISO string either way; what matters is that the browser is never handed
 * a timestamp it will silently refuse to display, leaving a date field that looks empty over a record
 * that has one.
 */
export function DateField({ value, onChange, disabled, testId, ...shell }: FieldProps & {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <FieldShell {...shell}>
      <input
        className="fluent-input" type="date" value={value.slice(0, 10)} disabled={disabled} data-testid={testId}
        onChange={event => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export function NumberField({ value, onChange, disabled, testId, ...shell }: FieldProps & {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <FieldShell {...shell}>
      <input
        className="fluent-input" type="number" min="0" step="0.01" value={value} disabled={disabled}
        data-testid={testId} onChange={event => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

export interface SelectChoice {
  value: string;
  label: string;
  /** Rendered but not choosable — a retired configuration row an existing record still points at. */
  disabled?: boolean;
}

/**
 * A choice from configuration.
 *
 * `choices` comes from a catalogue read, never from a constant: what an officer may pick is QDB's to
 * decide. A retired row arrives here already marked `disabled`, so it shows on the record that uses
 * it without becoming available to a new one.
 */
export function SelectField({ value, choices, onChange, disabled, placeholder, testId, ...shell }: FieldProps & {
  value: string;
  choices: readonly SelectChoice[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  testId: string;
}) {
  return (
    <FieldShell {...shell}>
      <select
        className="fluent-select" value={value} disabled={disabled} data-testid={testId}
        onChange={event => onChange(event.target.value)}
      >
        <option value="">{placeholder ?? 'Choose…'}</option>
        {choices.map(choice => (
          <option key={choice.value} value={choice.value} disabled={choice.disabled}>
            {choice.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/** A read-only fact inside a form — what the record says, where an input would otherwise sit. */
export function ReadOnlyField({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label className="lbl">{label}</label>
      <div className="rv" data-readonly="true">{value}</div>
      {hint && <span className="hint-inline">{hint}</span>}
    </div>
  );
}

export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="field-grid">{children}</div>;
}

// ── The outcome of a save ────────────────────────────────────────────────────

/**
 * Renders whatever a save turned into, with the right words and the right offer.
 *
 * A concurrency conflict gets a **Reload latest** button and nothing else: there is no "save anyway",
 * because saving anyway means sending the stale payload the platform already refused, and no "merge",
 * because merging two versions of a collection note without showing the user both would quietly
 * discard somebody's work.
 *
 * None of these messages contains `412`, `ETag`, `If-Match` or `RowVersion`. A collection officer
 * cannot act on any of that, and a message a user cannot act on is a message that generates a
 * support call.
 */
export function SaveStatus({ state, onReload, testId }: {
  state: SaveState;
  /** Offered only for a conflict; a form without a reload path should not claim to have one. */
  onReload?: (() => void) | undefined;
  testId: string;
}) {
  if (state.kind === 'idle' || state.kind === 'saving') return null;

  if (state.kind === 'saved') {
    return (
      <div className="info-banner ok" data-testid={`${testId}-saved`} role="status">
        <Icon name="check" />
        <div>{state.message}</div>
      </div>
    );
  }

  if (state.kind === 'conflict') {
    return (
      <div className="info-banner warn" data-testid={`${testId}-conflict`} role="alert">
        <Icon name="warn" />
        <div>
          <b>This record was changed by someone else.</b>
          <p>{state.message}</p>
          {onReload && (
            <button type="button" className="btn" onClick={onReload} data-testid={`${testId}-reload`}>
              Reload latest
            </button>
          )}
        </div>
      </div>
    );
  }

  if (state.kind === 'failed') {
    return (
      <div className="info-banner bad" data-testid={`${testId}-failed`} role="alert">
        <Icon name="warn" />
        <div>
          <b>The save did not complete.</b>
          <p>{state.message}</p>
        </div>
      </div>
    );
  }

  // Refused. Field-level messages already render beside their inputs; these are the ones with no
  // field to sit beside, and dropping them would leave a form that refuses without saying why.
  const general = generalRefusals(state);
  if (general.length === 0) return null;
  return (
    <div className="info-banner bad" data-testid={`${testId}-refused`} role="alert">
      <Icon name="warn" />
      <div>
        {general.map(refusal => <p key={refusal.code}>{refusal.message}</p>)}
      </div>
    </div>
  );
}
