import type { KeyboardEvent, ReactNode } from 'react';
import { Icon } from '../../components/primitives.js';
import { bucketVisual } from '../data/bucketVisual.js';

/**
 * Workspace V2's building blocks. Presentation only: every value they show is passed in, formatted by
 * the caller from real data. None of them fetches, decides or defaults a business value.
 */

export function Card({ title, subtitle, actions, children, flush = false, testId }: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  /** Content runs edge to edge — lists and grids. */
  flush?: boolean;
  testId?: string;
}) {
  return (
    <section className="v2-card" data-testid={testId}>
      {(title || actions) && (
        <header className="v2-card-head">
          <div className="v2-card-heading">
            {title && <h2 className="v2-card-title">{title}</h2>}
            {subtitle && <p className="v2-card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="v2-card-actions">{actions}</div>}
        </header>
      )}
      <div className={flush ? 'v2-card-body v2-card-flush' : 'v2-card-body'}>{children}</div>
    </section>
  );
}

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONE_ICON: Readonly<Record<Tone, string>> = {
  success: 'check', warning: 'warn', danger: 'warn', info: 'info', neutral: 'info',
};

/**
 * A status, always as icon + text + colour — colour is never the only signal. The caller names the
 * tone from real state; this component never infers one.
 */
export function StatusBadge({ tone, children, testId }: { tone: Tone; children: ReactNode; testId?: string }) {
  return (
    <span className="v2-status" data-tone={tone} data-testid={testId}>
      <Icon name={TONE_ICON[tone]} className="v2-status-icon" />
      <span>{children}</span>
    </span>
  );
}

/** A delinquency bucket, tinted by its MIS position (`bucketVisual`) and always labelled. */
export function BucketBadge({ bucket }: { bucket?: string | undefined }) {
  if (!bucket) return <span className="v2-muted">—</span>;
  const visual = bucketVisual(bucket);
  return <span className="v2-bucket" data-bucket={visual.rank} title={visual.description}>{visual.label}</span>;
}

/**
 * The small bucket dot from the reference — a colour cue beside a label that already says the
 * bucket, so it is hidden from assistive technology and never carries meaning on its own.
 */
export function BucketDot({ bucket }: { bucket?: string | undefined }) {
  return <span className="v2-bucket-dot" data-bucket={bucketVisual(bucket).rank} aria-hidden="true" />;
}

/**
 * One figure. An unknown value is shown as unknown — an em dash and the reason — never as zero.
 */
export function MetricTile({ label, value, sub, tone, onOpen, testId }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone | undefined;
  onOpen?: (() => void) | undefined;
  testId?: string;
}) {
  const body = (
    <>
      <span className="v2-metric-label">{label}</span>
      <span className="v2-metric-value" data-tone={tone}>{value}</span>
      {sub && <span className="v2-metric-sub">{sub}</span>}
    </>
  );
  return onOpen
    ? <button type="button" className="v2-metric v2-metric-link" onClick={onOpen} data-testid={testId}>{body}</button>
    : <div className="v2-metric" data-testid={testId}>{body}</div>;
}

/**
 * Nothing to show — and why. *No data exists* and *nothing matches your filters* are different
 * answers, and the caller says which.
 */
export function EmptyState({ title, message, action, testId }: {
  title: string;
  message?: ReactNode;
  action?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="v2-empty" role="status" data-testid={testId}>
      <p className="v2-empty-title">{title}</p>
      {message && <p className="v2-empty-message">{message}</p>}
      {action}
    </div>
  );
}

/** A read that failed. The officer sees a sentence and a retry; the platform's text stays in the console. */
export function ErrorState({ title = 'This could not be loaded.', message, onRetry, testId }: {
  title?: string;
  message?: ReactNode;
  onRetry?: (() => void) | undefined;
  testId?: string;
}) {
  return (
    <div className="v2-error" role="alert" data-testid={testId}>
      <Icon name="warn" className="v2-error-icon" />
      <div className="v2-error-body">
        <p className="v2-error-title">{title}</p>
        {message && <p className="v2-error-message">{message}</p>}
      </div>
      {onRetry && <button type="button" className="v2-btn" onClick={onRetry}>Retry</button>}
    </div>
  );
}

