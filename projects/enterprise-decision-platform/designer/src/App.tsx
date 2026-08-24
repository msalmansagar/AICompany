import { useEffect, useMemo, useRef, useState } from 'react';
import { DecisionGraph, JdmConfigProvider, type DecisionGraphType } from '@gorules/jdm-editor';
import { toPcrm, translate } from './translator/toPcrm';
import {
  saveRule, loadLatestVersion, getVersionState, validateRule, setEffectiveWindow, type ValidationResult,
} from './dataverse/client';
import { evaluate, type EvaluateResult } from './runtime/testClient';
import { performAction, type GovernanceAction } from './governance/governanceClient';
import { searchEntities, type EntityMeta } from './metadata/metadataService';
import { EntityCombobox } from './metadata/EntityCombobox';
import { MetadataExplorer } from './metadata/MetadataExplorer';
import { DecisionTableEditor } from './table/DecisionTableEditor';
import { emptyTable, tableToPcrm, type TableModel } from './table/tableModel';
import { ConditionBuilder } from './conditions/ConditionBuilder';
import { emptyConditions, conditionsToPcrm, type ConditionModel } from './conditions/conditionModel';
import { installGoRulesDocRedirect, type DocGuide } from './gorules/docRedirect';
import { buildEntitySchema, withEntitySchema } from './gorules/entitySchema';
import { DocsSidePane } from './gorules/DocsSidePane';
import { ExecutionLogViewer } from './logs/ExecutionLogViewer';
import { AnalyticsDashboard } from './analytics/AnalyticsDashboard';
import { DependencyView } from './rulesets/DependencyView';
import { RulesList } from './rules/RulesList';
import { RuleSetsList } from './rulesets/RuleSetsList';
import { RuleSetEditor } from './rulesets/RuleSetEditor';
import { ScenariosPanel } from './scenarios/ScenariosPanel';
import { VersionCompare } from './rules/VersionCompare';

const EMPTY: DecisionGraphType = { nodes: [], edges: [] };
const DEFAULT_ENTITY = ''; // new rules start with no table chosen — the author picks one
type View = 'list' | 'create' | 'editor' | 'logs' | 'rulesets' | 'ruleset-editor' | 'analytics' | 'dependencies';
type Method = 'table' | 'canvas' | 'conditions' | 'template' | 'ai';
type AuthorMode = 'canvas' | 'table' | 'conditions';

// Effective dates are stored/compared in UTC. The datetime-local picker shows the UTC wall-clock
// (labelled "UTC" in the UI) so there's no timezone ambiguity in what gets saved.
function isoToInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function inputToIso(input: string): string | null {
  return input ? `${input}:00Z` : null;
}

