import type { ReactNode } from 'react';
import { ICON_PATHS } from './icons.js';
import type { ViewDefinition } from '../shell/routes.js';

/**
 * The shared visual vocabulary, ported from the prototype's `DC.*` helpers.
 *
 * Every one of these formats or arranges. None of them calculates: a bucket pill renders the bucket
 * MIS reported, an SLA chip renders the SLA the server worked out. The moment one of them started
 * deciding something, this application would have become a second implementation of the rules.
 */

// ── Icon ─────────────────────────────────────────────────────────────────────

export function Icon({ name, className }: { name: string; className?: string | undefined }) {
  const path = ICON_PATHS[name];
  if (!path) return null;
  return (
    <svg
      width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className={className}
      dangerouslySetInnerHTML={{ __html: path }}
    />
  );
}

// ── Layout ───────────────────────────────────────────────────────────────────

export function Card({ title, subtitle, children, actions }: {
  title?: string; subtitle?: string; children?: ReactNode; actions?: ReactNode;
}) {
  return (
    <section className="section-card">
      {(title || actions) && (
        <header className="section-card-head">
          <div>
            {title && <h2 className="section-card-title">{title}</h2>}
            {subtitle && <p className="section-card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="section-card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export interface Kpi { label: string; value: string; hint?: string; tone?: 'default' | 'warn' | 'bad' | 'good' }

/**
 * The KPI row.
 *
 * A value of `undefined` renders as `—` rather than `0`. The prototype's figures were mock data; a
 * fabricated count in a real workspace is worse than an honest blank, because nobody questions a
 * number that looks plausible.
 */
export function KpiRow({ items }: { items: readonly Kpi[] }) {
  return (
    <div className="kpi-row">
      {items.map(kpi => (
        <div key={kpi.label} className={`kpi kpi-${kpi.tone ?? 'default'}`}>
          <div className="kpi-label">{kpi.label}</div>
          <div className="kpi-value">{kpi.value}</div>
          {kpi.hint && <div className="kpi-hint">{kpi.hint}</div>}
        </div>
      ))}
    </div>
  );
}

/**
 * The prototype's `DC.pivot`: a tab strip whose panels are all present.
 *
 * A tab owned by a later phase keeps its place and is still selectable — it says which phase owns it
 * rather than disappearing, so the approved information architecture stays intact. Hiding it would
 * quietly shrink the design; faking its contents would be worse.
 */
export interface PivotTab {
  id: string;
  label: string;
  /** Rendered when the tab is active. */
  render: () => ReactNode;
  /** Set when a later phase owns the tab's functionality. */
  pendingPhase?: number;
}

export function Pivot({ tabs, activeId, onSelect, testId = 'pivot' }: {
  tabs: readonly PivotTab[];
  activeId: string;
  onSelect: (id: string) => void;
  testId?: string;
}) {
  const active = tabs.find(tab => tab.id === activeId) ?? tabs[0];
  return (
    <div className="pivot" data-testid={testId}>
      <div className="pivot-tabs" role="tablist">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active?.id}
            className={`pivot-tab${tab.id === active?.id ? ' pivot-tab-active' : ''}`}
            data-testid={`${testId}-tab-${tab.id}`}
            {...(tab.pendingPhase !== undefined ? { 'data-pending-phase': tab.pendingPhase } : {})}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
            {tab.pendingPhase !== undefined && <span className="pivot-tab-phase">P{tab.pendingPhase}</span>}
          </button>
        ))}
      </div>
      <div className="pivot-panel" role="tabpanel" data-testid={`${testId}-panel-${active?.id ?? 'none'}`}>
        {active?.render()}
      </div>
    </div>
  );
}

/** A tab, section or screen whose functionality a later phase owns. */
export function PendingPhasePanel({ phase, what }: { phase: number; what: string }) {
  return (
    <div className="pending-phase" data-testid={`pending-panel-${phase}`} data-owning-phase={phase}>
      <Icon name="info" />
      <div>
        <strong>Phase {phase} owns this.</strong>
        <p>{what}</p>
        <p className="pending-phase-note">No data is shown here, because none would be real.</p>
      </div>
    </div>
  );
}

/** Label/value pairs, as the approved summary panes lay them out. */
export function FieldList({ fields, testId = 'fields' }: {
  fields: readonly { label: string; value: ReactNode }[];
  testId?: string;
}) {
  return (
    <dl className="field-list" data-testid={testId}>
      {fields.map(field => (
        <div key={field.label} className="field-list-item">
          <dt>{field.label}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── Pills, chips and badges ──────────────────────────────────────────────────

/** The bucket exactly as MIS reported it. Nothing here derives a bucket from a DPD. */
export function BucketPill({ bucket }: { bucket?: string | undefined }) {
  if (!bucket) return <span className="pill pill-muted">—</span>;
  return <span className={`pill bucket-${bucket.replace(/[^\w]/g, '')}`}>{bucket} DPD</span>;
}

export function StatusPill({ status }: { status?: string | undefined }) {
  if (!status) return <span className="pill pill-muted">—</span>;
  return <span className={`pill status-${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>;
}

/** The SLA state the server worked out. This renders it; it does not compute remaining time. */
export function SlaChip({ label, tone }: { label?: string | undefined; tone?: 'ok' | 'warn' | 'breached' | undefined }) {
  if (!label) return null;
  return <span className={`chip chip-${tone ?? 'ok'}`}>{label}</span>;
}

/**
 * The system of record for a row.
 *
 * The prototype's defining rule: cases from both CRMs appear together, and the badge names which one
 * owns each. It is the reason a single workspace over two organisations is not confusing.
 */
export function OrgBadge({ org }: { org?: string | undefined }) {
  if (!org) return null;
  return <span className={`org-badge org-${org.toLowerCase()}`} title={`System of record: ${org}`}>{org}</span>;
}

// ── States ───────────────────────────────────────────────────────────────────

export function EmptyState({ message, icon = 'info' }: { message: string; icon?: string }) {
  return (
    <div className="empty-state">
      <Icon name={icon} />
      <p>{message}</p>
    </div>
  );
}

export function InfoBanner({ icon = 'info', children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="info-banner">
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

/**
 * Shown on a view whose functionality a later phase owns.
 *
 * The screen keeps its place in the navigation and its approved layout; this says plainly that it
 * does not work yet and which phase will make it work. It exists so that nothing has to be faked to
 * make the workspace look finished — a screen that quietly showed invented data would be worse than
 * one that admits it is waiting.
 */
export function PendingPhaseNotice({ view }: { view: ViewDefinition }) {
  return (
    <div className="pending-phase" data-testid={`pending-${view.id}`} data-owning-phase={view.phase}>
      <Icon name="info" />
      <div>
        <strong>Not yet implemented — Phase {view.phase} owns this.</strong>
        {view.pendingSummary && <p>{view.pendingSummary}</p>}
        <p className="pending-phase-note">
          The screen and its place in the workspace are preserved from the approved design. No data is
          shown here, because none would be real.
        </p>
      </div>
    </div>
  );
}

// ── Formatting ───────────────────────────────────────────────────────────────

const QAR = new Intl.NumberFormat('en-QA', { style: 'currency', currency: 'QAR', maximumFractionDigits: 0 });

/** Formats an amount. Returns an em dash for an absent value rather than `QAR 0`. */
export function formatMoney(value: number | undefined | null): string {
  return value === undefined || value === null ? '—' : QAR.format(value);
}

/** Millions, for KPI tiles, matching the prototype's `moneyM`. */
export function formatMoneyM(value: number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  return `QAR ${(value / 1_000_000).toFixed(2)}M`;
}

export function formatCount(value: number | undefined | null): string {
  return value === undefined || value === null ? '—' : new Intl.NumberFormat('en-GB').format(value);
}

export function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10);
}
