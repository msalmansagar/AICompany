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
