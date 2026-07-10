import { useEffect, useState } from 'react';
import { getRuleAnalytics, type AnalyticsData } from '../dataverse/client';

const PERIODS = [7, 30, 90] as const;

/**
 * Decision analytics — reads the execution-log telemetry every rule run already writes and
 * shows volume, outcome mix, latency percentiles, a daily trend, and the busiest rule-versions.
 * Server-aggregated (qdb_edp_GetRuleAnalytics); charts are hand-rolled SVG/CSS (no chart lib).
 */
export function AnalyticsDashboard({ onClose }: { onClose: () => void }) {
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true); setError('');
    getRuleAnalytics(periodDays)
      .then((d) => { if (live) { setData(d); setLoading(false); } })
      .catch((e) => { if (live) { setError(e.message); setLoading(false); } });
    return () => { live = false; };
  }, [periodDays]);

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const maxTop = Math.max(1, ...(data?.topRules.map((r) => r.count) ?? [1]));

  return (
    <section className="an full">
      <header className="an-head">
        <div>
          <h2>Decision analytics</h2>
          <span className="an-sub">Live from execution telemetry · every rule run is recorded</span>
        </div>
        <div className="an-period" role="tablist" aria-label="Time window">
          {PERIODS.map((p) => (
            <button key={p} className={periodDays === p ? 'on' : ''} onClick={() => setPeriodDays(p)}>{p}d</button>
          ))}
        </div>
        <span className="spacer" />
        <button className="an-close" onClick={onClose}>Close</button>
      </header>

      {loading && <p className="an-msg">Loading analytics…</p>}
      {error && <p className="an-msg err">Could not load analytics: {error}</p>}

      {!loading && !error && data && (
        data.total === 0
          ? <p className="an-msg">No decisions recorded in the last {data.periodDays} days. Run a rule to populate the dashboard.</p>
          : (
            <div className="an-grid">
              <div className="kpis">
                <Kpi label="Decisions" value={data.total.toLocaleString()} />
                <Kpi label="Match rate" value={pct(data.matchRate)} tone="ok" />
                <Kpi label="Error rate" value={pct(data.errorRate)} tone={data.error > 0 ? 'bad' : 'muted'} />
                <Kpi label="p95 latency" value={`${data.latency.p95Ms} ms`} />
              </div>

              <div className="an-card wide">
                <span className="an-card-t">Decision volume · last {data.periodDays} days</span>
                <VolumeChart byDay={data.byDay} />
              </div>

              <div className="an-card">
                <span className="an-card-t">Outcome mix</span>
                <OutcomeBar matched={data.matched} noMatch={data.noMatch} error={data.error} total={data.total} />
                <div className="an-legend">
                  <Legend cls="ok" label="Matched" n={data.matched} />
                  <Legend cls="muted" label="No match" n={data.noMatch} />
                  <Legend cls="bad" label="Error" n={data.error} />
                </div>
              </div>

              <div className="an-card">
                <span className="an-card-t">Latency (ms)</span>
                <div className="an-stats">
                  <Stat label="avg" value={data.latency.avgMs} />
                  <Stat label="p50" value={data.latency.p50Ms} />
                  <Stat label="p95" value={data.latency.p95Ms} />
                  <Stat label="max" value={data.latency.maxMs} />
                </div>
              </div>

              <div className="an-card wide">
                <span className="an-card-t">Busiest rule versions</span>
                {data.topRules.length === 0
                  ? <p className="an-sub">No version-attributed runs in this window.</p>
                  : data.topRules.map((r) => (
                    <div key={r.versionKey} className="an-bar-row">
                      <span className="an-bar-label" title={r.label}>{r.label}</span>
                      <div className="an-bar-track"><div className="an-bar-fill" style={{ width: `${(r.count / maxTop) * 100}%` }} /></div>
                      <span className="an-bar-n">{r.count.toLocaleString()}{r.errors > 0 && <em className="an-err"> · {r.errors} err</em>}</span>
                    </div>
                  ))}
              </div>

              <p className="an-foot">
                {data.truncated && <span className="an-warn">Showing a capped sample — narrow the window for exact figures. </span>}
                Pinned-version usage isn’t captured by the runtime yet, so it’s omitted here.
              </p>
            </div>
          )
      )}
    </section>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'bad' | 'muted' }) {
  return (
    <div className={`kpi ${tone ?? ''}`}>
      <span className="kpi-v">{value}</span>
      <span className="kpi-l">{label}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="an-stat"><span className="an-stat-v">{value}</span><span className="an-stat-l">{label}</span></div>;
}

function Legend({ cls, label, n }: { cls: string; label: string; n: number }) {
  return <span className="an-leg"><i className={`dot ${cls}`} />{label}<b>{n.toLocaleString()}</b></span>;
}

function OutcomeBar({ matched, noMatch, error, total }: { matched: number; noMatch: number; error: number; total: number }) {
  const w = (n: number) => `${total === 0 ? 0 : (n / total) * 100}%`;
  return (
    <div className="an-outcome">
      {matched > 0 && <div className="seg ok" style={{ width: w(matched) }} />}
      {noMatch > 0 && <div className="seg muted" style={{ width: w(noMatch) }} />}
      {error > 0 && <div className="seg bad" style={{ width: w(error) }} />}
    </div>
  );
}

// Area + line chart of daily decision volume, with error days marked. Pure SVG, viewBox-scaled.
function VolumeChart({ byDay }: { byDay: { date: string; count: number; errors: number }[] }) {
  const W = 720, H = 160, padX = 8, padY = 12;
  const max = Math.max(1, ...byDay.map((b) => b.count));
  const n = byDay.length;
  const x = (i: number) => padX + (n <= 1 ? 0 : (i / (n - 1)) * (W - 2 * padX));
  const y = (v: number) => H - padY - (v / max) * (H - 2 * padY);

  const line = byDay.map((b, i) => `${x(i).toFixed(1)},${y(b.count).toFixed(1)}`).join(' ');
  const area = `${padX},${H - padY} ${line} ${x(n - 1).toFixed(1)},${H - padY}`;
  const labels = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i && v >= 0);

  return (
    <svg className="an-chart" viewBox={`0 0 ${W} ${H + 18}`} preserveAspectRatio="none" role="img" aria-label="Daily decision volume">
      <polygon className="an-area" points={area} />
      <polyline className="an-line" points={line} fill="none" />
      {byDay.map((b, i) => b.errors > 0 && <circle key={i} className="an-errpt" cx={x(i)} cy={y(b.count)} r={2.5} />)}
      {byDay.length > 0 && <circle className="an-endpt" cx={x(n - 1)} cy={y(byDay[n - 1].count)} r={3} />}
      {labels.map((i) => <text key={i} className="an-xlab" x={x(i)} y={H + 12} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{byDay[i]?.date.slice(5)}</text>)}
    </svg>
  );
}
