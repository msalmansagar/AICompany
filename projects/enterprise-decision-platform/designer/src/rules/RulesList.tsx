import { useEffect, useMemo, useState } from 'react';
import { listRulesDetailed, duplicateRule, deleteRule, type RuleRow } from '../dataverse/client';
import { filterCatalog, statusCounts, entitiesPresent, effectiveState } from './catalog';
import type { EntityMeta } from '../metadata/metadataService';

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

type SortKey = 'name' | 'entity' | 'status' | 'effective' | 'owner' | 'version' | 'modified';

const STATUS_ORDER = ['Draft', 'In Review', 'Approved', 'Published', 'Retired'];
const EFF_LABEL: Record<string, string> = { active: 'Effective now', scheduled: 'Scheduled', expired: 'Expired', none: '—' };
const EFF_RANK: Record<string, number> = { active: 0, scheduled: 1, expired: 2, none: 3 };

/**
 * Rules view — a model-driven read-only grid. A command bar drives New / Refresh and
 * (on selection) Open / Copy / Delete; Delete is disabled for Published rules. Columns
 * are sortable. Friendly table names come from the app's on-demand entity cache — the
 * grid never fetches metadata itself, so it stays free of a page-load call.
 */
export function RulesList({ onNew, onOpen, entities }: {
  onNew: () => void; onOpen: (ruleId: string) => void; entities: EntityMeta[];
}) {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [statusFilter, setStatusFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const nowIso = useMemo(() => new Date().toISOString(), [rows]);

  async function load() {
    setBusy(true); setError(''); setConfirmDelete(false);
    try { setRows(await listRulesDetailed()); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  const entityLabel = (ln: string) => (ln ? entities.find((e) => e.logicalName === ln)?.displayName ?? ln : '—');

  const counts = useMemo(() => statusCounts(rows), [rows]);
  const entityOptions = useMemo(() => entitiesPresent(rows), [rows]);

  const filtered = useMemo(
    () => filterCatalog(rows, { query, status: statusFilter, entity: entityFilter }, entityLabel),
    [rows, query, statusFilter, entityFilter, entities]
  );

  const sorted = useMemo(() => {
    const val = (r: RuleRow): string | number => {
      switch (sortKey) {
        case 'name': return r.name.toLowerCase();
        case 'entity': return entityLabel(r.entity).toLowerCase();
        case 'status': return r.status.toLowerCase();
        case 'effective': return EFF_RANK[effectiveState(r, nowIso)];
        case 'owner': return r.owner.toLowerCase();
        case 'version': return r.versionNumber;
        case 'modified': return r.modifiedOn;
      }
    };
    const arr = [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      const c = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? c : -c;
    });
    return arr;
  }, [filtered, sortKey, sortDir, entities, nowIso]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  }
  const caret = (k: SortKey) => (k === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

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

      <div className="cat-filters">
        <div className="cat-pills" role="tablist" aria-label="Filter by status">
          <button className={`cat-pill ${statusFilter === '' ? 'on' : ''}`} onClick={() => setStatusFilter('')}>All<span className="cat-n">{counts.All}</span></button>
          {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
            <button key={s} className={`cat-pill ${statusFilter === s ? 'on' : ''}`} onClick={() => setStatusFilter(s)}>{s}<span className="cat-n">{counts[s]}</span></button>
          ))}
        </div>
        <span className="spacer" />
        {entityOptions.length > 0 && (
          <label className="cat-entity">Table
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">All tables</option>
              {entityOptions.map((ln) => <option key={ln} value={ln}>{entityLabel(ln)}</option>)}
            </select>
          </label>
        )}
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
      ) : sorted.length === 0 ? (
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
              <button className="mg-sort" onClick={() => toggleSort('name')}>Name{caret('name')}</button>
              <button className="mg-sort" onClick={() => toggleSort('entity')}>Entity{caret('entity')}</button>
              <button className="mg-sort" onClick={() => toggleSort('status')}>Status{caret('status')}</button>
              <button className="mg-sort" onClick={() => toggleSort('effective')}>Effective{caret('effective')}</button>
              <button className="mg-sort" onClick={() => toggleSort('owner')}>Owner{caret('owner')}</button>
              <button className="mg-sort" onClick={() => toggleSort('version')}>Version{caret('version')}</button>
              <button className="mg-sort" onClick={() => toggleSort('modified')}>Modified{caret('modified')}</button>
            </div>
            {sorted.map((r) => {
              const on = r.ruleId === selected;
              return (
                <div className={`mg-row ${on ? 'sel' : ''}`} key={r.ruleId} onClick={() => setSelected(on ? null : r.ruleId)}>
                  <span className="mg-check"><span className={`fcheck ${on ? 'on' : ''}`}>{on && <Check />}</span></span>
                  <button className="mg-name" onClick={(e) => { e.stopPropagation(); onOpen(r.ruleId); }} title="Open rule">{r.name}</button>
                  <span className="mg-entity" title={r.entity}>{entityLabel(r.entity)}</span>
                  <span><span className={`badge ${cls(r.status)}`}><span className="dot" />{r.status}</span></span>
                  <span>{(() => { const s = effectiveState(r, nowIso); return s === 'none' ? <span className="mg-eff-none">—</span> : <span className={`eff-tag ${s}`}>{EFF_LABEL[s]}</span>; })()}</span>
                  <span className="mg-owner" title={r.owner}>{r.owner || '—'}</span>
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