export function App() {
  const [view, setView] = useState<View>('list');
  const [navOpen, setNavOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth > 900 : true));

  const [graph, setGraph] = useState<DecisionGraphType>(EMPTY);
  const [ruleName, setRuleName] = useState('Untitled Rule');
  const [targetEntity, setTargetEntity] = useState(DEFAULT_ENTITY);
  const [status, setStatus] = useState('Ready.');
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<Method>('table');
  const [editingEntity, setEditingEntity] = useState(false);
  const [pendingEntity, setPendingEntity] = useState<string | null>(null); // entity change awaiting confirm (clears table columns)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('edp-theme') as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });

  const [ruleId, setRuleId] = useState<string | null>(null);
  const [versionId, setVersionId] = useState<string | null>(null);
  const [versionNumber, setVersionNumber] = useState<number | null>(null);
  const [lifecycle, setLifecycle] = useState<string>('');
  const [effFrom, setEffFrom] = useState<string>(''); // datetime-local (UTC wall-clock), '' = open
  const [effTo, setEffTo] = useState<string>('');
  const [savedLabel, setSavedLabel] = useState<string>('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  const [entities, setEntities] = useState<EntityMeta[]>([]);
  const [entitiesLoading, setEntitiesLoading] = useState(false);
  const [entityLabel, setEntityLabel] = useState('');

  const [rulesetId, setRulesetId] = useState<string | null>(null);

  const [showMetadata, setShowMetadata] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [authorMode, setAuthorMode] = useState<AuthorMode>('table');
  const [table, setTable] = useState<TableModel>(emptyTable());
  const [conditions, setConditions] = useState<ConditionModel>(emptyConditions());

  const [showTest, setShowTest] = useState(false);
  const [testInputs, setTestInputs] = useState('{}');
  const [testResult, setTestResult] = useState<EvaluateResult | null>(null);
  const [testError, setTestError] = useState('');
  const [drawerTab, setDrawerTab] = useState<'test' | 'validation' | 'scenarios'>('test');
  const [drawerOpen, setDrawerOpen] = useState(true);

  // Tables are fetched on demand — only when a user starts creating or opens a rule,
  // never on page load. Cached after the first load.
  async function loadEntities() {
    if (entities.length || entitiesLoading) return;
    setEntitiesLoading(true);
    try { setEntities(await searchEntities('')); }
    catch (e: any) { setStatus(`Could not load tables: ${e.message}`); }
    finally { setEntitiesLoading(false); }
  }

  useEffect(() => {
    if (view !== 'editor' && view !== 'create') return;
    setEntityLabel(entities.find((e) => e.logicalName === targetEntity)?.displayName ?? '');
  }, [targetEntity, entities, view]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('edp-theme', theme); } catch { /* ignore */ }
  }, [theme]);

  // The GoRules canvas hardcodes its node "Documentation" links to gorules.io; while that
  // canvas is mounted, open our in-CRM guide pane for the recognised node links instead.
  const [docsGuide, setDocsGuide] = useState<DocGuide | null>(null);
  useEffect(() => {
    if (authorMode !== 'canvas') return;
    return installGoRulesDocRedirect(setDocsGuide);
  }, [authorMode]);

  // Canvas ↔ Dataverse bridge: pin the target entity's field schema on the Input
  // node so the JDM table and expressions autocomplete real fields with real types.
  useEffect(() => {
    if (view !== 'editor' || authorMode !== 'canvas' || !targetEntity) return;
    let cancelled = false;
    buildEntitySchema(targetEntity)
      .then((schema) => { if (!cancelled) setGraph((g) => withEntitySchema(g, schema)); })
      .catch(() => { /* the schema is a convenience — the canvas still works without it */ });
    return () => { cancelled = true; };
  }, [view, authorMode, targetEntity]);

  const conditionHasClauses = (g: ConditionModel['when']): boolean => g.clauses.some((c) => c.field) || g.groups.some(conditionHasClauses);
  const hasContent = authorMode === 'table' ? table.inputs.length > 0
    : authorMode === 'conditions' ? conditionHasClauses(conditions.when)
      : graph.nodes.length > 0;
  const published = lifecycle === 'Published'; // a published version is locked — unpublish to edit

  // Lock the editing surface when the loaded version is Published. `inert` blocks all interaction
  // and focus while keeping the content visible and scrollable (unlike pointer-events:none).
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (published) el.setAttribute('inert', ''); else el.removeAttribute('inert');
  }, [published, authorMode, view]);

  function currentPcrm() {
    const meta = { name: ruleName, targetEntity };
    if (authorMode === 'table') return tableToPcrm(table, meta);
    if (authorMode === 'conditions') return conditionsToPcrm(conditions, meta);
    return toPcrm(graph, meta);
  }
  const currentSource = () => (authorMode === 'table' ? table : authorMode === 'conditions' ? conditions : graph);

  function startCreate() {
    setGraph(EMPTY); setTable(emptyTable()); setConditions(emptyConditions());
    setRuleName('Untitled Rule'); setTargetEntity(DEFAULT_ENTITY); setMethod('table');
    setRuleId(null); setVersionId(null); setVersionNumber(null); setLifecycle(''); setSavedLabel(''); setValidation(null);
    setEffFrom(''); setEffTo('');
    setShowTest(false); setTestResult(null); setTestError(''); setEditingEntity(false);
    setStatus('Set up your new rule.'); setView('create');
    void loadEntities();
  }

  function createRule() {
    if (method === 'template') { setStatus('Copy any existing rule from the Rules view to start from it.'); setView('list'); return; }
    setAuthorMode(method === 'canvas' ? 'canvas' : method === 'conditions' ? 'conditions' : 'table');
    if (method === 'ai') setStatus('Plain-English drafting arrives with the AI Assistant (Phase 6) — starting you on a blank decision table.');
    else setStatus(`Building “${ruleName}” on ${entityLabel || targetEntity}.`);
    setView('editor');
  }

  function openRuleSets() { setRulesetId(null); setView('rulesets'); }
  function newRuleSet() { setRulesetId(null); setView('ruleset-editor'); }
  function openRuleSet(id: string) { setRulesetId(id); setView('ruleset-editor'); }

  async function openRule(ruleId: string) {
    setBusy(true); setStatus('Loading latest version…'); setView('editor'); setEditingEntity(false);
    void loadEntities();
    setRuleId(ruleId);
    try {
      const v = await loadLatestVersion(ruleId);
      const src: any = v?.jdmGraph;
      if (src?.editor === 'edp-table') { setAuthorMode('table'); setTable(src as TableModel); }
      else if (src?.editor === 'edp-conditions') { setAuthorMode('conditions'); setConditions(src as ConditionModel); }
      else { setAuthorMode('canvas'); setGraph(src ?? EMPTY); }
      setRuleName(v?.ruleName ?? 'Rule');
      setTargetEntity(v?.targetEntity || DEFAULT_ENTITY);
      setVersionId(v?.versionId ?? null); setVersionNumber(v?.versionNumber ?? null);
      setLifecycle(v?.lifecycleState ?? ''); setSavedLabel('Loaded from Dataverse'); setValidation(null);
      setEffFrom(isoToInput(v?.effectiveFrom ?? null)); setEffTo(isoToInput(v?.effectiveTo ?? null));
      setStatus(`Loaded ${v?.ruleName ?? ''} (version ${v?.versionNumber ?? '?'} · ${v?.lifecycleState ?? ''}).`);
    } catch (e: any) { setStatus(`Load failed: ${e.message}`); } finally { setBusy(false); }
  }

  async function onSave() {
    setBusy(true); setStatus('Translating + saving to Dataverse…');
    try {
      const pcrm = currentPcrm();
      const res = await saveRule({ ruleId, name: ruleName, jdmGraph: currentSource(), pcrm });
      setRuleId(res.ruleId); setVersionId(res.versionId); setVersionNumber(res.versionNumber); setLifecycle(res.lifecycle);
      setSavedLabel(res.updatedInPlace ? 'Draft updated just now' : 'Saved just now');
      if (!res.updatedInPlace) { setEffFrom(''); setEffTo(''); } // a new version starts with no effective window
      setStatus(res.updatedInPlace
        ? `Saved ✓  draft version ${res.versionNumber} updated`
        : `Saved ✓  version ${res.versionNumber} created`);
      void runValidation(pcrm);
    } catch (e: any) { setStatus(`Save failed: ${e.message}`); } finally { setBusy(false); }
  }

  async function runValidation(pcrm?: unknown) {
    try { setValidation(await validateRule(pcrm ?? currentPcrm())); }
    catch (e: any) { setStatus(`Validation unavailable: ${e.message}`); }
  }

  async function runGov(action: GovernanceAction) {
    if (!versionId) { setStatus('Save a rule first — governance acts on a saved version.'); return; }
    setBusy(true); setStatus(`${action}…`);
    try {
      const r = await performAction(versionId, action);
      setLifecycle(r.newState || (await getVersionState(versionId)));
      setStatus(`${action} ✓ — ${r.message}`);
    } catch (e: any) { setStatus(`${action} failed: ${e.message}`); } finally { setBusy(false); }
  }

  async function saveEffective() {
    if (!versionId) { setStatus('Save a rule first — effective dates apply to a saved version.'); return; }
    if (effFrom && effTo && inputToIso(effTo)! <= inputToIso(effFrom)!) { setStatus('Effective “to” must be after “from”.'); return; }
    setBusy(true); setStatus('Saving effective dates…');
    try {
      await setEffectiveWindow(versionId, inputToIso(effFrom), inputToIso(effTo));
      setStatus('Effective dates saved.');
    } catch (e: any) { setStatus(`Could not save effective dates: ${e.message}`); } finally { setBusy(false); }
  }

  // Changing the table entity invalidates the decision-table condition columns (they bind to the
  // old entity's fields), so confirm first when there are columns, then clear them on apply.
  function requestEntityChange(next: string) {
    setEditingEntity(false);
    if (!next || next === targetEntity) return;
    if (authorMode === 'table' && table.inputs.length > 0) { setPendingEntity(next); return; }
    applyEntityChange(next);
  }
  function applyEntityChange(next: string) {
    setTargetEntity(next);
    if (authorMode === 'table') setTable((t) => ({ ...t, inputs: [], rows: t.rows.map((r) => ({ ...r, cells: [] })) }));
    setPendingEntity(null);
  }

  function openTest() {
    const pcrm = currentPcrm() as any;
    const seed: Record<string, unknown> = {};
    for (const i of pcrm.inputs ?? []) seed[i.name] = '';
    setTestInputs(JSON.stringify(seed, null, 2));
    setTestResult(null); setTestError(''); setShowTest(true);
  }

  async function runTest() {
    setTestError(''); setTestResult(null);
    let inputs: Record<string, unknown>;
    try { inputs = JSON.parse(testInputs || '{}'); }
    catch (e: any) { setTestError(`Inputs JSON invalid: ${e.message}`); return; }
    try { setTestResult(await evaluate(currentPcrm(), inputs)); }
    catch (e: any) { setTestError(e.message); }
    setDrawerTab('test'); setDrawerOpen(true);
  }

  // What would be lost or broken if the canvas saved right now — shown before any save.
  const translationWarnings = useMemo(
    () => (authorMode === 'canvas' ? translate(graph, { name: ruleName, targetEntity }).warnings : []),
    [authorMode, graph, ruleName, targetEntity]
  );

  const drawerHasContent = !!(testResult || testError || validation) || translationWarnings.length > 0 || drawerTab === 'scenarios';
  function openScenarios() { setDrawerTab('scenarios'); setDrawerOpen(true); }
  const verdict = (r: EvaluateResult) => (!r.success ? '✗ Did not execute' : r.matched ? '✓ Matched' : '— No branch matched');

  // Whether THIS version's window is live now (independent of other versions / lifecycle).
  const effState = (() => {
    const from = inputToIso(effFrom), to = inputToIso(effTo);
    const now = new Date().toISOString();
    if (from && now < from) return { cls: 'pending', text: `Starts ${effFrom.replace('T', ' ')} UTC` };
    if (to && now >= to) return { cls: 'expired', text: `Expired ${effTo.replace('T', ' ')} UTC` };
    if (!from && !to) return { cls: 'ok', text: 'Always effective' };
    return { cls: 'ok', text: 'Effective now' };
  })();

  const METHODS: { id: Method; title: string; sub: string; rec?: boolean }[] = [
    { id: 'table', title: 'Decision table', sub: 'Pick fields and outcomes in a grid — no code. Best for most rules.', rec: true },
    { id: 'conditions', title: 'Condition builder', sub: 'Combine conditions with AND / OR / NOT groups for one outcome.' },
    { id: 'canvas', title: 'Advanced (canvas)', sub: 'Combine expressions, functions, and switches for multi-step logic.' },
    { id: 'template', title: 'From a template', sub: 'Start from an existing governed rule or template.' },
    { id: 'ai', title: 'Describe in plain English', sub: 'Say what you want; the AI drafts it for review. (Coming soon)' },
  ];

  return (
    <div className="mda">
      <div className="mda-topbar">
        <button className="hamburger" onClick={() => setNavOpen((o) => !o)} aria-label="Toggle navigation" aria-expanded={navOpen} title="Toggle menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
        </button>
        <div className="mda-app">
          <span className="waffle" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="5" r="2" /><circle cx="12" cy="5" r="2" /><circle cx="19" cy="5" r="2" /><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="12" cy="19" r="2" /><circle cx="19" cy="19" r="2" /></svg>
          </span>
          Rule Engine
        </div>
        <span className="spacer" />
        <button className="theme-btn" onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} title="Toggle light / dark theme" aria-label="Toggle theme">
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
          )}
        </button>
        <span className="mda-env"><span className="dot" />org5869857f</span>
      </div>

      <div className={`mda-main${navOpen ? '' : ' nav-collapsed'}`}>
        {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
        <nav className="mda-nav" aria-label="Areas">
          <div className="nav-group">Business Rules Engine</div>
          <button className={`nav-item ${['list', 'create', 'editor'].includes(view) ? 'active' : ''}`} onClick={() => setView('list')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11" /></svg>
            Rules
          </button>
          <button className={`nav-item ${['rulesets', 'ruleset-editor'].includes(view) ? 'active' : ''}`} onClick={openRuleSets}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
            Rule sets
          </button>
          <button className={`nav-item ${view === 'logs' ? 'active' : ''}`} onClick={() => setView('logs')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>
            Execution logs
          </button>
          <button className={`nav-item ${view === 'analytics' ? 'active' : ''}`} onClick={() => setView('analytics')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-6M22 20H2" /></svg>
            Analytics
          </button>
          <button className={`nav-item ${view === 'dependencies' ? 'active' : ''}`} onClick={() => setView('dependencies')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="6" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="12" r="2.5" /><path d="M7.5 6.5 16.5 11M7.5 17.5 16.5 13" /></svg>
            Dependencies
          </button>
        </nav>

        <div className="mda-content">
          {view === 'list' && <RulesList onNew={startCreate} onOpen={openRule} entities={entities} />}
          {view === 'rulesets' && <RuleSetsList onNew={newRuleSet} onOpen={openRuleSet} />}
          {view === 'ruleset-editor' && <RuleSetEditor setId={rulesetId} onBack={openRuleSets} onSaved={setRulesetId} />}
          {view === 'logs' && <ExecutionLogViewer full onClose={() => setView('list')} />}
          {view === 'analytics' && <AnalyticsDashboard onClose={() => setView('list')} />}
          {view === 'dependencies' && <DependencyView onClose={() => setView('list')} />}

          {view === 'create' && (
            <div className="create-view">
              <div className="create-card">
                <div className="create-head">
                  <button className="tb ghost" onClick={() => setView('list')}>← Rules</button>
                  <h1>New rule</h1>
                </div>

                <label className="fld">
                  <span className="fld-lbl">Rule name</span>
                  <input className="fld-input" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="e.g. Loan Approval" />
                </label>

                <div className="fld">
                  <span className="fld-lbl">Which table does this rule run on?</span>
                  <EntityCombobox entities={entities} loading={entitiesLoading} value={targetEntity} onChange={setTargetEntity} />
                  <span className="fld-hint">{entityLabel ? <>Selected: <strong>{entityLabel}</strong> <code>{targetEntity}</code></> : <>Search by the table's display name.</>}</span>
                </div>

                <div className="fld">
                  <span className="fld-lbl">How do you want to build it?</span>
                  <div className="method-grid">
                    {METHODS.map((m) => (
                      <button key={m.id} className={`method ${method === m.id ? 'on' : ''}`} onClick={() => setMethod(m.id)}>
                        <span className="method-top"><b>{m.title}</b>{m.rec && <span className="rec">Recommended</span>}</span>
                        <span className="method-sub">{m.sub}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="create-actions">
                  <button className="btn" onClick={() => setView('list')}>Cancel</button>
                  <button className="btn primary" disabled={!ruleName.trim() || !targetEntity.trim()} onClick={createRule}>Create rule</button>
                </div>
              </div>
            </div>
          )}

          {view === 'editor' && (
            <>
              <header className="topbar">
                <button className="tb ghost back" disabled={busy} onClick={() => setView('list')} title="Back to all rules">← Rules</button>
                <div className="rule-id">
                  <input className="rule-name" value={ruleName} onChange={(e) => setRuleName(e.target.value)} disabled={published} aria-label="Rule name" title={published ? 'Published — unpublish to rename' : 'Rename this rule'} />
                  {editingEntity && !published ? (
                    <div className="entity-cbx">
                      <span className="entity-lbl">On</span>
                      <EntityCombobox entities={entities} loading={entitiesLoading} value={targetEntity} autoFocus
                        onChange={requestEntityChange}
                        onClose={() => setEditingEntity(false)} />
                    </div>
                  ) : (
                    <button className="entity-pill" disabled={published} onClick={() => setEditingEntity(true)}
                      title={published ? 'Published — unpublish to change the table' : `Runs on ${targetEntity} — click to change`}>
                      <span className="entity-lbl">On</span><b>{entityLabel || targetEntity}</b>
                      {!published && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>}
                    </button>
                  )}
                </div>

                <div className="status-cluster">
                  {versionId ? (
                    <>
                      <span className={`badge ${(lifecycle || 'Draft').toLowerCase().replace(/\s+/g, '-')}`}><span className="dot" />{lifecycle || 'Draft'}</span>
                      {versionNumber != null && <span className="ver">v{versionNumber}</span>}
                    </>
                  ) : (
                    <span className="badge new"><span className="dot" />Not saved</span>
                  )}
                  {validation && (
                    <button className={`badge valid ${validation.isValid ? 'ok' : 'bad'}`} onClick={() => void runValidation()} title="Re-check against the runtime validator">
                      {validation.isValid ? '✓ Valid' : `⚠ ${validation.errorCount} issue${validation.errorCount === 1 ? '' : 's'}`}
                    </button>
                  )}
                  {savedLabel && <span className="saved">{savedLabel}</span>}
                </div>

                <span className="spacer" />

                <div className="top-actions">
                  <div className="mode-seg" role="tablist" aria-label="Authoring surface">
                    <button className={authorMode === 'table' ? 'on' : ''} onClick={() => setAuthorMode('table')} title="Business-friendly grid — pick CRM fields, no code (recommended)">Decision table</button>
                    <button className={authorMode === 'conditions' ? 'on' : ''} onClick={() => setAuthorMode('conditions')} title="Boolean expression — AND / OR / NOT groups with one outcome">Conditions</button>
                    <button className={authorMode === 'canvas' ? 'on' : ''} onClick={() => setAuthorMode('canvas')} title="GoRules canvas — expressions, functions, and switch nodes">Advanced</button>
                  </div>
                  <button className="tb ghost" disabled={busy} onClick={() => setShowMetadata((v) => !v)}>Fields</button>
                  <button className="tb test" disabled={busy || !hasContent} onClick={openTest} title={hasContent ? 'Test with sample inputs' : 'Add a condition first'}>▶ Test</button>
                  <button className="tb ghost" disabled={busy || !ruleId} onClick={openScenarios} title={ruleId ? 'Saved test scenarios + regression gate' : 'Save the rule first'}>⚑ Scenarios</button>
                  <button className="tb ghost" disabled={busy || !ruleId} onClick={() => setShowHistory(true)} title={ruleId ? 'Compare versions of this rule' : 'Save the rule first'}>⧉ History</button>
                  <button className="tb primary" disabled={busy || !hasContent || published} onClick={onSave} title={published ? 'Published version is read-only — unpublish to edit' : hasContent ? 'Save to Dataverse' : 'Add a condition first'}>Save</button>
                </div>
              </header>

              {versionId && (
                <div className="govbar">
                  <span className="gov-label">Lifecycle</span>
                  <span className="gov-state">{lifecycle || '—'}</span>
                  <span className="spacer" />
                  <button disabled={busy} onClick={() => runGov('Submit')}>Submit for review</button>
                  <button disabled={busy} onClick={() => runGov('Approve')}>Approve</button>
                  <button disabled={busy} className="gov-reject" onClick={() => runGov('Reject')}>Reject</button>
                  {published
                    ? <button disabled={busy} className="gov-unpublish" onClick={() => runGov('Unpublish')} title="Take this version out of production and back to Draft to edit">Unpublish</button>
                    : <button disabled={busy} className="gov-publish" onClick={() => runGov('Publish')}>Publish</button>}
                </div>
              )}

              {versionId && (
                <div className="effbar">
                  <span className="gov-label">Effective</span>
                  <label className="eff-field">from<input type="datetime-local" value={effFrom} onChange={(e) => setEffFrom(e.target.value)} /></label>
                  <span className="eff-arrow">→</span>
                  <label className="eff-field">to<input type="datetime-local" value={effTo} onChange={(e) => setEffTo(e.target.value)} /></label>
                  <span className="eff-utc">UTC</span>
                  <span className={`eff-badge ${effState.cls}`}>{effState.text}</span>
                  <span className="spacer" />
                  <button disabled={busy} onClick={saveEffective}>Save dates</button>
                </div>
              )}

              <div className="body">
                {showMetadata && <MetadataExplorer defaultEntity={targetEntity} onClose={() => setShowMetadata(false)} />}
                {showHistory && ruleId && <VersionCompare ruleId={ruleId} ruleName={ruleName} onClose={() => setShowHistory(false)} />}
                <div className="editor-wrap">
                  {published && (
                    <div className="lock-banner">🔒 This version is <b>Published</b> — read-only. Unpublish it to make changes.</div>
                  )}
                  {pendingEntity && (
                    <div className="confirm-bar">
                      <span>Change the table to <strong>{entities.find((e) => e.logicalName === pendingEntity)?.displayName ?? pendingEntity}</strong>? This <strong>removes all condition columns</strong> from the decision table.</span>
                      <span className="spacer" />
                      <button className="btn" onClick={() => setPendingEntity(null)}>Cancel</button>
                      <button className="btn primary" onClick={() => applyEntityChange(pendingEntity)}>Change table</button>
                    </div>
                  )}
                  <div className={`editor${published ? ' locked' : ''}`} ref={editorRef}>
                    {authorMode === 'table' ? (
                      <DecisionTableEditor entity={targetEntity} value={table} onChange={setTable} />
                    ) : authorMode === 'conditions' ? (
                      <ConditionBuilder entity={targetEntity} value={conditions} onChange={setConditions} />
                    ) : (
                      <JdmConfigProvider><DecisionGraph value={graph} onChange={setGraph} /></JdmConfigProvider>
                    )}
                  </div>
                </div>

                {showTest && (
                  <aside className="testpanel">
                    <div className="tp-head">
                      <strong>Test rule</strong><span className="tp-sub">via C# runtime</span>
                      <span className="spacer" /><button className="tp-close" onClick={() => setShowTest(false)}>✕</button>
                    </div>
                    <label>Input values (JSON)</label>
                    <textarea value={testInputs} onChange={(e) => setTestInputs(e.target.value)} spellCheck={false} />
                    <button className="tb test" onClick={runTest}>▶ Run test</button>
                    {testError && <p className="tp-error">{testError}</p>}
                    <p className="tp-sub">Results appear in the panel below.</p>
                  </aside>
                )}
              </div>

              {drawerHasContent && drawerOpen && (
                <div className="drawer">
                  <div className="drawer-head">
                    <button className={`dt-tab ${drawerTab === 'test' ? 'on' : ''}`} onClick={() => setDrawerTab('test')}>▶ Test result</button>
                    <button className={`dt-tab ${drawerTab === 'validation' ? 'on' : ''}`} onClick={() => setDrawerTab('validation')}>
                      Validation{validation && <span className={`b ${validation.isValid ? 'okb' : 'warnb'}`}>{validation.isValid ? '0' : validation.errorCount}</span>}
                      {translationWarnings.length > 0 && <span className="b warnb">⚠ {translationWarnings.length}</span>}
                    </button>
                    <button className={`dt-tab ${drawerTab === 'scenarios' ? 'on' : ''}`} onClick={() => setDrawerTab('scenarios')}>⚑ Scenarios</button>
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
                            <span className={`outcome ${testResult.success && testResult.matched ? 'ok' : testResult.success ? 'neutral' : 'bad'}`}>{verdict(testResult)} · {testResult.elapsedMs} ms</span>
                          </div>
                          {Object.keys(testResult.outputs || {}).length > 0 && (
                            <div className="res-block">
                              <span className="res-label">Outputs</span>
                              {Object.entries(testResult.outputs).map(([k, v]) => <div key={k} className="kv"><span className="k">{k}</span><span className="v">{String(v)}</span></div>)}
                            </div>
                          )}
                          {(testResult.reasonCodes?.length ?? 0) > 0 && (
                            <div className="res-block">
                              <span className="res-label">Reason codes</span>
                              <div className="reasons">{testResult.reasonCodes.map((c) => <span key={c} className="reason-chip">{c}</span>)}</div>
                            </div>
                          )}
                          {testResult.trace?.length > 0 && (
                            <div className="res-block grow">
                              <span className="res-label">Why — execution trace</span>
                              <div className="trace">
                                {testResult.trace.map((s, i) => (
                                  <div key={i} className={`step ${s.result === true ? 'ok' : s.result === false ? 'bad' : ''} ${s.kind === 'branch' ? 'final' : ''}`}>
                                    <span className="tk">{s.kind}</span><span className="td">{s.description}</span>
                                    {s.result != null && <span className="tr">{s.result ? '✓' : '✗'}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : <p className="tp-sub">Run a test to see the decision and its trace here.</p>
                    )}
                    {drawerTab === 'validation' && translationWarnings.length > 0 && (
                      <div className="res-block">
                        <span className="res-label">Canvas translation warnings</span>
                        {translationWarnings.map((w, i) => (
                          <div key={i} className="diag warning"><span className="diag-sev">warning</span><span className="diag-msg">{w}</span></div>
                        ))}
                      </div>
                    )}
                    {drawerTab === 'validation' && (
                      validation ? (
                        validation.isValid && validation.diagnostics.length === 0
                          ? <span className="outcome ok">✓ No issues found</span>
                          : (
                            <div className="res-block grow">
                              <span className="res-label">{validation.errorCount} error(s), {validation.warningCount} warning(s)</span>
                              {validation.diagnostics.map((d, i) => (
                                <div key={i} className={`diag ${d.severity}`}><span className="diag-sev">{d.severity}</span><span className="diag-msg"><code>{d.code}</code> {d.message}</span></div>
                              ))}
                            </div>
                          )
                      ) : <p className="tp-sub">Save the rule to validate it against the runtime.</p>
                    )}
                    {drawerTab === 'scenarios' && (
                      <ScenariosPanel
                        ruleId={ruleId} ruleName={ruleName} getPcrm={currentPcrm}
                        draftInputs={testInputs} draftOutputs={testResult?.outputs ?? null}
                      />
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {view !== 'ruleset-editor' && <footer className="status">{status}</footer>}
        </div>
      </div>

      {docsGuide && <DocsSidePane guide={docsGuide} onClose={() => setDocsGuide(null)} />}
    </div>
  );
}
