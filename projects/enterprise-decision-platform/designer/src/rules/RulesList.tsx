import { useEffect, useMemo, useState } from 'react';
import { listRulesDetailed, duplicateRule, deleteRule, type RuleRow } from '../dataverse/client';
import { searchEntities, type EntityMeta } from '../metadata/metadataService';

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

/**
 * Rules view — a model-driven read-only grid. A command bar drives New / Refresh and
 * (on selection) Open / Copy / Delete; Delete is disabled for Published rules. Follows
 * the Power Apps grid pattern: selection checkboxes, sticky header, row hover/select.
 */
export function RulesList({ onNew, onOpen }: { onNew: () => void; onOpen: (ruleId: string) => void }) {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [entities, setEntities] = useState<EntityMeta[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function load() {
    setBusy(true); setError(''); setConfirmDelete(false);
    try { setRows(await listRulesDetailed()); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); searchEntities('').then(setEntities).catch(() => {}); }, []);

  const entityLabel = (ln: string) => (ln ? entities.find((e) => e.logicalName === ln)?.displayName ?? ln : '—');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q) || r.entity.toLowerCase().includes(q) ||
      entityLabel(r.entity).toLowerCase().includes(q) || r.status.toLowerCase().includes(q));
  }, [rows, query, entities]);

  const selectedRow = rows.find((r) => r.ruleId === selected) ?? null;
  const canDelete = !!selectedRow && selectedRow.status !== 'Published';

  async function onDuplicate() {
    if (!selectedRow) return;
    setBusy(true);
    try { await duplicateRule(selectedRow.ruleId); setSelected(null); await load(); }
    catch (e: any) { setError(`Copy failed: ${e.message}`); setBusy(false); }
  }
  async function onDelete() {
    if (!selectedRow) return;
    setBusy(true);
    try { await deleteRule(selectedRow.ruleId); setSelected(null); setConfirmDelete(false); await load(); }
    catch (e: any) { setError(`Delete failed: ${e.message}`); setBusy(false); }
  }

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const cls = (s: string) => s.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="rules-view">
      <div className="view-head">
        <button className="view-selector">All Rules
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <span className="count">{rows.length} record{rows.length === 1 ? '' : 's'}</span>
        <span className="spacer" />
        <div className="view-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by keyword" aria-label="Filter rules" />
        </div>
      </div>

      <div className="cmdbar">
        <button className="cmd" onClick={onNew}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          New
        </button>
        <button className="cmd" onClick={() => void load()} disabled={busy}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" /></svg>
          Refresh
        </button>
        <span className="cmd-sep" />
        <button className="cmd" disabled={!selectedRow} onClick={() => selectedRow && onOpen(selectedRow.ruleId)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
          Open
        </button>
        <button className="cmd" disabled={!selectedRow || busy} onClick={onDuplicate}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
          Copy
        </button>
        <button className="cmd danger" disabled={!canDelete || busy}
          title={selectedRow && !canDelete ? 'Published rules cannot be deleted — retire it instead' : undefined}
          onClick={() => setConfirmDelete(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
          Delete
        </button>
      </div>

      {confirmDelete && selectedRow && (
        <div className="confirm-bar">
          <span>Delete <strong>{selectedRow.name}</strong>? This removes the rule and all its versions.</span>
          <span className="spacer" />
          <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={onDelete}>Delete</button>
        </div>
      )}

      {error && <p className="rh-error">{error}</p>}

      {busy && rows.length === 0 ? (
        <p className="rh-loading">Loading rules…</p>
      ) : filtered.length === 0 ? (
        <div className="mg-empty">
          <h2>{rows.length === 0 ? 'No rules yet' : 'No rules match your filter'}</h2>
          <p>{rows.length === 0 ? 'Create your first decision rule to get started.' : 'Try a different keyword.'}</p>
          {rows.length === 0 && <button className="btn primary" onClick={onNew}>+ New rule</button>}
        </div>
      ) : (
        <div className="grid-wrap">
          <div className="mgrid">
            <div className="mg-head">
              <span className="mg-check" aria-hidden="true" />
              <span>Name</span><span>Entity</span><span>Status</span><span>Version</span><span>Modified</span>
            </div>
            {filtered.map((r) => {
              const on = r.ruleId === selected;
              return (
                <div className={`mg-row ${on ? 'sel' : ''}`} key={r.ruleId}
                  onClick={() => setSelected(on ? null : r.ruleId)}>
                  <span className="mg-check">
                    <span className={`fcheck ${on ? 'on' : ''}`}>{on && <Check />}</span>
                  </span>
                  <button className="mg-name" onClick={(e) => { e.stopPropagation(); onOpen(r.ruleId); }} title="Open rule">{r.name}</button>
                  <span className="mg-entity" title={r.entity}>{entityLabel(r.entity)}</span>
                  <span><span className={`badge ${cls(r.status)}`}><span className="dot" />{r.status}</span></span>
                  <span className="mg-ver">v{r.versionNumber}</span>
                  <span className="mg-mod">{fmtDate(r.modifiedOn)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
