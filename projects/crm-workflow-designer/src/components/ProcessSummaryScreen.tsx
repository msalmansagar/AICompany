import { useEffect, useState } from 'react';
import { buildProcessSummary } from '@/services/processSummary';
import type { ProcessSummary } from '@/services/processSummary';
import type { WorkflowDataService } from '@/services/WorkflowDataService';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { parseDesignerState } from '@/services/designerState';
import { logError } from '@/services/logError';
import { ToolbarButton } from './common/ToolbarButton';
import { AssignIcon, assignTypeFromLabel } from '@/nodes/assignIcons';

/**
 * The process in words: totals, then every step with its assignment, task,
 * decisions, routes and conditions.
 *
 * Loads for itself rather than reading a canvas's state, so it is the same
 * page whether you arrive from the viewer or the editor — and so it always
 * reflects what is actually stored, not an unsaved draft.
 */
export function ProcessSummaryScreen({
  processId,
  service,
  adapter,
  onBack,
}: {
  processId: string;
  service: WorkflowDataService;
  adapter: ICrmAdapter;
  onBack: () => void;
}) {
  const [summary, setSummary] = useState<ProcessSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [process, steps, stateJson] = await Promise.all([
          service.getProcessById(processId),
          service.getStepsByProcess(processId),
          adapter.loadDesignerState(processId).catch(() => null),
        ]);
        const outcomes = await service.getOutcomesByStepIds(steps.map((s) => s.id));
        const conditionalIds = outcomes.filter((o) => o.applyFilter).map((o) => o.id);
        const routes = conditionalIds.length > 0 ? await service.getRoutesByOutcomeIds(conditionalIds) : [];
        if (cancelled) return;
        setSummary(
          buildProcessSummary(
            { ...process, workflowState: parseDesignerState(stateJson)?.workflowState ?? 'draft' },
            steps,
            outcomes,
            routes
          )
        );
      } catch (err) {
        if (cancelled) return;
        logError('summary:load', err);
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [processId, service, adapter]);

  return (
    <div style={shell}>
      <div className="cmdbar" role="toolbar" aria-label="Process summary">
        <ToolbarButton icon="edit" label="Back to the canvas" iconOnly onClick={onBack} />
        <span className="cmd-sep" />
        <ToolbarButton icon="pdf" label="Print / save as PDF" onClick={() => window.print()} />
        <span className="cmd-spacer" />
        {summary && (
          <>
            <span className={summary.workflowState === 'published' ? 'pill published' : 'pill draft'}>
              {summary.workflowState === 'published' ? 'Published' : 'Draft'}
            </span>
            <span style={titleStyle}>{summary.name}</span>
          </>
        )}
      </div>

      <div style={body}>
        {error && <p className="hint-inline" style={{ color: 'var(--error)' }}>{error}</p>}
        {!summary && !error && <p className="hint-inline">Loading the summary…</p>}

        {summary && (
          <>
            <section style={card}>
              <h2 style={h2}>Process</h2>
              <div style={grid}>
                <Fact label="Task entity" value={summary.taskEntity} />
                <Fact label="Parent entity" value={summary.parentEntity} />
                <Fact label="Regarding field" value={summary.regardingField} />
              </div>
              <div style={statRow}>
                <Stat label="Steps" value={summary.totals.steps} />
                <Stat label="Decisions" value={summary.totals.decisions} />
                <Stat label="Conditional" value={summary.totals.conditionalDecisions} />
                <Stat label="Routes" value={summary.totals.routes} />
                <Stat label="Return paths" value={summary.totals.returnPaths} />
                <Stat label="Endings" value={summary.totals.endings} />
                <Stat
                  label="Unassigned steps"
                  value={summary.totals.unassignedSteps}
                  tone={summary.totals.unassignedSteps > 0 ? 'warning' : 'default'}
                />
              </div>
            </section>

            {summary.steps.map((step) => (
              <section key={step.id} style={card}>
                <div style={stepHead}>
                  <span style={seqChip}>{step.sequenceNo}</span>
                  <h3 style={h3}>{step.name}</h3>
                  <span style={assignChip} title={step.assignMode}>
                    <AssignIcon type={assignTypeFromLabel(step.assignMode)} />
                    {step.assignMode}
                  </span>
                  <span style={assigneeText}>{step.assignee}</span>
                </div>

                <div style={grid}>
                  <Fact label="Task subject" value={step.taskSubject} />
                  <Fact label="Task entity" value={step.taskEntity} />
                  {step.concurrency && <Fact label="Concurrency" value={step.concurrency} />}
                </div>

                {step.decisions.length === 0 ? (
                  <p className="hint-inline">No decisions — nothing leads out of this step.</p>
                ) : (
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Decision</th>
                        <th style={th}>Kind</th>
                        <th style={th}>Goes to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {step.decisions.map((decision) => (
                        <>
                          <tr key={decision.name}>
                            <td style={td}>{decision.name}</td>
                            <td style={td}>
                              {decision.isConditional && <span className="pill warning">Conditional</span>}
                              {decision.isReturn && <span className="pill info">Return</span>}
                              {decision.isTerminal && <span className="pill error">Ends process</span>}
                              {!decision.isConditional && !decision.isReturn && !decision.isTerminal && (
                                <span className="hint-inline">Transition</span>
                              )}
                            </td>
                            <td style={td}>{decision.target}</td>
                          </tr>
                          {decision.routes.map((route) => (
                            <tr key={`${decision.name}-${route.name}`}>
                              <td style={{ ...td, paddingLeft: 26, color: 'var(--text-secondary)' }}>
                                ↳ {route.name}
                                {route.isDefault && <span className="pill success" style={{ marginLeft: 6 }}>Fallback</span>}
                              </td>
                              <td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{route.condition}</td>
                              <td style={td}>{route.target}</td>
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={factLabel}>{label}</div>
      <div style={factValue}>{value}</div>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'warning' }) {
  return (
    <div style={stat}>
      <div style={{ ...statValue, color: tone === 'warning' ? 'var(--warning)' : 'var(--text)' }}>{value}</div>
      <div style={factLabel}>{label}</div>
    </div>
  );
}

const shell: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' };
const body: React.CSSProperties = { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 };
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px' };
const h2: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: '0 0 10px', color: 'var(--text)' };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 600, margin: 0, color: 'var(--text)', flex: 1 };
const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 10 };
const statRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 18, paddingTop: 6, borderTop: '1px solid var(--border)' };
const stat: React.CSSProperties = { minWidth: 84 };
const statValue: React.CSSProperties = { fontSize: 20, fontWeight: 700, lineHeight: 1.1 };
const factLabel: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'var(--text-disabled)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const factValue: React.CSSProperties = { fontSize: 12, color: 'var(--text)', marginTop: 2 };
const stepHead: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 };
const seqChip: React.CSSProperties = { background: 'var(--primary)', color: 'var(--text-on-primary)', borderRadius: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px' };
const assignChip: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '2px 7px' };
const assigneeText: React.CSSProperties = { fontSize: 12, color: 'var(--text)' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--border-strong)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-disabled)' };
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text)', verticalAlign: 'top' };
const titleStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text)' };
