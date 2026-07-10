import { useEffect, useState } from 'react';
import {
  listRules, loadRuleSet, saveRuleSet, executeRuleSet,
  SET_POLICIES, type RuleSetMember, type SetPolicy, type RuleSetResult, type RuleSummary,
} from '../dataverse/client';

const POLICY_HINT: Record<SetPolicy, string> = {
  Collect: 'Run every rule and merge all their outputs.',
  FirstMatch: 'Run in order; stop at the first rule that matches.',
  Priority: 'Run every rule; later members override on overlapping outputs.',
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'rule';

/**
 * Rule Set editor — compose the governed set: pick member rules, order them, choose the
 * combine policy, save, and test against the live runtime. Each member runs the rule's
 * Published version; the set (not the caller) owns membership and policy.
 */
export function RuleSetEditor({ setId, onBack, onSaved }: {
  setId: string | null; onBack: () => void; onSaved: (id: string) => void;
}) {
  const [id, setId2] = useState<string | null>(setId);
  const [name, setName] = useState('Untitled Rule Set');
  const [description, setDescription] = useState('');
  const [policy, setPolicy] = useState<SetPolicy>('Collect');
  const [members, setMembers] = useState<RuleSetMember[]>([]);
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');

  const [testInputs, setTestInputs] = useState('{}');
  const [result, setResult] = useState<RuleSetResult | null>(null);
  const [testError, setTestError] = useState('');

  useEffect(() => {
    void (async () => {
      try { setRules(await listRules()); } catch (e: any) { setStatus(`Could not load rules: ${e.message}`); }
    })();
    if (!setId) return;
    setBusy(true);
    void (async () => {
      try {
        const s = await loadRuleSet(setId);
        setName(s.name); setDescription(s.description); setPolicy(s.policy); setMembers(s.members); setId2(s.id);
        setStatus(`Loaded “${s.name}”.`);
      } catch (e: any) { setStatus(`Load failed: ${e.message}`); } finally { setBusy(false); }
    })();
  }, [setId]);

  function mutate(next: RuleSetMember[]) { setMembers(next); setDirty(true); }
  function addMember() {
    const first = rules[0];
    mutate([...members, { key: first ? slug(first.name) : `rule${members.length + 1}`, ruleId: first?.ruleId ?? '', order: members.length + 1 }]);
  }
  function setMember(i: number, patch: Partial<RuleSetMember>) {
    mutate(members.map((m, x) => (x === i ? { ...m, ...patch } : m)));
  }
  function removeMember(i: number) { mutate(members.filter((_, x) => x !== i).map((m, x) => ({ ...m, order: x + 1 }))); }
  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= members.length) return;
    const next = [...members];
    [next[i], next[j]] = [next[j], next[i]];
    mutate(next.map((m, x) => ({ ...m, order: x + 1 })));
  }
  function onPickRule(i: number, ruleId: string) {
    const rule = rules.find((r) => r.ruleId === ruleId);
    const auto = members[i].key === '' || members[i].key === slug(rules.find((r) => r.ruleId === members[i].ruleId)?.name ?? '');
    setMember(i, { ruleId, key: auto && rule ? slug(rule.name) : members[i].key });
  }

  const canSave = !!name.trim() && members.length > 0 && members.every((m) => m.ruleId);

  async function onSave() {
    setBusy(true); setStatus('Saving rule set…');
    try {
      const savedId = await saveRuleSet({ id: id ?? undefined, name, description, policy, members });
      setId2(savedId); setDirty(false); setStatus(`Saved ✓ rule set ${savedId.slice(0, 8)}…`);
      onSaved(savedId);
    } catch (e: any) { setStatus(`Save failed: ${e.message}`); } finally { setBusy(false); }
  }

  async function onTest() {
    setTestError(''); setResult(null);
    if (!id || dirty) { setStatus('Save the set before testing — the runtime reads the saved definition.'); return; }
    let inputs: Record<string, unknown>;
    try { inputs = JSON.parse(testInputs || '{}'); } catch (e: any) { setTestError(`Inputs JSON invalid: ${e.message}`); return; }
    setBusy(true); setStatus('Executing rule set…');
    try { setResult(await executeRuleSet(id, inputs)); setStatus('Done.'); }
    catch (e: any) { setTestError(e.message); setStatus('Execution failed.'); } finally { setBusy(false); }
  }

  return (
    <div className="set-editor">
      <header className="topbar">
        <button className="tb ghost back" disabled={busy} onClick={onBack} title="Back to all rule sets">← Rule sets</button>
        <div className="rule-id">
          <input className="rule-name" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} aria-label="Rule set name" />
          <span className={`badge ${id && !dirty ? 'published' : 'new'}`}><span className="dot" />{id ? (dirty ? 'Unsaved changes' : 'Saved') : 'Not saved'}</span>
        </div>
        <span className="spacer" />
        <div className="top-actions">
          <button className="tb test" disabled={busy || !id || dirty} onClick={onTest} title={!id || dirty ? 'Save the set first' : 'Execute against the runtime'}>▶ Test</button>
          <button className="tb primary" disabled={busy || !canSave} onClick={onSave}>Save</button>
        </div>
      </header>

      <div className="set-body">
        <div className="set-card">
          <div className="fld">
            <span className="fld-lbl">Combine policy</span>
            <div className="mode-seg policy-seg" role="tablist" aria-label="Combine policy">
              {SET_POLICIES.map((p) => (
                <button key={p} className={policy === p ? 'on' : ''} onClick={() => { setPolicy(p); setDirty(true); }}>{p}</button>
              ))}
            </div>
            <span className="fld-hint">{POLICY_HINT[policy]}</span>
          </div>

          <div className="fld">
            <span className="fld-lbl">Member rules <span className="fld-count">{members.length}</span></span>
            <div className="member-list">
              <div className="member-head">
                <span>Order</span><span>Rule (runs Published version)</span><span>Result key</span><span />
              </div>
              {members.length === 0 && <p className="member-empty">No rules yet. Add the rules this set should evaluate.</p>}
              {members.map((m, i) => (
                <div className="member-row" key={i}>
                  <span className="member-ord">
                    <button className="ord-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">▲</button>
                    <b>{i + 1}</b>
                    <button className="ord-btn" disabled={i === members.length - 1} onClick={() => move(i, 1)} title="Move down">▼</button>
                  </span>
                  <select className="member-rule" value={m.ruleId ?? ''} onChange={(e) => onPickRule(i, e.target.value)}>
                    <option value="" disabled>— pick a rule —</option>
                    {rules.map((r) => <option key={r.ruleId} value={r.ruleId}>{r.name}</option>)}
                  </select>
                  <input className="member-key" value={m.key} onChange={(e) => setMember(i, { key: e.target.value })} placeholder="key" title="Key this rule's outputs appear under" />
                  <button className="member-del" onClick={() => removeMember(i)} title="Remove">✕</button>
                </div>
              ))}
              <button className="add-member" onClick={addMember} disabled={rules.length === 0}>+ Add rule</button>
            </div>
          </div>

          <label className="fld">
            <span className="fld-lbl">Description <span className="fld-opt">optional</span></span>
            <input className="fld-input" value={description} onChange={(e) => { setDescription(e.target.value); setDirty(true); }} placeholder="What decision does this set make?" />
          </label>
        </div>

        <aside className="set-test">
          <div className="tp-head"><strong>Test set</strong><span className="tp-sub">via C# runtime</span></div>
          <label>Input values (JSON)</label>
          <textarea value={testInputs} onChange={(e) => setTestInputs(e.target.value)} spellCheck={false} placeholder='{ "loanAmount": 600000 }' />
          <button className="tb test" disabled={busy || !id || dirty} onClick={onTest} title={!id || dirty ? 'Save the set first' : undefined}>▶ Run</button>
          {(!id || dirty) && <p className="tp-sub">Save the set to enable testing.</p>}
          {testError && <p className="tp-error">{testError}</p>}

          {result && (
            <div className="set-result">
              <div className="res-block">
                <span className="res-label">Outcome</span>
                <span className={`outcome ${result.matchedCount > 0 ? 'ok' : 'neutral'}`}>{result.matchedCount}/{result.count} matched · policy {result.policy}</span>
              </div>
              <div className="res-block">
                <span className="res-label">Per rule</span>
                {result.results.map((r, i) => (
                  <div key={i} className={`member-res ${r.matched ? 'ok' : r.success ? 'neutral' : 'bad'}`}>
                    <span className="mr-key">{r.key}</span>
                    <span className="mr-state">{r.matched ? '✓ matched' : r.success ? '— no match' : '✗ ' + (r.message ?? 'error')}</span>
                    {r.outputs && Object.keys(r.outputs).length > 0 && (
                      <span className="mr-out">{Object.entries(r.outputs).map(([k, v]) => `${k}=${String(v)}`).join(', ')}</span>
                    )}
                  </div>
                ))}
              </div>
              {Object.keys(result.aggregate?.outputs ?? {}).length > 0 && (
                <div className="res-block">
                  <span className="res-label">Aggregate outputs</span>
                  {Object.entries(result.aggregate.outputs).map(([k, v]) => <div key={k} className="kv"><span className="k">{k}</span><span className="v">{String(v)}</span></div>)}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <footer className="status">{status || 'Ready.'}</footer>
    </div>
  );
}
