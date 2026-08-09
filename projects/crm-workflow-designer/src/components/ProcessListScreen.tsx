import { useEffect, useState, useCallback, useMemo } from 'react';
import type { ICrmAdapter } from '../services/ICrmAdapter';
import type { WorkflowProcess } from '../types/WorkflowTypes';

/** Which processes the sitemap is currently asking for. */
export type ProcessStatusFilter = 'all' | 'draft' | 'published';

interface ProcessListScreenProps {
  adapter: ICrmAdapter;
  onNewProcess(): void;
  onOpenProcess(processId: string): void;
  onEditProcess(processId: string): void;
  onOpenSopDesigner?: () => void;
  /** Search text, owned by the app bar so there is one search box, not two. */
  search: string;
  onSearchChange(search: string): void;
  /** Status the sitemap selected. */
  statusFilter: ProcessStatusFilter;
}

interface ProcessRow extends WorkflowProcess {
  resolvedTaskEntity: string;
  resolvedParentEntity: string;
}

type SortKey = 'name' | 'resolvedTaskEntity' | 'resolvedParentEntity';
type SortDir = 'asc' | 'desc';

// ─── Fluent / Power Platform tokens ────────────────────────────────────────
// Resolved through styles/tokens.css so the screen follows the selected theme.
// These were Fluent's light values inlined; the tokens are the same colours in
// Light and the correct ones in Dark, Glass and Vibrant.
const T = {
  blue:          'var(--primary)',
  blueHover:     'var(--primary-hover)',
  blueDark:      'var(--primary-pressed)',
  neutralLight:  'var(--neutral-chip)',
  neutralLighter:'var(--surface-alt)',
  neutralBorder: 'var(--border)',
  neutralBorder2:'var(--border-strong)',
  textPrimary:   'var(--text)',
  textSecondary: 'var(--text-secondary)',
  textDisabled:  'var(--text-disabled)',
  selectionBg:   'var(--primary-tint)',
  selectionHover:'var(--primary-tint-2)',
  rowHover:      'var(--surface-alt)',
  white:         'var(--surface)',
  redDanger:     'var(--error)',
  greenSuccess:  'var(--success)',
  orangeWarning: 'var(--warning)',
};

