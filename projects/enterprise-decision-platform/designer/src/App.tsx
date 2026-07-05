import { useState } from 'react';
import { DecisionGraph, JdmConfigProvider, type DecisionGraphType } from '@gorules/jdm-editor';
import { toPcrm } from './translator/toPcrm';
import { saveRule, loadLatestVersion, listRules, getVersionState, type RuleSummary } from './dataverse/client';
import { evaluate, type EvaluateResult } from './runtime/testClient';
import { performAction, type GovernanceAction } from './governance/governanceClient';
import { MetadataExplorer } from './metadata/MetadataExplorer';
import { DecisionTableEditor } from './table/DecisionTableEditor';
import { emptyTable, tableToPcrm, type TableModel } from './table/tableModel';
import { ExecutionLogViewer } from './logs/ExecutionLogViewer';
import { saveScenario, listScenarios, updateResult, outputsMatch, type Scenario } from './scenarios/scenarioService';

const EMPTY: DecisionGraphType = { nodes: [], edges: [] };

export function App() {
  const [graph, setGraph] = useState<DecisionGraphType>(EMPTY);
  const [ruleName, setRuleName] = useState('Untitled Rule');
  const [targetEntity, setTargetEntity] = useState('qdb_loanapplication');
  const [status, setStatus] = useState('Ready.');
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<RuleSummary[]>([]);

  // --- Governance state ---
  const [versionId, setVersionId] = useState<string | null>(null);
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<string>('');
  const [scenarios, setScenarios] = useState<Array<Scenario & { pass?: boolean }>>([]);

  const [showMetadata, setShowMetadata] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [authorMode, setAuthorMode] = useState<'canvas' | 'table'>('canvas');
  const [table, setTable] = useState<TableModel>(emptyTable());

  function currentPcrm() {
    return authorMode === 'table'
      ? tableToPcrm(table, { name: ruleName, targetEntity })
      : toPcrm(graph, { name: ruleName, targetEntity });
  }
  const currentSource = () => (authorMode === 'table' ? table : graph);

  // --- Test panel state ---
  const [showTest, setShowTest] = useState(false);
  const [testInputs, setTestInputs] = useState('{}');
  const [testResult, setTestResult] = useState<EvaluateResult | null>(null);
  const [testError, setTestError] = useState('');

  async function onSave() {
    setBusy(true);
    setStatus('Translating + saving to Dataverse…');
    try {
      const pcrm = currentPcrm();
      const res = await saveRule({ name: ruleName, jdmGraph: currentSource(), pcrm });
      setVersionId(res.versionId);
      setRuleId(res.ruleId);
      setLifecycle('Draft');
      void loadScenarios(res.ruleId);
      setStatus(`Saved ✓  rule ${res.ruleId.slice(0, 8)}… · version ${res.versionId.slice(0, 8)}…`);
      await refreshRules();
    } catch (e: any) {
      setStatus(`Save failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function refreshRules() {
    try { setRules(await listRules()); }
    catch (e: any) { setStatus(`Could not list rules: ${e.message}`); }
  }

  async function onLoad(ruleId: string) {
    setBusy(true);
    setStatus('Loading latest version…');
    try {
      const v = await loadLatestVersion(ruleId);
      const src: any = v?.jdmGraph;
      if (src?.editor === 'edp-table') { setAuthorMode('table'); setTable(src as TableModel); }
      else { setAuthorMode('canvas'); if (src) setGraph(src); }
      setRuleName(v?.ruleName ?? 'Rule');
      setVersionId(v?.versionId ?? null);
      setRuleId(ruleId);
      setLifecycle(v?.lifecycleState ?? '');
      void loadScenarios(ruleId);
      setStatus(`Loaded ${v?.ruleName ?? ''} (version ${v?.versionNumber ?? '?'} · ${v?.lifecycleState ?? ''}).`);
    } catch (e: any) {
      setStatus(`Load failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function runGov(action: GovernanceAction) {
    if (!versionId) { setStatus('Save or open a rule first — governance acts on a saved version.'); return; }
    setBusy(true);
    setStatus(`${action}…`);
    try {
      const r = await performAction(versionId, action);
      setLifecycle(r.newState || (await getVersionState(versionId)));
      setStatus(`${action} ✓ — ${r.message}`);
    } catch (e: any) {
      setStatus(`${action} failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function loadScenarios(rid: string) {
    try { setScenarios(await listScenarios(rid)); } catch { /* ignore */ }
  }
  async function saveCurrentScenario() {
    if (!ruleId) { setStatus('Save the rule first — scenarios attach to a saved rule.'); return; }
    if (!testResult) { setStatus('Run a test first, then save its inputs + outputs as a scenario.'); return; }
    const name = window.prompt('Scenario name:', `Scenario ${scenarios.length + 1}`);
    if (!name) return;
    try {
      let inputs: Record<string, unknown> = {};
      try { inputs = JSON.parse(testInputs || '{}'); } catch { /* keep */ }
      await saveScenario(ruleId, name, inputs, testResult.outputs as Record<string, unknown>);
      await loadScenarios(ruleId);
      setStatus(`Scenario "${name}" saved (expected = last result).`);
    } catch (e: any) { setStatus('Save scenario failed: ' + e.message); }
  }
  async function runAllScenarios() {
    if (!scenarios.length) return;
    setBusy(true);
    try {
      const pcrm = currentPcrm();
      const updated: Array<Scenario & { pass?: boolean }> = [];
      for (const s of scenarios) {
        try {
          const r = await evaluate(pcrm, s.inputs);
          const pass = outputsMatch(s.expected, r.outputs);
          await updateResult(s.id, pass ? 'pass' : 'fail');
          updated.push({ ...s, pass });
        } catch { updated.push({ ...s, pass: false }); }
      }
      setScenarios(updated);
      setStatus(`Regression: ${updated.filter((u) => u.pass).length}/${updated.length} scenarios passed.`);
    } finally { setBusy(false); }
  }

  function openTest() {
    // Prefill the inputs editor with the rule's declared input names.
    const pcrm = currentPcrm() as any;
    const seed: Record<string, unknown> = {};
    for (const i of pcrm.inputs ?? []) seed[i.name] = '';
    setTestInputs(JSON.stringify(seed, null, 2));
    setTestResult(null);
    setTestError('');
    setShowTest(true);
  }

  async function runTest() {
    setTestError('');
    setTestResult(null);
    let inputs: Record<string, unknown>;
    try { inputs = JSON.parse(testInputs || '{}'); }
    catch (e: any) { setTestError(`Inputs JSON invalid: ${e.message}`); return; }
    try {
      const pcrm = currentPcrm();
      setTestResult(await evaluate(pcrm, inputs));
    } catch (e: any) {
      setTestError(e.message);
    }
  }

  return (
    <div className="app">
      <header className="bar">
        <strong>EDP Visual Rule Designer</strong>
        <span className="tag">MVP · local · GoRules → PCRM → Dataverse</span>
        <span className="spacer" />
        <label>Rule</label>
        <input value={ruleName} onChange={(e) => setRuleName(e.target.value)} />
        <label>Entity</label>
        <input value={targetEntity} onChange={(e) => setTargetEntity(e.target.value)} style={{ width: 150 }} />
        <button disabled={busy} onClick={() => setAuthorMode((m) => (m === 'table' ? 'canvas' : 'table'))}>
          {authorMode === 'table' ? '◇ Canvas' : '▦ Table Editor'}
        </button>
        <button disabled={busy} onClick={() => setShowMetadata((v) => !v)}>CRM Fields ⌗</button>
        <button disabled={busy} onClick={() => setShowLogs((v) => !v)}>Logs ▤</button>
        <button className="test" disabled={busy} onClick={openTest}>Test ▶</button>
        <button disabled={busy} onClick={onSave}>Save to Dataverse ▲</button>
        <button disabled={busy} onClick={refreshRules}>Open…</button>
      </header>

      {rules.length > 0 && (
        <div className="rulelist">
          {rules.map((r) => (
            <button key={r.ruleId} className="chip" onClick={() => onLoad(r.ruleId)}>{r.name}</button>
          ))}
        </div>
      )}

      {versionId && (
        <div className="govbar">
          <span className="gov-label">Lifecycle</span>
          <span className="gov-state">{lifecycle || '—'}</span>
          <span className="spacer" />
          <button disabled={busy} onClick={() => runGov('Submit')}>Submit</button>
          <button disabled={busy} onClick={() => runGov('Approve')}>Approve</button>
          <button disabled={busy} className="gov-reject" onClick={() => runGov('Reject')}>Reject</button>
          <button disabled={busy} className="gov-publish" onClick={() => runGov('Publish')}>Publish</button>
        </div>
      )}

      <div className="body">
        {showMetadata && <MetadataExplorer defaultEntity={targetEntity} onClose={() => setShowMetadata(false)} />}

        <div className="editor">
          {authorMode === 'table' ? (
            <DecisionTableEditor entity={targetEntity} value={table} onChange={setTable} />
          ) : (
            <JdmConfigProvider>
              <DecisionGraph value={graph} onChange={setGraph} />
            </JdmConfigProvider>
          )}
        </div>

        {showLogs && <ExecutionLogViewer onClose={() => setShowLogs(false)} />}

        {showTest && (
          <aside className="testpanel">
            <div className="tp-head">
              <strong>Test rule</strong>
              <span className="tp-sub">via C# runtime</span>
              <span className="spacer" />
              <button className="tp-close" onClick={() => setShowTest(false)}>✕</button>
            </div>
            <label>Input values (JSON)</label>
            <textarea value={testInputs} onChange={(e) => setTestInputs(e.target.value)} spellCheck={false} />
            <button className="test" onClick={runTest}>Run ▶</button>

            {testError && <p className="tp-error">{testError}</p>}

            {testResult && (
              <div className="tp-result">
                <p className={`tp-verdict ${testResult.success && testResult.matched ? 'ok' : testResult.success ? '' : 'bad'}`}>
                  {!testResult.success ? '✗ Did not execute' : testResult.matched ? '✓ Matched' : '— No branch matched'}
                  <span className="tp-ms"> · {testResult.elapsedMs} ms</span>
                </p>
                {Object.keys(testResult.outputs || {}).length > 0 && (
                  <>
                    <div className="tp-lbl">Outputs</div>
                    <pre>{JSON.stringify(testResult.outputs, null, 2)}</pre>
                  </>
                )}
                {testResult.diagnostics?.length > 0 && (
                  <>
                    <div className="tp-lbl">Diagnostics</div>
                    {testResult.diagnostics.map((d, i) => (
                      <div key={i} className={`tp-diag ${d.severity}`}>[{d.severity}] {d.code}: {d.message}</div>
                    ))}
                  </>
                )}
                {testResult.trace?.length > 0 && (
                  <>
                    <div className="tp-lbl">Trace</div>
                    {testResult.trace.map((s, i) => (
                      <div key={i} className="tp-step">
                        <span className="tp-k">{s.kind}</span>
                        <span>{s.description}</span>
                        {s.result === true && <span className="t">true</span>}
                        {s.result === false && <span className="f">false</span>}
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="tp-lbl">Scenario library (regression)</div>
            <div className="sc-actions">
              <button onClick={saveCurrentScenario} disabled={!testResult}>⭐ Save current</button>
              <button onClick={runAllScenarios} disabled={!scenarios.length || busy}>Run all ▶</button>
            </div>
            {!ruleId && <p className="tp-sub">Save the rule to attach scenarios.</p>}
            {scenarios.map((s) => (
              <div key={s.id} className="sc-row">
                <span className={`sc-badge ${s.pass === true ? 'ok' : s.pass === false ? 'bad' : ''}`}>
                  {s.pass === true ? 'PASS' : s.pass === false ? 'FAIL' : (s.lastResult || '—').toUpperCase()}
                </span>
                <span className="sc-name">{s.name}</span>
              </div>
            ))}
          </aside>
        )}
      </div>

      <footer className="status">{status}</footer>
    </div>
  );
}
