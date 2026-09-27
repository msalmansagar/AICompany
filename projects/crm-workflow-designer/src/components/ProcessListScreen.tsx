import { useEffect, useState, useCallback, useMemo } from 'react';
import { parseDesignerState, withDesignerState } from '@/services/designerState';
import type { ICrmAdapter } from '../services/ICrmAdapter';
import type { WorkflowProcess } from '../types/WorkflowTypes';

// The list screen, laid out the way the Report Engine designer lays out a list:
// the command bar is the first thing under the app bar and does not scroll, and
// the page title lives inside the scrolling page beneath it. Every surface here
// is a class from styles/components.css, so the screen themes with the app
// rather than carrying its own palette.

/** Which processes the sitemap is currently asking for. */
export type ProcessStatusFilter = 'all' | 'draft' | 'published';

interface ProcessListScreenProps {
  adapter: ICrmAdapter;
  onNewProcess(): void;
  onOpenProcess(processId: string): void;
  onEditProcess(processId: string): void;
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

type SortKey = 'name' | 'resolvedTaskEntity' | 'resolvedParentEntity' | 'createdOn' | 'createdByName';
type SortDir = 'asc' | 'desc';

const PAGE_TITLE: Record<ProcessStatusFilter, string> = {
  all: 'Workflow Processes',
  draft: 'Draft Processes',
  published: 'Published Processes',
};

export function ProcessListScreen({
  adapter,
  onNewProcess,
  onOpenProcess,
  onEditProcess,
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
      const [list, entityOptions, designerStates] = await Promise.all([
        adapter.getProcessList(),
        adapter.getAutoNumberEntities(),
        // One request for every stored state — the status column, its filters
        // and the draft/published counts all read from this.
        adapter.loadAllDesignerStates().catch((): Record<string, string> => ({})),
      ]);
      const nameMap = new Map(
        entityOptions.map((e) => [e.id.replace(/^\{|\}$/g, '').toLowerCase(), e.name])
      );
      setRows(
        list.map((p) => ({
          ...withDesignerState(p, parseDesignerState(designerStates[p.crmId])),
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
        // Created On and Created By can both be absent, and a created-on stamp is an ISO
        // string, which sorts chronologically as text — so one comparator serves every
        // column, provided the empty ones are treated as empty rather than crashed on.
        const av = (a[sortKey] ?? '').toLowerCase();
        const bv = (b[sortKey] ?? '').toLowerCase();
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }),
    [filtered, sortKey, sortDir]
  );

  const hasSelection = !!selectedId;
  const busy = isLoading || isBusy;

  return (
    <>
      <div className="cmdbar">
        <button type="button" className="cmd primary" onClick={onNewProcess} disabled={busy}>
          <IconAdd />New
        </button>
        <span className="cmd-sep" />
        <button type="button" className="cmd" disabled={!hasSelection || busy}
          onClick={() => selectedId && onOpenProcess(selectedId)}>
          <IconOpen />Open
        </button>
        <button type="button" className="cmd" disabled={!hasSelection || busy}
          onClick={() => selectedId && onEditProcess(selectedId)}>
          <IconEdit />Edit
        </button>
        <button type="button" className="cmd" disabled={!hasSelection || busy}
          onClick={() => void handleClone()}>
          <IconClone />Clone
        </button>
        <button type="button" className="cmd danger" disabled={!hasSelection || busy}
          onClick={() => setConfirmDelete(true)}>
          <IconDelete />Delete
        </button>
        <span className="cmd-sep" />
        <button type="button" className="cmd" onClick={() => void loadList()} disabled={busy}>
          <IconRefresh spin={isLoading} />Refresh
        </button>
      </div>

      {error && (
        <div className="message-bar" role="alert">
          <IconWarning />
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" className="dismiss" onClick={() => setError(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="scroll">
        <div className="page">
          <div className="page-head">
            <div>
              <h1>{PAGE_TITLE[statusFilter]}</h1>
              <div className="page-sub">
                {filtered.length}{filtered.length !== rows.length ? ` of ${rows.length}` : ''}
                {' '}process{filtered.length === 1 ? '' : 'es'} · configuration for the Dataverse
                process engine · steps, decisions and routes
              </div>
            </div>
          </div>

          <div className="grid-wrap" style={{ position: 'relative' }}>
            {isLoading && rows.length === 0 ? (
              <div className="empty-state">
                <span className="spinner" />
                <span>Loading…</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="empty-state">
                <IconEmptyGrid />
                <span className="es-title">No processes found</span>
                <span>Create your first workflow process to get started.</span>
              </div>
            ) : sorted.length === 0 ? (
              <div className="empty-state">
                <span>No results match &ldquo;{search}&rdquo;</span>
                <button type="button" className="link-btn" onClick={() => onSearchChange('')}>
                  Clear filter
                </button>
              </div>
            ) : (
              <table className="grid" role="grid">
                <thead>
                  <tr>
                    <th className="row-check" />
                    <SortTh col="name" label="Name" current={sortKey} dir={sortDir} onSort={handleSort} width={280} />
                    <SortTh col="resolvedTaskEntity" label="Task Entity" current={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="resolvedParentEntity" label="Parent Entity" current={sortKey} dir={sortDir} onSort={handleSort} />
                    <SortTh col="createdOn" label="Created On" current={sortKey} dir={sortDir} onSort={handleSort} width={150} />
                    <SortTh col="createdByName" label="Created By" current={sortKey} dir={sortDir} onSort={handleSort} width={170} />
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <GridRow
                      key={row.crmId}
                      row={row}
                      selected={row.crmId === selectedId}
                      onSelect={() => setSelectedId(row.crmId === selectedId ? null : row.crmId)}
                      onOpen={() => onOpenProcess(row.crmId)}
                    />
                  ))}
                </tbody>
              </table>
            )}
            {isBusy && (
              <div className="busy-overlay">
                <div className="busy-card">
                  <span className="spinner" />
                  <span>Please wait…</span>
                </div>
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="legend">
              <span><b>{countByState(rows, 'published')}</b> published</span>
              <span><b>{countByState(rows, 'draft')}</b> draft</span>
              <span><b>{countByState(rows, 'archived')}</b> archived</span>
            </div>
          )}
        </div>
      </div>

      {hasSelection && (
        <div className="selection-bar">
          <span>1 item selected — <strong style={{ color: 'var(--text)' }}>{selectedRow?.name}</strong></span>
          <button type="button" className="link-btn" onClick={() => setSelectedId(null)}>
            Clear selection
          </button>
        </div>
      )}

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
    </>
  );
}

function countByState(rows: ProcessRow[], state: WorkflowProcess['workflowState']): number {
  return rows.filter((r) => r.workflowState === state).length;
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
  return (
    <tr
      className={selected ? 'selected' : undefined}
      style={{ cursor: 'pointer' }}
      onClick={onSelect}
      onDoubleClick={onOpen}
      aria-selected={selected}
    >
      <td className="row-check">
        <div className="box">
          {selected && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
              <path d="M1 4l3 3L9 1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </td>
      <td>
        <button
          type="button"
          className="link-cell"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
        >
          {row.name}
        </button>
      </td>
      <td>{row.resolvedTaskEntity || <Dash />}</td>
      <td>{row.resolvedParentEntity || <Dash />}</td>
      <td>{formatCreatedOn(row.createdOn)}</td>
      <td>{row.createdByName || <Dash />}</td>
      <td><StatusPill state={row.workflowState} /></td>
    </tr>
  );
}

/**
 * A created-on stamp as a date, in the reader's own locale.
 *
 * The time is dropped: the column exists to answer "which of these is recent", and a
 * full timestamp costs width the entity columns need more.
 */
function formatCreatedOn(value: string | null | undefined): React.ReactNode {
  if (!value) return <Dash />;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return <Dash />;
  return <span title={parsed.toLocaleString()}>{parsed.toLocaleDateString()}</span>;
}

function Dash() {
  return <span style={{ color: 'var(--text-disabled)' }}>—</span>;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SortTh({
  col, label, current, dir, onSort, width,
}: {
  col: SortKey; label: string; current: SortKey; dir: SortDir;
  onSort(k: SortKey): void; width?: number;
}) {
  const active = col === current;
  return (
    <th
      className={active ? 'sortable sorted' : 'sortable'}
      style={{ width }}
      onClick={() => onSort(col)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span className="sort-arrows" aria-hidden="true">
        <svg width="8" height="5" viewBox="0 0 8 5" className={active && dir === 'asc' ? 'active' : undefined}>
          <path d="M4 0L8 5H0L4 0Z" />
        </svg>
        <svg width="8" height="5" viewBox="0 0 8 5" className={active && dir === 'desc' ? 'active' : undefined}>
          <path d="M4 5L0 0H8L4 5Z" />
        </svg>
      </span>
    </th>
  );
}

const STATUS_PILL: Record<WorkflowProcess['workflowState'], { className: string; label: string }> = {
  draft: { className: 'pill draft', label: 'Draft' },
  published: { className: 'pill published', label: 'Published' },
  archived: { className: 'pill archived', label: 'Archived' },
};

function StatusPill({ state }: { state: WorkflowProcess['workflowState'] }) {
  const pill = STATUS_PILL[state];
  return <span className={pill.className}>{pill.label}</span>;
}

// ─── Confirm dialog ────────────────────────────────────────────────────────

function ConfirmDialog({
  title, message, confirmLabel, danger, onConfirm, onCancel,
}: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onConfirm(): void; onCancel(): void;
}) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog" style={{ width: 420 }}>
        <div className="dialog-head"><h2>{title}</h2></div>
        <div className="dialog-body">{message}</div>
        <div className="dialog-foot">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className={danger ? 'btn primary danger-fill' : 'btn primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function resolveEntityName(
  raw: string,
  displayName: string | null,
  nameMap: Map<string, string>
): string {
  if (displayName) return displayName;
  if (!raw) return '';
  return nameMap.get(raw.replace(/^\{|\}$/g, '').toLowerCase()) ?? raw;
}

// ─── Icons ─────────────────────────────────────────────────────────────────

function IconAdd() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8.5 2v5.5H14v1H8.5V14h-1V8.5H2v-1h5.5V2h1z" />
    </svg>
  );
}

function IconOpen() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M1 8s2.5-4.5 7-4.5S15 8 15 8s-2.5 4.5-7 4.5S1 8 1 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z" />
    </svg>
  );
}

function IconClone() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <rect x="5.5" y="1.5" width="9" height="9" rx="1" />
      <path d="M10.5 13.5h-8a1 1 0 01-1-1v-8" />
    </svg>
  );
}

function IconDelete() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.5 6.5v5M9.5 6.5v5" />
    </svg>
  );
}

function IconRefresh({ spin }: { spin?: boolean }) {
  return (
    <svg
      width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3"
      className={spin ? 'spin' : undefined} aria-hidden="true"
    >
      <path d="M13.5 8a5.5 5.5 0 11-1.7-4" />
      <path d="M13.8 1.5v3h-3" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8.56 1.3L15.87 14a.65.65 0 0 1-.56.99H.69a.65.65 0 0 1-.56-.99L7.44 1.3a.65.65 0 0 1 1.12 0zM8 5.5a.5.5 0 0 0-.5.5v4a.5.5 0 0 0 1 0V6A.5.5 0 0 0 8 5.5zm0 6.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z" />
    </svg>
  );
}

function IconEmptyGrid() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="var(--border-strong)" strokeWidth="1.5" aria-hidden="true">
      <rect x="6" y="10" width="36" height="28" rx="2" />
      <path d="M6 18h36M16 18v20M6 28h36" />
    </svg>
  );
}
