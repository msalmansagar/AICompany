import { useEffect, useState } from 'react';
import {
  listScenarios, saveScenarios, runScenarios,
  type Scenario, type ScenarioRunResult,
} from '../dataverse/client';

interface Props {
  ruleId: string | null;
  ruleName: string;
  getPcrm: () => unknown;
  draftInputs: string;                            // the current Test panel inputs (JSON)
  draftOutputs: Record<string, unknown> | null;   // the last test's outputs — seeds "expected"
}

/**
 * The rule's saved test-scenario suite: capture the current test inputs + outputs as a named
 * scenario, list them, and run them all against the live canvas. The same suite gates Publish
 * server-side, so a green run here is what lets the rule go live.
 */
export function ScenariosPanel({ ruleId, ruleName, getPcrm, draftInputs, draftOutputs }: Props) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [results, setResults] = useState<ScenarioRunResult | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!ruleId) { setScenarios([]); setResults(null); return; }
    setMsg('Loading scenarios…');
    listScenarios(ruleId)
      .then((s) => { setScenarios(s); setMsg(''); })
      .catch((e) => setMsg(`Could not load scenarios: ${e.message}`));
  }, [ruleId]);

  if (!ruleId) return <p className="tp-sub">Save the rule first — scenarios attach to a saved rule.</p>;

  async function persist(next: Scenario[]) {
    setScenarios(next);
    setBusy(true);
    try { await saveScenarios(ruleId!, ruleName, next); setMsg(`Saved · ${next.length} scenario${next.length === 1 ? '' : 's'}.`); }
    catch (e: any) { setMsg(`Save failed: ${e.message}`); }
    finally { setBusy(false); }
  }

  function addFromDraft() {
    let inputs: Record<string, unknown>;
    try { inputs = JSON.parse(draftInputs || '{}'); }
    catch (e: any) { setMsg(`Current inputs are not valid JSON: ${e.message}`); return; }
    const scenario: Scenario = {
      id: crypto.randomUUID ? crypto.randomUUID() : `s-${Date.now()}`,
      name: name.trim() || `Scenario ${scenarios.length + 1}`,
      inputs,
      expected: draftOutputs ?? {},
    };
    setName('');
    void persist([...scenarios, scenario]);
  }

  function remove(id: string) { void persist(scenarios.filter((s) => s.id !== id)); }

  async function runAll() {
    setBusy(true); setMsg('Running scenarios against the current rule…'); setResults(null);
    try { setResults(await runScenarios(getPcrm(), ruleId!)); setMsg(''); }
    catch (e: any) { setMsg(`Run failed: ${e.message}`); }
    finally { setBusy(false); }
  }

  const outcome = (scenarioName: string) => results?.results.find((r) => r.name === scenarioName);
  const canCapture = draftOutputs != null;

  return (
    <div className="res-block grow">
      <div className="scn-bar">
        <input
          className="scn-name" placeholder="Name this scenario" value={name}
          onChange={(e) => setName(e.target.value)} spellCheck={false}
        />
        <button className="tb ghost" disabled={busy || !canCapture} onClick={addFromDraft}
          title={canCapture ? 'Save the current test inputs + outputs as a scenario' : 'Run a test first to capture its outputs as the expectation'}>
          ＋ Save current as scenario
        </button>
        <button className="tb test" disabled={busy || scenarios.length === 0} onClick={runAll}>▶ Run all</button>
      </div>

      {results && (
        <span className={`outcome ${results.allPassed ? 'ok' : 'bad'}`}>
          {results.allPassed ? '✓' : '✗'} {results.passed}/{results.total} scenarios passed
        </span>
      )}

      {scenarios.length === 0
        ? <p className="tp-sub">No scenarios yet. Run a test, then “Save current as scenario” to capture it as a regression check.</p>
        : scenarios.map((s) => {
          const r = outcome(s.name);
          const cls = r ? (r.passed ? 'pass' : 'fail') : 'idle';
          return (
            <div key={s.id} className={`scn-row ${cls}`}>
              <span className="scn-status">{r ? (r.passed ? '✓' : '✗') : '•'}</span>
              <div className="scn-main">
                <span className="scn-title">{s.name}</span>
                <span className="scn-io">{summarize(s.inputs)} → {summarize(s.expected)}</span>
                {r && !r.passed && (r.error
                  ? <span className="scn-msg">{r.error}</span>
                  : r.mismatches.map((m, i) => <span key={i} className="scn-msg">{m}</span>))}
              </div>
              <button className="scn-del" disabled={busy} onClick={() => remove(s.id)} title="Delete scenario">✕</button>
            </div>
          );
        })}

      {msg && <p className="tp-sub">{msg}</p>}
    </div>
  );
}

function summarize(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj ?? {});
  if (entries.length === 0) return '∅';
  return entries.map(([k, v]) => `${k}=${String(v)}`).join(', ');
}
