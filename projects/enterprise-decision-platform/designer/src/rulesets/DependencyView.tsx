import { useEffect, useState } from 'react';
import { loadDependencyData } from '../dataverse/client';
import { buildDependencyGraph, type DependencyGraph } from './dependencyGraph';

/**
 * Rule dependency graph — rule sets reference member rules, so the edges are set → rule.
 * Shows a bipartite graph (sets left, rules right), reverse usage, and orphan/dangling callouts.
 * Hand-rolled SVG (no chart lib; single-file bundle).
 */
export function DependencyView({ onClose }: { onClose: () => void }) {
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setBusy(true); setError('');
    loadDependencyData()
      .then((d) => { setGraph(buildDependencyGraph(d.rules, d.sets)); setBusy(false); })
      .catch((e) => { setError(e.message); setBusy(false); });
  }
  useEffect(() => { load(); }, []);

  return (
    <section className="dep full">
      <header className="dep-head">
        <div><h2>Rule dependencies</h2><span className="dep-sub">Which rule sets consume which rules</span></div>
        <span className="spacer" />
        <button className="an-close" onClick={load} disabled={busy}>Refresh</button>
        <button className="an-close" onClick={onClose}>Close</button>
      </header>

      {busy && <p className="an-msg">Loading dependencies…</p>}
      {error && <p className="an-msg err">{error}</p>}

      {!busy && !error && graph && (
        graph.stats.setCount === 0
          ? <p className="an-msg">No rule sets yet — dependencies appear once rules are grouped into a set.</p>
          : (
            <div className="dep-body">
              <div className="kpis">
                <Kpi label="Rule sets" value={graph.stats.setCount} />
                <Kpi label="Rules" value={graph.stats.ruleCount} />
                <Kpi label="Orphan rules" value={graph.stats.orphanCount} tone={graph.stats.orphanCount ? 'muted' : undefined} />
                <Kpi label="Broken links" value={graph.stats.danglingCount} tone={graph.stats.danglingCount ? 'bad' : undefined} />
              </div>

              <div className="an-card wide"><span className="an-card-t">Set → rule graph</span><Bipartite graph={graph} /></div>

              <div className="an-card">
                <span className="an-card-t">Rule sets</span>
                {graph.sets.map((s) => (
                  <div key={s.id} className="dep-set">
                    <div className="dep-set-h"><b>{s.name}</b><span className="dep-policy">{s.policy}</span></div>
                    <div className="dep-members">
                      {s.members.map((m, i) => <span key={i} className={`dep-chip ${m.missing ? 'missing' : ''}`}>{m.name}</span>)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="an-card">
                <span className="an-card-t">Rules · used by</span>
                {graph.rules.map((r) => (
                  <div key={r.ruleId} className="dep-rule">
                    <span className="dep-rn">{r.name}</span>
                    {r.orphan
                      ? <span className="dep-orphan">not in any set</span>
                      : <span className="dep-usedby">{r.usedBy.map((u) => <span key={u.id} className="dep-chip">{u.name}</span>)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )
      )}
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'muted' | 'bad' }) {
  return <div className={`kpi ${tone ?? ''}`}><span className="kpi-v">{value}</span><span className="kpi-l">{label}</span></div>;
}

// Bipartite layout: set nodes on the left, rule nodes on the right, an edge per membership.
function Bipartite({ graph }: { graph: DependencyGraph }) {
  const rowH = 30, padY = 16, W = 720, nodeW = 150;
  const rows = Math.max(graph.sets.length, graph.rules.length, 1);
  const H = padY * 2 + (rows - 1) * rowH + 22;
  const leftCx = 20 + nodeW / 2, rightCx = W - 20 - nodeW / 2;
  const setY = (i: number) => padY + i * rowH + 11;
  const ruleIndex = new Map(graph.rules.map((r, i) => [r.ruleId, i]));
  const ruleY = (id: string) => padY + (ruleIndex.get(id) ?? 0) * rowH + 11;

  const node = (cx: number, y: number, label: string, cls: string) => (
    <g>
      <rect x={cx - nodeW / 2} y={y - 10} width={nodeW} height={20} rx={4} className={`dep-node ${cls}`} />
      <text x={cx} y={y + 4} textAnchor="middle" className="dep-node-t">{label.length > 20 ? label.slice(0, 19) + '…' : label}</text>
    </g>
  );

  return (
    <svg className="dep-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Set to rule dependency graph">
      {graph.sets.flatMap((s, i) => s.members.filter((m) => !m.missing).map((m, k) => (
        <line key={`${i}-${k}`} className="dep-edge" x1={leftCx + nodeW / 2} y1={setY(i)} x2={rightCx - nodeW / 2} y2={ruleY(m.ruleId)} />
      )))}
      {graph.sets.map((s, i) => <g key={s.id}>{node(leftCx, setY(i), s.name, 'set')}</g>)}
      {graph.rules.map((r, i) => <g key={r.ruleId}>{node(rightCx, padY + i * rowH + 11, r.name, r.orphan ? 'orphan' : 'rule')}</g>)}
    </svg>
  );
}
