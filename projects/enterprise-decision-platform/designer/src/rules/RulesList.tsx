import { useEffect, useMemo, useState } from 'react';
import { listRulesDetailed, duplicateRule, deleteRule, type RuleRow } from '../dataverse/client';
import { searchEntities, type EntityMeta } from '../metadata/metadataService';

/**
 * Rules home — the landing surface. Lists every rule with its status, entity, and
 * version, and supports search + open / duplicate / delete (delete only when the rule
 * is not Published). This is the management view; authoring happens in the editor.
 */
export function RulesList({ onNew, onOpen }: { onNew: () => void; onOpen: (ruleId: string) => void }) {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [entities, setEntities] = useState<EntityMeta[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    setBusy(true); setError('');
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
      r.name.toLowerCase().includes(q) ||
      r.entity.toLowerCase().includes(q) ||
      entityLabel(r.entity).toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q));
  }, [rows, query, entities]);

  async function onDuplicate(ruleId: string) {
    setBusy(true);
    try { await duplicateRule(ruleId); await load(); }
    catch (e: any) { setError(`Copy failed: ${e.message}`); setBusy(false); }
  }
  async function onDelete(ruleId: string) {
    setBusy(true);
    try { await deleteRule(ruleId); setConfirmDelete(null); await load(); }
    catch (e: any) { setError(`Delete failed: ${e.message}`); setBusy(false); }
  }

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const cls = (s: string) => s.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="rules-home">
      <div className="rh-bar">
        <div>
          <h1>Rules</h1>
          <p className="rh-sub">{rows.length} rule{rows.length === 1 ? '' : 's'} in this environment</p>
        </div>
        <div className="rh-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, entity, or status…" aria-label="Search rules" />
        </div>
        <button className="tb ghost" disabled={busy} onClick={() => void load()}>Refresh</button>
        <button className="tb primary" onClick={onNew}>+ New rule</button>
      </div>

      {error && <p className="rh-error">{error}</p>}

      {busy && rows.length === 0 ? (
        <p className="rh-empty">Loading rules…</p>
      ) : filtered.length === 0 ? (
        <div className="rh-empty-state">
          <h2>{rows.length === 0 ? 'No rules yet' : 'No rules match your search'}</h2>
          <p>{rows.length === 0 ? 'Create your first decision rule to get started.' : 'Try a different search term.'}</p>
          {rows.length === 0 && <button className="tb primary" onClick={onNew}>+ New rule</button>}
        </div>
      ) : (
        <div className="rh-grid">
          <div className="rh-head">
            <span>Name</span><span>Entity</span><span>Status</span><span className="rh-c">Version</span><span>Modified</span><span className="rh-a">Actions</span>
          </div>
          {filtered.map((r) => {
            const published = r.status === 'Published';
            const confirming = confirmDelete === r.ruleId;
            return (
              <div className={`rh-row ${confirming ? 'confirming' : ''}`} key={r.ruleId}>
                <button className="rh-name" onClick={() => onOpen(r.ruleId)} title="Open rule">{r.name}</button>
                <span className="rh-entity" title={r.entity}>{entityLabel(r.entity)}</span>
                <span className={`chip life ${cls(r.status)}`}><span className="dot" />{r.status}</span>
                <span className="rh-c ver">v{r.versionNumber}</span>
                <span className="rh-mod">{fmtDate(r.modifiedOn)}</span>
                <span className="rh-a">
                  {confirming ? (
                    <span className="rh-confirm">
                      Delete “{r.name}”?
                      <button className="rh-mini danger" disabled={busy} onClick={() => void onDelete(r.ruleId)}>Delete</button>
                      <button className="rh-mini" onClick={() => setConfirmDelete(null)}>Cancel</button>
                    </span>
                  ) : (
                    <>
                      <button className="rh-mini" onClick={() => onOpen(r.ruleId)}>Open</button>
                      <button className="rh-mini" disabled={busy} onClick={() => void onDuplicate(r.ruleId)} title="Duplicate this rule">Copy</button>
                      <button
                        className="rh-mini danger"
                        disabled={busy || published}
                        onClick={() => setConfirmDelete(r.ruleId)}
                        title={published ? 'Published rules cannot be deleted — retire it instead' : 'Delete this rule'}
                      >Delete</button>
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
