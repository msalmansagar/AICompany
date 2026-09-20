import type { ReactNode } from 'react';
import { ICON_PATHS } from './icons.js';
import type { ViewDefinition } from '../shell/routes.js';

/**
 * The shared visual vocabulary, ported from the prototype's `DC.*` helpers.
 *
 * Every one of these formats or arranges. None of them calculates: a bucket pill renders the bucket
 * MIS reported, an SLA chip renders the SLA the server worked out. The moment one of them started
 * deciding something, this application would have become a second implementation of the rules.
 *
 * **Class names are the prototype's.** A tone is chosen from a fixed set and written out in full —
 * `pill ok`, `pill b3`, `org-badge HL` — never assembled from a value. A class name built at runtime
 * cannot be checked against the stylesheet, and that is exactly how the first build shipped with
 * seventy-one class names that matched no rule at all.
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
      {title && <h3>{title}</h3>}
      {subtitle && <div className="hint">{subtitle}</div>}
      {actions && <div className="action-row">{actions}</div>}
      {children}
    </section>
  );
}

/** The prototype's five KPI tones. A tile with no tone is the neutral default. */
export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'muted';

export interface Kpi { label: string; value: string; hint?: string; tone?: Tone }

/**
 * The KPI row.
 *
 * A value of `—` renders rather than `0`. The prototype's figures were mock data; a fabricated count
 * in a real workspace is worse than an honest blank, because nobody questions a number that looks
 * plausible.
 */
export function KpiRow({ items }: { items: readonly Kpi[] }) {
  return (
    <div className="kpi-row">
      {items.map(kpi => (
        <div key={kpi.label} className={kpi.tone ? `kpi-tile ${kpi.tone}` : 'kpi-tile'}>
          <div className="kpi-label">{kpi.label}</div>
          <div className="kpi-value">{kpi.value}</div>
          {kpi.hint && <div className="kpi-delta flat">{kpi.hint}</div>}
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
    <>
      <div className="pivot" role="tablist" data-testid={testId}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={tab.id === active?.id}
            className={tab.id === active?.id ? 'pivot-tab active' : 'pivot-tab'}
            data-testid={`${testId}-tab-${tab.id}`}
            {...(tab.pendingPhase !== undefined ? { 'data-pending-phase': tab.pendingPhase } : {})}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
            {tab.pendingPhase !== undefined && <span className="badge">P{tab.pendingPhase}</span>}
          </button>
        ))}
      </div>
      <div role="tabpanel" data-testid={`${testId}-panel-${active?.id ?? 'none'}`}>
        {active?.render()}
      </div>
    </>
  );
}

/** A tab, section or screen whose functionality a later phase owns. */
export function PendingPhasePanel({ phase, what }: { phase: number; what: string }) {
  return (
    <div className="phase-notice" data-testid={`pending-panel-${phase}`} data-owning-phase={phase}>
      <Icon name="info" />
      <div>
        <strong>Phase {phase} owns this.</strong>
        <p>{what}</p>
        <p className="hint">No data is shown here, because none would be real.</p>
      </div>
    </div>
  );
}

/** Label/value pairs, as the approved read-only panes lay them out. */
export function FieldList({ fields, testId = 'fields' }: {
  fields: readonly { label: string; value: ReactNode }[];
  testId?: string;
}) {
  return (
    <div className="read-grid" data-testid={testId}>
      {fields.map(field => (
        <div key={field.label} className="read-pair">
          <span className="rk">{field.label}</span>
          <span className="rv">{field.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Pills, chips and badges ──────────────────────────────────────────────────

/**
 * The bucket exactly as MIS reported it.
 *
 * The tone comes from a lookup onto the prototype's five bucket classes. **Nothing here derives a
 * bucket from a DPD** — the mapping below is label-to-colour, not days-to-bucket.
 */
const BUCKET_TONE: Readonly<Record<string, string>> = {
  '1-30': 'b1', '31-60': 'b2', '61-90': 'b3', '91-180': 'b4', '181-270': 'b4',
  '271-360': 'b4', '361-500': 'b4', '501-1000': 'b4', '1001-2000': 'b4', '>2000': 'b4',
};

export function BucketPill({ bucket }: { bucket?: string | undefined }) {
  if (!bucket) return <span className="pill muted">—</span>;
  const tone = BUCKET_TONE[bucket];
  return <span className={tone ? `pill ${tone}` : 'pill muted'}>{bucket} DPD</span>;
}

/**
 * Maps a business status onto one of the prototype's five pill tones.
 *
 * This is the prototype's own `statusTone`, unchanged. It is presentation — which colour a word gets
 * — and decides nothing: the status itself was set by the server.
 */
export function statusTone(status: string): Tone {
  const s = status.toLowerCase();
  if (/paid|kept|approved|resolved|accepted|settled|cured|restructured|completed/.test(s)) return 'ok';
  if (/broken|rejected|breach|blocked|failed|suppressed|written off|legal action/.test(s)) return 'bad';
  if (/pending|review|draft|disputed|escalated|deceased|open|due/.test(s)) return 'warn';
  if (/new|assigned|in progress|follow|captured|proposed|referred|reopened/.test(s)) return 'info';
  return 'muted';
}

export function StatusPill({ status }: { status?: string | undefined }) {
  if (!status) return <span className="pill muted">—</span>;
  return <span className={`pill ${statusTone(status)}`}>{status}</span>;
}

/** The SLA state the server worked out. This renders it; it does not compute remaining time. */
export function SlaChip({ label, tone }: { label?: string | undefined; tone?: 'ok' | 'warn' | 'breach' | undefined }) {
  if (!label) return null;
  if (tone === 'breach') return <span className="sla-chip breach">{label}</span>;
  if (tone === 'warn') return <span className="sla-chip warn">{label}</span>;
  return <span className="sla-chip">{label}</span>;
}

/**
 * The system of record for a row.
 *
 * The prototype's defining rule: cases from both CRMs appear together, and the badge names which one
 * owns each. It is the reason a single workspace over two organisations is not confusing.
 */
export function OrgBadge({ org }: { org?: string | undefined }) {
  if (!org) return null;
  const known = org === 'HL' || org === 'BFD';
  return (
    <span className={known ? `org-badge ${org}` : 'org-badge'} title={`System of record: ${org}`}>
      {org}
    </span>
  );
}

/**
 * A promise's status, with the fact that it is unverified attached.
 *
 * A bare `Kept` pill in the approved `ok` green reads as *settled*. It is not: it is what a collection
 * officer recorded, and the platform holds no evidence that any money arrived. So every outcome that
 * makes a claim about payment carries the qualifier beside it, in secondary text rather than a
 * success colour. Active and Rescheduled claim nothing, so they need no qualifier.
 */
export function PromiseOutcome({ status }: { status?: string | undefined }) {
  const claimsPayment = status !== undefined && /kept|broken/i.test(status);
  return (
    <span className="row-actions">
      <StatusPill status={status} />
      {claimsPayment && <span className="unverified" title="Payment has not been verified against MIS.">unverified</span>}
    </span>
  );
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
    <div className="phase-notice" data-testid={`pending-${view.id}`} data-owning-phase={view.phase}>
      <Icon name="info" />
      <div>
        <strong>Not yet implemented — Phase {view.phase} owns this.</strong>
        {view.pendingSummary && <p>{view.pendingSummary}</p>}
        <p className="hint">
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