/** Placeholder rows while the first read is in flight. */
export function LoadingSkeleton({ rows = 4, label = 'Loading', testId }: { rows?: number; label?: string; testId?: string }) {
  return (
    <div className="v2-skeleton" role="status" aria-busy="true" aria-label={label} data-testid={testId}>
      {Array.from({ length: rows }, (_unused, index) => <span key={index} className="v2-skeleton-line" />)}
    </div>
  );
}

export interface KeyValue { label: string; value: ReactNode }

/** Label / value pairs, as a description list. */
export function KeyValueList({ items, testId }: { items: readonly KeyValue[]; testId?: string }) {
  return (
    <dl className="v2-kv" data-testid={testId}>
      {items.map(item => (
        <div key={item.label} className="v2-kv-row">
          <dt className="v2-kv-label">{item.label}</dt>
          <dd className="v2-kv-value">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface TabItem { id: string; label: string; count?: number | undefined }

/** A tab strip with the ARIA tab pattern; arrow keys move between tabs. */
export function Tabs({ tabs, active, onSelect, label, testId }: {
  tabs: readonly TabItem[];
  active: string;
  onSelect: (id: string) => void;
  label: string;
  testId?: string;
}) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = tabs[(index + step + tabs.length) % tabs.length];
    if (next) onSelect(next.id);
  };
  return (
    <div className="v2-tabs" role="tablist" aria-label={label} data-testid={testId}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="v2-tab"
          aria-selected={tab.id === active}
          tabIndex={tab.id === active ? 0 : -1}
          data-testid={`v2-tab-${tab.id}`}
          onClick={() => onSelect(tab.id)}
          onKeyDown={event => move(event, index)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="v2-tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** A row of commands. Only real, available commands are passed in. */
export function CommandBar({ children, label = 'Commands' }: { children: ReactNode; label?: string }) {
  return <div className="v2-commandbar" role="toolbar" aria-label={label}>{children}</div>;
}

export function CommandButton({ icon, label, onClick, isPrimary = false, disabledReason, testId }: {
  icon?: string;
  label: string;
  onClick?: () => void;
  isPrimary?: boolean;
  /** Why it cannot be used here and now. A command for a capability that does not exist is not rendered. */
  disabledReason?: string | undefined;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={isPrimary ? 'v2-btn v2-btn-primary' : 'v2-btn v2-btn-subtle'}
      onClick={disabledReason ? undefined : onClick}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? label}
      data-testid={testId}
    >
      {icon && <Icon name={icon} className="v2-btn-icon" />}
      <span>{label}</span>
    </button>
  );
}

export interface ChipOption {
  id: string;
  /** Text, or text with a cue beside it — a bucket dot, say. */
  label: ReactNode;
  count?: string | undefined;
  /** Why this option cannot be chosen. The option stays visible, so the officer learns why. */
  disabledReason?: string | undefined;
}

/** Single-choice filter chips. The count, when shown, is the source's own answer. */
export function FilterChips({ label, options, selected, onSelect, testId }: {
  label: string;
  options: readonly ChipOption[];
  selected: string;
  onSelect: (id: string) => void;
  testId?: string;
}) {
  return (
    <div className="v2-chips" role="group" aria-label={label} data-testid={testId}>
      <span className="v2-chips-label">{label}</span>
      {options.map(option => (
        <button
          key={option.id}
          type="button"
          className="v2-chip"
          aria-pressed={option.id === selected}
          disabled={Boolean(option.disabledReason)}
          title={option.disabledReason}
          data-testid={`v2-chip-${option.id}`}
          onClick={() => onSelect(option.id)}
        >
          {option.label}
          {option.count !== undefined && <span className="v2-chip-count">{option.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Makes a clickable row reachable and usable from the keyboard. */
export function rowActivation(onActivate: () => void) {
  return {
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onActivate(); }
    },
  };
}