export function ProcessListScreen({
  adapter,
  onNewProcess,
  onOpenProcess,
  onEditProcess,
  onOpenSopDesigner,
  search,
  onSearchChange,
  statusFilter,
}: ProcessListScreenProps) {
  const [rows, setRows] = useState<ProcessRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const loadList = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [list, entityOptions] = await Promise.all([
        adapter.getProcessList(),
        adapter.getAutoNumberEntities(),
      ]);
      const nameMap = new Map(
        entityOptions.map((e) => [e.id.replace(/^\{|\}$/g, '').toLowerCase(), e.name])
      );
      setRows(
        list.map((p) => ({
          ...p,
          resolvedTaskEntity: resolveEntityName(p.recordEntity, p.recordEntityName, nameMap),
          resolvedParentEntity: resolveEntityName(p.parentEntity, p.parentEntityName, nameMap),
        }))
      );
      setSelectedId((prev) => (list.some((p) => p.crmId === prev) ? prev : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [adapter]);

  useEffect(() => { void loadList(); }, [loadList]);

  const selectedRow = rows.find((r) => r.crmId === selectedId) ?? null;

  const handleClone = async () => {
    if (!selectedId) return;
    setIsBusy(true);
    try {
      await adapter.cloneProcess(selectedId);
      await loadList();
    } catch (err) {
      setError(`Clone failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setConfirmDelete(false);
    setIsBusy(true);
    try {
      await adapter.deleteProcess(selectedId);
      setSelectedId(null);
      await loadList();
    } catch (err) {
      setError(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.workflowState !== statusFilter) return false;
      return (
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.resolvedTaskEntity.toLowerCase().includes(q) ||
        r.resolvedParentEntity.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const av = a[sortKey].toLowerCase();
        const bv = b[sortKey].toLowerCase();
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }),
    [filtered, sortKey, sortDir]
  );

  const hasSelection = !!selectedId;
  const busy = isLoading || isBusy;

  return (
    <div style={shellStyle}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div style={pageHeaderStyle}>
        <span style={pageTitleStyle}>Workflow Processes</span>
        {!isLoading && (
          <span style={pageCountStyle}>
            {filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ''} item{rows.length !== 1 ? 's' : ''}
          </span>
        )}
        {onOpenSopDesigner && (
          <button
            type="button"
            onClick={onOpenSopDesigner}
            style={sopDesignerBtnStyle}
            title="Open SOP Designer"
          >
            SOP Designer
          </button>
        )}
      </div>

      {/* ── Command bar ───────────────────────────────────────────────── */}
      <div style={commandBarStyle}>
        <div style={commandGroupStyle}>
          <CmdButton icon={<IconAdd />} label="New" onClick={onNewProcess} primary disabled={busy} />
          <CmdDivider />
          <CmdButton icon={<IconOpen />}   label="Open"   onClick={() => selectedId && onOpenProcess(selectedId)} disabled={!hasSelection || busy} />
          <CmdButton icon={<IconEdit />}   label="Edit"   onClick={() => selectedId && onEditProcess(selectedId)} disabled={!hasSelection || busy} />
          <CmdButton icon={<IconClone />}  label="Clone"  onClick={() => void handleClone()} disabled={!hasSelection || busy} />
          <CmdButton icon={<IconDelete />} label="Delete" onClick={() => setConfirmDelete(true)} disabled={!hasSelection || busy} danger />
          <CmdDivider />
          <CmdButton icon={<IconRefresh spin={isLoading} />} label="Refresh" onClick={() => void loadList()} disabled={busy} />
        </div>

      </div>

      {/* ── Error message bar ─────────────────────────────────────────── */}
      {error && (
        <div style={errorBarStyle}>
          <IconWarning />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" style={dismissBtnStyle} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── Grid ──────────────────────────────────────────────────────── */}
      <div style={{ ...gridWrapStyle, position: 'relative' }}>
        {isLoading && rows.length === 0 ? (
          <GridMessage>
            <span style={spinnerStyle} />
            <span style={{ color: T.textSecondary, fontSize: 14 }}>Loading…</span>
          </GridMessage>
        ) : rows.length === 0 ? (
          <GridMessage>
            <IconEmptyGrid />
            <span style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary }}>No processes found</span>
            <span style={{ fontSize: 13, color: T.textSecondary }}>Create your first workflow process to get started.</span>
          </GridMessage>
        ) : sorted.length === 0 ? (
          <GridMessage>
            <span style={{ fontSize: 13, color: T.textSecondary }}>No results match &ldquo;{search}&rdquo;</span>
            <button type="button" style={linkBtnStyle} onClick={() => onSearchChange('')}>Clear filter</button>
          </GridMessage>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thCheckStyle} />
                <SortTh col="name" label="Name" current={sortKey} dir={sortDir} onSort={handleSort} width={280} />
                <SortTh col="resolvedTaskEntity" label="Task Entity" current={sortKey} dir={sortDir} onSort={handleSort} />
                <SortTh col="resolvedParentEntity" label="Parent Entity" current={sortKey} dir={sortDir} onSort={handleSort} />
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => {
                const sel = row.crmId === selectedId;
                return (
                  <GridRow
                    key={row.crmId}
                    row={row}
                    selected={sel}
                    onSelect={() => setSelectedId(sel ? null : row.crmId)}
                    onOpen={() => onOpenProcess(row.crmId)}
                  />
                );
              })}
            </tbody>
          </table>
        )}
        {isBusy && <BusyOverlay />}
      </div>

      {/* ── Selection info bar ────────────────────────────────────────── */}
      {hasSelection && (
        <div style={selectionBarStyle}>
          <span style={{ color: T.textSecondary, fontSize: 12 }}>
            1 item selected — <strong style={{ color: T.textPrimary }}>{selectedRow?.name}</strong>
          </span>
          <button type="button" style={linkBtnStyle} onClick={() => setSelectedId(null)}>
            Clear selection
          </button>
        </div>
      )}

      {/* ── Confirm delete dialog ─────────────────────────────────────── */}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete process"
          message={`Delete "${selectedRow?.name ?? ''}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

// ─── Grid row ──────────────────────────────────────────────────────────────

function GridRow({
  row, selected, onSelect, onOpen,
}: {
  row: ProcessRow;
  selected: boolean;
  onSelect(): void;
  onOpen(): void;
}) {
  const [hover, setHover] = useState(false);
  const bg = selected ? (hover ? T.selectionHover : T.selectionBg) : (hover ? T.rowHover : T.white);

  return (
    <tr
      style={{ background: bg, cursor: 'pointer', borderBottom: `1px solid ${T.neutralBorder}` }}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td style={tdCheckStyle}>
        <div style={{
          width: 16, height: 16, borderRadius: 2,
          border: selected ? `2px solid ${T.blue}` : `1px solid ${T.neutralBorder2}`,
          background: selected ? T.blue : T.white,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4l3 3L9 1" stroke="var(--text-on-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </td>
      <td style={{ ...tdStyle, fontWeight: 600, color: T.blue, textDecoration: hover ? 'underline' : 'none' }}
          onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        {row.name}
      </td>
      <td style={tdStyle}>{row.resolvedTaskEntity || <span style={{ color: T.textDisabled }}>—</span>}</td>
      <td style={tdStyle}>{row.resolvedParentEntity || <span style={{ color: T.textDisabled }}>—</span>}</td>
      <td style={tdStyle}><StatusBadge state={row.workflowState} /></td>
    </tr>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function BusyOverlay() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, backdropFilter: 'blur(2px)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, background: T.white, border: `1px solid ${T.neutralBorder}`, borderRadius: 4, padding: '24px 32px', boxShadow: '0 4px 20px rgba(0,0,0,0.10)' }}>
        <div style={{ width: 28, height: 28, border: `3px solid ${T.neutralBorder}`, borderTopColor: T.blue, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <span style={{ fontSize: 13, color: T.textSecondary, fontFamily: '"Segoe UI", system-ui, sans-serif' }}>Please wait…</span>
      </div>
    </div>
  );
}

function SortTh({
  col, label, current, dir, onSort, width,
}: {
  col: SortKey; label: string; current: SortKey; dir: SortDir;
  onSort(k: SortKey): void; width?: number;
}) {
  const active = col === current;
  return (
    <th
      style={{ ...thStyle, cursor: 'pointer', width, userSelect: 'none' as const }}
      onClick={() => onSort(col)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, opacity: active ? 1 : 0.3 }}>
          <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'asc' ? T.blue : T.textSecondary}>
            <path d="M4 0L8 5H0L4 0Z" />
          </svg>
          <svg width="8" height="5" viewBox="0 0 8 5" fill={active && dir === 'desc' ? T.blue : T.textSecondary}>
            <path d="M4 5L0 0H8L4 5Z" />
          </svg>
        </span>
      </span>
    </th>
  );
}

function CmdButton({
  icon, label, onClick, disabled = false, primary = false, danger = false,
}: {
  icon: React.ReactNode; label: string; onClick(): void;
  disabled?: boolean; primary?: boolean; danger?: boolean;
}) {
  const [hover, setHover] = useState(false);

  let color = danger ? T.redDanger : T.textPrimary;
  let bg = 'transparent';
  if (primary) { color = T.white; bg = hover ? T.blueHover : T.blue; }
  else if (hover && !disabled) bg = T.neutralLight;

  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        height: 32, padding: '0 10px', border: 'none',
        borderRadius: primary ? 2 : 2, background: bg,
        color: disabled ? T.textDisabled : color,
        fontSize: 13, fontWeight: primary ? 600 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.08s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
      {label}
    </button>
  );
}

function CmdDivider() {
  return <div style={{ width: 1, height: 24, background: T.neutralBorder, margin: '0 4px', flexShrink: 0 }} />;
}

function StatusBadge({ state }: { state: WorkflowProcess['workflowState'] }) {
  const cfg = {
    draft:     { dot: T.orangeWarning, label: 'Draft' },
    published: { dot: T.greenSuccess,  label: 'Published' },
    archived:  { dot: T.textDisabled,  label: 'Archived' },
  }[state];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: T.textPrimary }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {cfg.label}
    </span>
  );
}

function GridMessage({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '80px 0', color: T.textSecondary }}>
      {children}
    </div>
  );
}

function ConfirmDialog({
  title, message, confirmLabel, danger, onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel: string;
  danger?: boolean; onConfirm(): void; onCancel(): void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: T.white, borderRadius: 2, padding: '28px 24px', maxWidth: 420, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.14)' }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: T.textPrimary, marginBottom: 12 }}>{title}</div>
        <div style={{ fontSize: 14, color: T.textSecondary, lineHeight: 1.5, marginBottom: 24 }}>{message}</div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ height: 32, padding: '0 16px', background: T.white, color: T.textPrimary, border: `1px solid ${T.neutralBorder2}`, borderRadius: 2, fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} style={{ height: 32, padding: '0 16px', background: danger ? T.redDanger : T.blue, color: T.white, border: 'none', borderRadius: 2, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Icons (Fluent-style 16px SVG) ─────────────────────────────────────────

function IconAdd() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 2a.75.75 0 0 1 .75.75v4.5h4.5a.75.75 0 0 1 0 1.5h-4.5v4.5a.75.75 0 0 1-1.5 0v-4.5h-4.5a.75.75 0 0 1 0-1.5h4.5v-4.5A.75.75 0 0 1 8 2z" />
    </svg>
  );
}

function IconOpen() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.23 1a1.88 1.88 0 0 1 1.33 3.2L5.5 13.27l-3.5.97.97-3.5L11.9 1.67A1.88 1.88 0 0 1 13.23 1zm0 1a.88.88 0 0 0-.62.26L3.5 11.36l-.5 1.8 1.8-.5L13.9 3.56A.88.88 0 0 0 13.23 2z" />
    </svg>
  );
}

function IconClone() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M10 1H4a2 2 0 0 0-2 2v8h1V3a1 1 0 0 1 1-1h6V1zm1 2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 1a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5z" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6.5 1h3a.5.5 0 0 1 .5.5V3H6V1.5a.5.5 0 0 1 .5-.5zM5 3V1.5A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5V3h2.5a.5.5 0 0 1 0 1H13v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4H2.5a.5.5 0 0 1 0-1H5zm1 0h4V1.5a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5V3zM4 4v9h8V4H4zm2 2a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 6 6zm4 0a.5.5 0 0 1 .5.5v5a.5.5 0 0 1-1 0v-5A.5.5 0 0 1 10 6z" />
    </svg>
  );
}

