import { useEffect, useState, type ReactNode } from 'react';
import { listRuleVersions, loadVersionPcrm, type VersionRow } from '../dataverse/client';
import { diffPcrm, type PcrmDiff } from './diff';

/**
 * Compare two versions of a rule. Lists the version history, defaults to the two newest, and
 * renders a structural diff of their PCRM (metadata, inputs, outputs, rows).
 */
export function VersionCompare({ ruleId, ruleName, onClose }: { ruleId: string; ruleName: string; onClose: () => void }) {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [diff, setDiff] = useState<PcrmDiff | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listRuleVersions(ruleId)
      .then((vs) => {
        setVersions(vs); setBusy(false);
        if (vs.length >= 2) { setFromId(vs[1].versionId); setToId(vs[0].versionId); }   // older → newer
        else if (vs.length === 1) { setFromId(vs[0].versionId); setToId(vs[0].versionId); }
      })
      .catch((e) => { setError(e.message); setBusy(false); });
  }, [ruleId]);

  useEffect(() => {
    if (!fromId || !toId) { setDiff(null); return; }
    let live = true;
    Promise.all([loadVersionPcrm(fromId), loadVersionPcrm(toId)])
      .then(([a, b]) => { if (live) setDiff(diffPcrm(a as any, b as any)); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [fromId, toId]);

  const label = (v: VersionRow) => `v${v.versionNumber} · ${v.status}`;
  const picker = (value: string, set: (v: string) => void, label2: string) => (
    <label className="vc-pick">{label2}
      <select value={value} onChange={(e) => set(e.target.value)}>
        {versions.map((v) => <option key={v.versionId} value={v.versionId}>{label(v)}</option>)}
      </select>
    </label>
  );

  return (
    <aside className="vc">
      <div className="vc-head">
        <strong>Compare versions</strong><span className="vc-sub">{ruleName}</span>
        <span className="spacer" /><button className="vc-close" onClick={onClose}>✕</button>
      </div>

      {busy ? <p className="tp-sub">Loading history…</p>
        : error ? <p className="tp-error">{error}</p>
          : versions.length < 2 ? <p className="tp-sub">This rule has only one version — nothing to compare yet.</p>
            : (
              <>
                <div className="vc-bar">
                  {picker(fromId, setFromId, 'from')}
                  <span className="vc-arrow">→</span>
                  {picker(toId, setToId, 'to')}
                </div>

                {diff && (diff.identical
                  ? <span className="outcome ok">✓ These two versions are identical</span>
                  : (
                    <div className="vc-diff">
                      {diff.meta.length > 0 && (
                        <Section title="Properties">
                          {diff.meta.map((c) => <Line key={c.field} label={c.field}>{c.from || '—'} → <b>{c.to || '—'}</b></Line>)}
                        </Section>
                      )}
                      {(diff.inputs.added.length || diff.inputs.removed.length || diff.inputs.changed.length) > 0 && (
                        <Section title="Inputs"><ListBlock d={diff.inputs} /></Section>
                      )}
                      {(diff.outputs.added.length || diff.outputs.removed.length || diff.outputs.changed.length) > 0 && (
                        <Section title="Outputs"><ListBlock d={diff.outputs} /></Section>
                      )}
                      {diff.rows.length > 0 && (
                        <Section title="Rows">
                          {diff.rows.map((r) => (
                            <div key={r.index} className={`vc-row ${r.kind}`}>
                              <span className="vc-rk">{r.kind === 'added' ? '＋' : r.kind === 'removed' ? '−' : '≠'} row {r.index}</span>
                              <div className="vc-rd">{r.details.map((d, i) => <span key={i}>{d}</span>)}</div>
                            </div>
                          ))}
                        </Section>
                      )}
                    </div>
                  ))}
              </>
            )}
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div className="vc-section"><span className="vc-st">{title}</span>{children}</div>;
}
function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="vc-line"><span className="vc-lk">{label}</span><span className="vc-lv">{children}</span></div>;
}
function ListBlock({ d }: { d: { added: string[]; removed: string[]; changed: { field: string; from: string; to: string }[] } }) {
  return (
    <>
      {d.added.map((x) => <div key={'a' + x} className="vc-tag added">＋ {x}</div>)}
      {d.removed.map((x) => <div key={'r' + x} className="vc-tag removed">− {x}</div>)}
      {d.changed.map((c) => <div key={'c' + c.field} className="vc-tag changed">≠ {c.field}: {c.from} → {c.to}</div>)}
    </>
  );
}
