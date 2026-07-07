import { useEffect, useState } from 'react';
import { DecisionGraph, JdmConfigProvider, type DecisionGraphType } from '@gorules/jdm-editor';
import { toPcrm } from './translator/toPcrm';
import {
  saveRule, loadLatestVersion, listRules, getVersionState, validateRule,
  type RuleSummary, type ValidationResult,
} from './dataverse/client';
import { evaluate, type EvaluateResult } from './runtime/testClient';
import { performAction, type GovernanceAction } from './governance/governanceClient';
import { searchEntities, type EntityMeta } from './metadata/metadataService';
import { MetadataExplorer } from './metadata/MetadataExplorer';
import { DecisionTableEditor } from './table/DecisionTableEditor';
import { emptyTable, tableToPcrm, type TableModel } from './table/tableModel';
import { ExecutionLogViewer } from './logs/ExecutionLogViewer';

const EMPTY: DecisionGraphType = { nodes: [], edges: [] };

export function App() {
  const [graph, setGraph] = useState<DecisionGraphType>(EMPTY);
  const [ruleName, setRuleName] = useState('Untitled Rule');
  const [targetEntity, setTargetEntity] = useState('qdb_loanapplication');
  const [status, setStatus] = useState('Ready.');
  const [busy, setBusy] = useState(false);
  const [rules, setRules] = useState<RuleSummary[]>([]);

  // --- Governance / identity state ---
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [lifecycle, setLifecycle] = useState<string>('');
  const [savedLabel, setSavedLabel] = useState<string>('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  // --- Entity friendly name (business terms, not schema names) ---
  const [entities, setEntities] = useState<EntityMeta[]>([]);
  const [entityLabel, setEntityLabel] = useState('');

  const [showMetadata, setShowMetadata] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [authorMode, setAuthorMode] = useState<'canvas' | 'table'>('canvas');
  const [table, setTable] = useState<TableModel>(emptyTable());
  const [dismissedEmpty, setDismissedEmpty] = useState(false);

  // --- Test / results drawer state ---
  const [showTest, setShowTest] = useState(false);
  const [testInputs, setTestInputs] = useState('{}');
  const [testResult, setTestResult] = useState<EvaluateResult | null>(null);
  const [testError, setTestError] = useState('');
  const [drawerTab, setDrawerTab] = useState<'test' | 'validation'>('test');
  const [drawerOpen, setDrawerOpen] = useState(true);

  useEffect(() => {
    searchEntities('').then(setEntities).catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    const match = entities.find((e) => e.logicalName === targetEntity);
    if (match) { setEntityLabel(match.displayName); return; }
    searchEntities(targetEntity)
      .then((list) => { if (alive) setEntityLabel(list.find((e) => e.logicalName === targetEntity)?.displayName ?? ''); })
      .catch(() => {});
    return () => { alive = false; };
  }, [targetEntity, entities]);

  const hasContent = authorMode === 'table' ? table.inputs.length > 0 : graph.nodes.length > 0;
  const showEmpty = !hasContent && !dismissedEmpty && !versionId;

  function currentPcrm() {
    return authorMode === 'table'
      ? tableToPcrm(table, { name: ruleName, targetEntity })
      : toPcrm(graph, { name: ruleName, targetEntity });
  }
  const currentSource = () => (authorMode === 'table' ? table : graph);

  async function onSave() {
    setBusy(true);
    setStatus('Translating + saving to Dataverse…');
    try {
      const pcrm = currentPcrm();
      const res = await saveRule({ name: ruleName, jdmGraph: currentSource(), pcrm });
      setVersionId(res.versionId);
      setVersionNumber(1);
      setLifecycle('Draft');
      setSavedLabel('Saved just now');
      setStatus(`Saved ✓  rule ${res.ruleId.slice(0, 8)}… · version ${res.versionId.slice(0, 8)}…`);
      void runValidation(pcrm);
      await refreshRules();
    } catch (e: any) {
      setStatus(`Save failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function runValidation(pcrm?: unknown) {
    try {
      const v = await validateRule(pcrm ?? currentPcrm());
      setValidation(v);
    } catch (e: any) {
      setStatus(`Validation unavailable: ${e.message}`);
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
      setVersionNumber(v?.versionNumber ?? null);
      setLifecycle(v?.lifecycleState ?? '');
      setSavedLabel('Loaded from Dataverse');
      setDismissedEmpty(true);
      setValidation(null);
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

  function openTest() {
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
      const result = await evaluate(pcrm, inputs);
      setTestResult(result);
      setDrawerTab('test');
      setDrawerOpen(true);
    } catch (e: any) {
      setTestError(e.message);
      setDrawerTab('test');
      setDrawerOpen(true);
    }
  }

  function startBlankTable() { setAuthorMode('table'); setDismissedEmpty(true); }
  function startFromTemplate() { setDismissedEmpty(true); void refreshRules(); setStatus('Pick a rule or template to start from — see the list above.'); }
  function startFromDescription() {
    setDismissedEmpty(true);
    setStatus('Plain-English drafting arrives with the AI Assistant (Phase 6). For now, start from a template or a blank table.');
  }

  const drawerHasContent = !!(testResult || testError || validation);
  const verdict = (r: EvaluateResult) => (!r.success ? '✗ Did not execute' : r.matched ? '✓ Matched' : '— No branch matched');

  return (
    <div className="app">
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v6" /><path d="M12 9c0 4-6 3-6 8" /><path d="M12 9c0 4 6 3 6 8" />
              <circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none" /><circle cx="6" cy="18" r="1.7" /><circle cx="18" cy="18" r="1.7" />
            </svg>
          </span>
          <b>Rule Designer</b>
        </div>

        <div className="rule-id">
          <input className="rule-name" value={ruleName} onChange={(e) => setRuleName(e.target.value)}
            aria-label="Rule name" title="Rename this rule" />
          <label className="entity-field" title={`Schema: ${targetEntity}`}>
            <span className="entity-lbl">On</span>
            <input className="entity-input" list="entity-list" value={targetEntity}
              onChange={(e) => setTargetEntity(e.target.value)} aria-label="Entity" spellCheck={false} />
            {entityLabel && <span className="entity-friendly">{entityLabel}</span>}
          </label>
          <datalist id="entity-list">
            {entities.slice(0, 400).map((e) => <option key={e.logicalName} value={e.logicalName}>{e.displayName}</option>)}
          </datalist>
        </div>

        <div className="status-cluster">
          {versionId ? (
            <>
              <span className={`chip life ${(lifecycle || 'Draft').toLowerCase().replace(/\s+/g, '-')}`}>
                <span className="dot" />{lifecycle || 'Draft'}
              </span>
              {versionNumber != null && <span className="ver">v{versionNumber}</span>}
            </>
          ) : (
            <span className="chip new"><span className="dot" />New · unsaved</span>
          )}
          {validation && (
            <button
              className={`chip valid ${validation.isValid ? 'ok' : 'bad'}`}
              onClick={() => void runValidation()}
              title="Re-check against the runtime validator"
            >
              {validation.isValid ? '✓ Valid' : `⚠ ${validation.errorCount} issue${validation.errorCount === 1 ? '' : 's'}`}
            </button>
          )}
          {savedLabel && <span className="saved">{savedLabel}</span>}
        </div>

        <span className="spacer" />

        <div className="top-actions">
          <button className="tb ghost" disabled={busy}
            onClick={() => setAuthorMode((m) => (m === 'table' ? 'canvas' : 'table'))}>
            {authorMode === 'table' ? 'Canvas' : 'Table'}
          </button>
          <button className="tb ghost" disabled={busy} onClick={() => setShowMetadata((v) => !v)}>Fields</button>
          <button className="tb ghost" disabled={busy} onClick={() => setShowLogs((v) => !v)}>Logs</button>
          <button className="tb test" disabled={busy} onClick={openTest}>▶ Test</button>
          <button className="tb primary" disabled={busy} onClick={onSave}>Save</button>
          <button className="tb ghost" disabled={busy} onClick={refreshRules}>Open…</button>
        </div>
      </header>

      {rules.length > 0 && (
        <div className="rulelist">
          <span className="rl-label">Open</span>
          {rules.map((r) => (
            <button key={r.ruleId} className="chip pick" onClick={() => onLoad(r.ruleId)}>{r.name}</button>
          ))}
        </div>
      )}

      {versionId && (
        <div className="govbar">
          <span className="gov-label">Lifecycle</span>
          <span className="gov-state">{lifecycle || '—'}</span>
          <span className="spacer" />
          <button disabled={busy} onClick={() => runGov('Submit')}>Submit for review</button>
          <button disabled={busy} onClick={() => runGov('Approve')}>Approve</button>
          <button disabled={busy} className="gov-reject" onClick={() => runGov('Reject')}>Reject</button>
          <button disabled={busy} className="gov-publish" onClick={() => runGov('Publish')}>Publish</button>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="body">
        {showMetadata && <MetadataExplorer defaultEntity={targetEntity} onClose={() => setShowMetadata(false)} />}

        <div className="editor-wrap">
          <div className="editor">
            {authorMode === 'table' ? (
              <DecisionTableEditor entity={targetEntity} value={table} onChange={setTable} />
            ) : (
              <JdmConfigProvider>
                <DecisionGraph value={graph} onChange={setGraph} />
              </JdmConfigProvider>
            )}
          </div>

          {showEmpty && (
            <div className="empty-overlay">
              <div className="empty-card">
                <span className="mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v6" /><path d="M12 9c0 4-6 3-6 8" /><path d="M12 9c0 4 6 3 6 8" />
                    <circle cx="12" cy="3" r="1.6" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
                  </svg>
                </span>
                <h2>Let’s build a rule for {entityLabel || targetEntity}</h2>
                <p>Rules decide things — an approval level, a price, an eligibility flag — from the fields on a record. Pick a starting point.</p>
                <div className="starts">
                  <button className="start ai" onClick={startFromDescription}>
                    <span className="s-ic">✦</span>
                    <b>Describe it in plain English <span className="ai-badge">AI</span></b>
                    <span className="s-sub">“Loans over 500,000 with high risk go to the CEO.”</span>
                  </button>
                  <button className="start tpl" onClick={startFromTemplate}>
                    <span className="s-ic">▦</span>
                    <b>Start from a template</b>
                    <span className="s-sub">DOA matrix, eligibility, pricing, risk tiering.</span>
                  </button>
                  <button className="start blank" onClick={startBlankTable}>
                    <span className="s-ic">＋</span>
                    <b>Blank decision table</b>
                    <span className="s-sub">Add conditions and outcomes yourself.</span>
                  </button>
                </div>
              </div>
            </div>
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
            <button className="tb test" onClick={runTest}>▶ Run test</button>
            {testError && <p className="tp-error">{testError}</p>}
            <p className="tp-sub">Results appear in the panel below.</p>
          </aside>
        )}
      </div>

      {/* ── Results drawer ──────────────────────────────────────── */}
      {drawerHasContent && drawerOpen && (
        <div className="drawer">
          <div className="drawer-head">
            <button className={`dt-tab ${drawerTab === 'test' ? 'on' : ''}`} onClick={() => setDrawerTab('test')}>
              ▶ Test result
            </button>
            <button className={`dt-tab ${drawerTab === 'validation' ? 'on' : ''}`} onClick={() => setDrawerTab('validation')}>
              Validation
              {validation && <span className={`b ${validation.isValid ? 'okb' : 'warnb'}`}>{validation.isValid ? '0' : validation.errorCount}</span>}
            </button>
            <span className="spacer" />
            <button className="drawer-close" onClick={() => setDrawerOpen(false)}>Hide ▾</button>
          </div>

          <div className="drawer-body">
            {drawerTab === 'test' && (
              testError ? <p className="tp-error">{testError}</p> :
              testResult ? (
                <>
                  <div className="res-block">
                    <span className="res-label">Outcome</span>
                    <span className={`outcome ${testResult.success && testResult.matched ? 'ok' : testResult.success ? 'neutral' : 'bad'}`}>
                      {verdict(testResult)} · {testResult.elapsedMs} ms
                    </span>
                  </div>
                  {Object.keys(testResult.outputs || {}).length > 0 && (
                    <div className="res-block">
                      <span className="res-label">Outputs</span>
                      {Object.entries(testResult.outputs).map(([k, v]) => (
                        <div key={k} className="kv"><span className="k">{k}</span><span className="v">{String(v)}</span></div>
                      ))}
                    </div>
                  )}
                  {testResult.trace?.length > 0 && (
                    <div className="res-block grow">
                      <span className="res-label">Why — execution trace</span>
                      <div className="trace">
                        {testResult.trace.map((s, i) => (
                          <div key={i} className={`step ${s.result === true ? 'ok' : s.result === false ? 'bad' : ''} ${s.kind === 'branch' ? 'final' : ''}`}>
                            <span className="tk">{s.kind}</span>
                            <span className="td">{s.description}</span>
                            {s.result != null && <span className="tr">{s.result ? '✓' : '✗'}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : <p className="tp-sub">Run a test to see the decision and its trace here.</p>
            )}

            {drawerTab === 'validation' && (
              validation ? (
                validation.isValid && validation.diagnostics.length === 0
                  ? <span className="outcome ok">✓ No issues found</span>
                  : (
                    <div className="res-block grow">
                      <span className="res-label">{validation.errorCount} error(s), {validation.warningCount} warning(s)</span>
                      {validation.diagnostics.map((d, i) => (
                        <div key={i} className={`diag ${d.severity}`}>
                          <span className="diag-sev">{d.severity}</span>
                          <span className="diag-msg"><code>{d.code}</code> {d.message}</span>
                        </div>
                      ))}
                    </div>
                  )
              ) : <p className="tp-sub">Save the rule to validate it against the runtime.</p>
            )}
          </div>
        </div>
      )}

      <footer className="status">{status}</footer>
    </div>
  );
}