function IconRefresh({ spin }: { spin: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
      style={spin ? { animation: 'spin 0.8s linear infinite' } : undefined}>
      <path d="M13.65 2.35A8 8 0 1 0 15 8h-1a7 7 0 1 1-1.18-3.9L10 7h5V2l-1.35 1.35z" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--error)">
      <path d="M8.56 1.3L15.87 14a.65.65 0 0 1-.56.99H.69a.65.65 0 0 1-.56-.99L7.44 1.3a.65.65 0 0 1 1.12 0zM8 5.5a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 1 0V6A.5.5 0 0 0 8 5.5zm0 6.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
    </svg>
  );
}

function IconEmptyGrid() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke={T.neutralBorder2} strokeWidth="1.5">
      <rect x="6" y="10" width="36" height="28" rx="2" />
      <line x1="6" y1="18" x2="42" y2="18" />
      <line x1="6" y1="26" x2="42" y2="26" />
      <line x1="6" y1="34" x2="42" y2="34" />
      <line x1="16" y1="10" x2="16" y2="38" />
    </svg>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function resolveEntityName(id: string, annotationName: string | null, nameMap: Map<string, string>): string {
  if (annotationName) return annotationName;
  if (!id) return '';
  return nameMap.get(id.replace(/^\{|\}$/g, '').toLowerCase()) ?? '';
}

