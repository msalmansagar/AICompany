import { useEffect, useState } from 'react';
import { queryLogs, toCsv, type LogRow } from './logService';

const OUTCOMES = ['all', 'matched', 'no-match', 'error'];

export function ExecutionLogViewer({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [outcome, setOutcome] = useState('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  async function refresh() {
    setBusy(true); setErr('');
    try { setRows(await queryLogs({ outcome, top: 100 })); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, [outcome]); // eslint-disable-line

  function exportCsv() {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'edp-execution-logs.csv'; a.click();
  }

  const badge = (o: string) => o === 'matched' ? 'ok' : o === 'error' ? 'bad' : '';

  return (
    <aside className="logpanel">
      <div className="tp-head">
        <strong>Execution Logs</strong>
        <span className="tp-sub">qdb_edp_ruleexecutionlog</span>
        <span className="spacer" />
        <button className="tp-close" onClick={onClose}>✕</button>
      </div>

      <div className="log-controls">
        <label>Outcome</label>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {OUTCOMES.map((o) => <option key={o}>{o}</option>)}
        </select>
        <button onClick={refresh} disabled={busy}>Refresh</button>
        <button onClick={exportCsv} disabled={!rows.length}>CSV</button>
      </div>

      {err && <p className="tp-error">{err}</p>}
      {busy && <p className="tp-sub">loading…</p>}
      {!busy && !rows.length && !err && <p className="tp-sub">No execution logs yet — run a rule (Test ▶ or the Custom API).</p>}

      <div className="log-list">
        {rows.map((r) => (
          <div key={r.id} className="log-row" onClick={() => setOpen(open === r.id ? null : r.id)}>
            <div className="log-top">
              <span className={`log-outcome ${badge(r.outcome)}`}>{r.outcome || '—'}</span>
              <span className="log-dur">{r.durationMs} ms</span>
              <span className="spacer" />
              <span className="log-when">{r.executedOn}</span>
            </div>
            {open === r.id && (
              <div className="log-detail">
                <div><span>Resolved version</span><code>{r.resolvedVersion}</code></div>
                <div><span>Would resolve</span><code>{r.wouldResolve}</code></div>
                <div><span>Actor</span><code>{r.actor}</code></div>
                <div><span>Name</span><code>{r.name}</code></div>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="tp-sub">Showing latest {rows.length}. (Step-level trace is captured by the API but summary-only here in H1 — full step storage is the H2 <code>ruleexecutionstep</code> entity.)</p>
    </aside>
  );
}
