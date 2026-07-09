import { useEffect, useMemo, useState } from 'react';
import { listRuleSets, deleteRuleSet, type RuleSetRow } from '../dataverse/client';

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
);

type SortKey = 'name' | 'members' | 'policy' | 'modified';

/**
 * Rule Sets view — a model-driven grid of governed sets. A set bundles rules and a
 * combine policy so a single call decides many rules at once. Command bar drives
 * New / Refresh / Open / Delete; columns sort.
 */
export function RuleSetsList({ onNew, onOpen }: { onNew: () => void; onOpen: (id: string) => void }) {
  const [rows, setRows] = useState<RuleSetRow[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  async function load() {
    setBusy(true); setError(''); setConfirmDelete(false);
    try { setRows(await listRuleSets()); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.policy.toLowerCase().includes(q));
  }, [rows, query]);

  const sorted = useMemo(() => {
    const val = (r: RuleSetRow): string | number => {
      switch (sortKey) {
        case 'name': return r.name.toLowerCase();
        case 'members': return r.memberCount;
        case 'policy': return r.policy.toLowerCase();
        case 'modified': return r.modifiedOn;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = val(a), bv = val(b);
      const c = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? c : -c;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  }
  const caret = (k: SortKey) => (k === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');

  const selectedRow = rows.find((r) => r.id === selected) ?? null;

  async function onDelete() {
    if (!selectedRow) return;
    setBusy(true);
    try { await deleteRuleSet(selectedRow.id); setSelected(null); setConfirmDelete(false); await load(); }
    catch (e: any) { setError(`Delete failed: ${e.message}`); setBusy(false); }
  }

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="rules-view">
      <div className="view-head">
        <button className="view-selector">All Rule Sets
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <span className="count">{rows.length} record{rows.length === 1 ? '' : 's'}</span>
        <span className="spacer" />
        <div className="view-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by keyword" aria-label="Filter rule sets" />
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
        <button className="cmd" disabled={!selectedRow} onClick={() => selectedRow && onOpen(selectedRow.id)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>
          Open
        </button>
        <button className="cmd danger" disabled={!selectedRow || busy} onClick={() => setConfirmDelete(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" /></svg>
          Delete
        </button>
      </div>

      {confirmDelete && selectedRow && (
        <div className="confirm-bar">
          <span>Delete <strong>{selectedRow.name}</strong>? This removes the set (its rules are untouched).</span>
          <span className="spacer" />
          <button className="btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={onDelete}>Delete</button>
        </div>
      )}

      {error && <p className="rh-error">{error}</p>}

      {busy && rows.length === 0 ? (
        <p className="rh-loading">Loading rule sets…</p>
      ) : sorted.length === 0 ? (
        <div className="mg-empty">
          <h2>{rows.length === 0 ? 'No rule sets yet' : 'No rule sets match your filter'}</h2>
          <p>{rows.length === 0 ? 'A rule set runs several rules in one call and combines their outcomes.' : 'Try a different keyword.'}</p>
          {rows.length === 0 && <button className="btn primary" onClick={onNew}>+ New rule set</button>}
        </div>
      ) : (
        <div className="grid-wrap">
          <div className="mgrid sets">
            <div className="mg-head">
              <span className="mg-check" aria-hidden="true" />
              <button className="mg-sort" onClick={() => toggleSort('name')}>Name{caret('name')}</button>
              <button className="mg-sort" onClick={() => toggleSort('members')}>Rules{caret('members')}</button>
              <button className="mg-sort" onClick={() => toggleSort('policy')}>Policy{caret('policy')}</button>
              <button className="mg-sort" onClick={() => toggleSort('modified')}>Modified{caret('modified')}</button>
            </div>
            {sorted.map((r) => {
              const on = r.id === selected;
              return (
                <div className={`mg-row ${on ? 'sel' : ''}`} key={r.id} onClick={() => setSelected(on ? null : r.id)}>
                  <span className="mg-check"><span className={`fcheck ${on ? 'on' : ''}`}>{on && <Check />}</span></span>
                  <button className="mg-name" onClick={(e) => { e.stopPropagation(); onOpen(r.id); }} title="Open rule set">{r.name}</button>
                  <span className="mg-ver">{r.memberCount}</span>
                  <span><span className="pill-policy">{r.policy}</span></span>
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