// ─── Styles ────────────────────────────────────────────────────────────────

const shellStyle: React.CSSProperties = {
  width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
  background: T.white, overflow: 'hidden', fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const pageHeaderStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  padding: '16px 20px 0', flexShrink: 0,
};

const sopDesignerBtnStyle: React.CSSProperties = {
  marginLeft: 'auto', height: 28, padding: '0 14px',
  background: 'var(--accent-route-bg)', border: '1px solid var(--accent-route)',
  borderRadius: 5, fontSize: 12, fontWeight: 600,
  color: 'var(--accent-route)', cursor: 'pointer',
};

const pageTitleStyle: React.CSSProperties = {
  fontSize: 20, fontWeight: 600, color: T.textPrimary,
};

const pageCountStyle: React.CSSProperties = {
  fontSize: 13, color: T.textSecondary,
};

const commandBarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '8px 12px', borderBottom: `1px solid ${T.neutralBorder}`,
  background: T.white, flexShrink: 0,
};

const commandGroupStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 2,
};

const errorBarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: 'var(--error-bg)', borderBottom: '1px solid var(--error)',
  padding: '8px 20px', fontSize: 13, color: T.redDanger, flexShrink: 0,
};

const dismissBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: T.textSecondary,
  cursor: 'pointer', fontSize: 14, padding: '0 4px',
};

const gridWrapStyle: React.CSSProperties = {
  flex: 1, overflow: 'auto',
};

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse', fontSize: 13,
  fontFamily: '"Segoe UI", system-ui, sans-serif',
};

const thCheckStyle: React.CSSProperties = {
  width: 44, padding: '0 14px',
  background: T.neutralLighter, borderBottom: `1px solid ${T.neutralBorder}`,
  position: 'sticky', top: 0, zIndex: 1,
};

const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left',
  background: T.neutralLighter, color: T.textSecondary,
  fontWeight: 600, fontSize: 12,
  borderBottom: `1px solid ${T.neutralBorder}`,
  position: 'sticky', top: 0, zIndex: 1,
};

const tdCheckStyle: React.CSSProperties = {
  padding: '0 14px', verticalAlign: 'middle', width: 44,
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: T.textPrimary, verticalAlign: 'middle',
};

const selectionBarStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '6px 20px', background: T.selectionBg,
  borderTop: `1px solid ${T.neutralBorder}`,
  fontSize: 12, flexShrink: 0,
};

const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: T.blue,
  cursor: 'pointer', fontSize: 12, padding: 0, textDecoration: 'underline',
};

const spinnerStyle: React.CSSProperties = {
  display: 'inline-block', width: 20, height: 20,
  border: `2px solid ${T.neutralBorder}`, borderTopColor: T.blue,
  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
};
