import { useState } from 'react';
import { WorkflowHooksSection } from './WorkflowHooksSection';
import { hasRealCondition } from '@/services/routeFilter';
import { OUTCOME_HOOKS, ROUTE_HOOKS, emptyWorkflowHooks } from '@/services/workflowHooks';
import type { ICrmAdapter } from '@/services/ICrmAdapter';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowRoute } from '@/types/WorkflowTypes';
import { confirm } from '@/components/ui/ConfirmDialog';

interface OutcomePropertiesPanelProps {
  outcomeId: string | null;
  adapter: ICrmAdapter;
}

export function OutcomePropertiesPanel({ outcomeId, adapter }: OutcomePropertiesPanelProps) {
  const {
    outcomes,
    routes,
    routeOrder,
    steps,
    stepOrder,
    setOutcome,
    addRoute,
    deleteRoute,
    deleteOutcome,
    selectNode,
    clearSelection,
  } = useWorkflowStore((s) => ({
    outcomes: s.outcomes,
    routes: s.routes,
    routeOrder: s.routeOrder,
    steps: s.steps,
    stepOrder: s.stepOrder,
    setOutcome: s.setOutcome,
    addRoute: s.addRoute,
    deleteRoute: s.deleteRoute,
    deleteOutcome: s.deleteOutcome,
    selectNode: s.selectNode,
    clearSelection: s.clearSelection,
  }));

  const [addingRoute, setAddingRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteTarget, setNewRouteTarget] = useState<string>('__end__');
  const [newRouteIsFallback, setNewRouteIsFallback] = useState(false);
  const [addRouteError, setAddRouteError] = useState<string | null>(null);
  /** Deleting a route removes a Dataverse record, so it goes through the same
   * confirmation the decision delete uses rather than a bespoke pattern. */
  const handleDeleteRoute = (route: WorkflowRoute) => {
    void confirm({
      title: 'Delete route',
      message: `Delete route "${route.name || '(unnamed)'}"? Its condition will be lost.`,
      tone: 'danger',
    }).then((confirmed) => { if (confirmed) deleteRoute(route.crmId); });
  };

  const rawId = outcomeId?.replace('outcome_', '') ?? null;
  const outcome = rawId ? outcomes[rawId] : null;

  if (!outcome) {
    return (
      <div className="panel">
        <div style={panelHeaderStyle}>Decision Properties</div>
        <div style={emptyStyle}>No decision selected</div>
      </div>
    );
  }

  const title = outcome.applyFilter ? 'Decision Properties' : 'Transition Properties';
  const targetStep = outcome.nextStepId ? steps[outcome.nextStepId] : null;

  const outcomeRoutes: WorkflowRoute[] = (routeOrder[outcome.crmId] ?? [])
    .map((id) => routes[id])
    .filter((r): r is WorkflowRoute => r !== undefined);

  const availableSteps = stepOrder
    .map((id) => steps[id])
    .filter((s) => s !== undefined);

  const handleAddRoute = () => {
    // A route persists as a qdb_outcomeworktasks record only if it targets a
    // real step — the save path skips routes with no next step, so block here
    // with a clear message rather than letting the route silently vanish.
    if (newRouteTarget === '__end__') {
      setAddRouteError('A route must lead to a step. Pick a target step — routes to "End" cannot be saved.');
      return;
    }
    const maxSeq = outcomeRoutes.reduce((m, r) => Math.max(m, r.sequenceNumber), 0);
    const routeId = `tmp_${crypto.randomUUID()}`;
    addRoute({
      crmId: routeId,
      name: newRouteName.trim(),
      subject: '',
      sequenceNumber: maxSeq + 1,
      filter: '',
      workflowHooks: emptyWorkflowHooks(ROUTE_HOOKS),
      outcomeId: outcome.crmId,
      nextStepId: newRouteTarget,
      isDefault: newRouteIsFallback,
    });
    selectNode(`route_edge_${routeId}`);
    setAddingRoute(false);
    setNewRouteName('');
    setNewRouteTarget('__end__');
    setNewRouteIsFallback(false);
    setAddRouteError(null);
  };

  const handleToggleConditional = () => {
    const nextApplyFilter = !outcome.applyFilter;
    setOutcome({ ...outcome, applyFilter: nextApplyFilter });
    // Turning conditional routing on: ensure a first Decision Filter (route)
    // record exists so the decision always has somewhere for its FetchXML —
    // mirrors the CRM form auto-creating one when Apply Filter is set.
    if (nextApplyFilter && outcomeRoutes.length === 0) {
      const routeId = `tmp_${crypto.randomUUID()}`;
      addRoute({
        crmId: routeId,
        name: '',
        subject: '',
        sequenceNumber: 1,
        filter: '',
        workflowHooks: emptyWorkflowHooks(ROUTE_HOOKS),
        outcomeId: outcome.crmId,
        nextStepId: outcome.nextStepId ?? null,
        isDefault: false,
      });
      selectNode(`route_edge_${routeId}`);
    }
  };

  const handleDelete = () => {
    void confirm({
      title: 'Delete decision',
      message: 'Delete this decision? All route conditions will also be deleted.',
      tone: 'danger',
    }).then((confirmed) => {
      if (!confirmed) return;
      deleteOutcome(outcome.crmId);
      clearSelection();
    });
  };

  return (
    <div className="panel">
      <div style={panelHeaderStyle}>{title}</div>
      <div style={panelBodyStyle}>

        <div style={fieldGroupStyle}>
          <label className="lbl">Name</label>
          <input
            type="text"
            value={outcome.name}
            onChange={(e) => setOutcome({ ...outcome, name: e.target.value })}
            className="fluent-input"
            placeholder="Decision name"
          />
        </div>

        <div style={fieldGroupStyle}>
          <label className="lbl">Concurrent branches</label>
          <button
            type="button"
            role="switch"
            aria-checked={outcome.checkParallelTasks}
            onClick={() => setOutcome({ ...outcome, checkParallelTasks: !outcome.checkParallelTasks })}
            style={{ ...toggleStyle, ...(outcome.checkParallelTasks ? toggleOnStyle : toggleOffStyle) }}
          >
            {outcome.checkParallelTasks
              ? '⧉ Wait — all branches must finish first'
              : 'Off — this step can finish while branches run'}
          </button>
          {!outcome.checkParallelTasks && (
            <button
              type="button"
              role="switch"
              aria-checked={outcome.updateParallelTaskRef}
              onClick={() => setOutcome({ ...outcome, updateParallelTaskRef: !outcome.updateParallelTaskRef })}
              style={{ ...toggleStyle, ...(outcome.updateParallelTaskRef ? toggleOnStyle : toggleOffStyle) }}
            >
              {outcome.updateParallelTaskRef
                ? '↪ Carry open branches to the next step'
                : 'Off — open branches stay where they are'}
            </button>
          )}
        </div>

        <div style={fieldGroupStyle}>
          <label className="lbl">Conditional Routing</label>
          <button
            type="button"
            role="switch"
            aria-checked={outcome.applyFilter}
            onClick={handleToggleConditional}
            style={{ ...toggleStyle, ...(outcome.applyFilter ? toggleOnStyle : toggleOffStyle) }}
          >
            {outcome.applyFilter ? '◈ Active — choose a route' : 'Off — direct transition'}
          </button>
        </div>

        {/* Where this decision leads. With conditional routing on, each route carries its
            own target and this one is not consulted, so showing it would be misleading. */}
        {!outcome.applyFilter && (
          <div style={fieldGroupStyle}>
            <label className="lbl">Next Step</label>
            <div style={targetChipStyle}>
              {targetStep ? `${targetStep.sequenceNo}. ${targetStep.name}` : '— End of workflow —'}
            </div>
          </div>
        )}

        {outcome.applyFilter && (
          <>
            <div style={dividerStyle} />
            <div className="panel-section">
              Routes
              <span style={countBadgeStyle}>{outcomeRoutes.length}</span>
            </div>

            {outcomeRoutes.map((route) => {
              const nextStep = route.nextStepId ? steps[route.nextStepId] : null;
              const isFallback = route.isDefault;
              return (
                <div key={route.crmId} style={buildRouteRowStyle(isFallback)}>
                  <button
                    type="button"
                    style={routeOpenStyle}
                    onClick={() => selectNode(`route_edge_${route.crmId}`)}
                    title="Open this route"
                  >
                    <span style={routeSeqStyle}>{route.sequenceNumber}</span>
                    <div style={routeInfoStyle}>
                      <span style={routeNameStyle}>{route.name || '(unnamed)'}</span>
                      <span style={routeCondStyle}>{describeRouteCondition(route)}</span>
                      <span style={routeNextStyle}>
                        → {nextStep ? `${nextStep.sequenceNo}. ${nextStep.name}` : 'End'}
                      </span>
                    </div>
                    <span style={routeArrowStyle}>›</span>
                  </button>
                  <button
                    type="button"
                    style={routeDeleteStyle()}
                    aria-label={`Delete route ${route.name || 'unnamed'}`}
                    title="Delete this route"
                    onClick={() => handleDeleteRoute(route)}
                  >
                    ✕
                  </button>
                </div>
              );
            })}

            {addingRoute ? (
              <div style={addFormStyle}>
                <input
                  type="text"
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  placeholder="Route name (optional)"
                  className="fluent-input"
                  autoFocus
                />
                <label className="lbl">Next Step</label>
                <select
                  value={newRouteTarget}
                  onChange={(e) => {
                    setNewRouteTarget(e.target.value);
                    if (e.target.value !== '__end__') setAddRouteError(null);
                  }}
                  className="fluent-select"
                >
                  <option value="__end__">— End —</option>
                  {availableSteps.map((s) => (
                    <option key={s!.crmId} value={s!.crmId}>
                      {s!.sequenceNo}. {s!.name}
                    </option>
                  ))}
                </select>
                {addRouteError && (
                  <span style={addRouteErrorStyle} role="alert">{addRouteError}</span>
                )}
                <label style={checkRowStyle}>
                  <input
                    type="checkbox"
                    checked={newRouteIsFallback}
                    onChange={(e) => setNewRouteIsFallback(e.target.checked)}
                  />
                  <span style={checkLabelStyle}>Fallback (no condition)</span>
                </label>
                <div style={addFormActionsStyle}>
                  <button type="button" style={addConfirmBtnStyle} onClick={handleAddRoute}>
                    Add Route
                  </button>
                  <button
                    type="button"
                    style={cancelBtnStyle}
                    onClick={() => { setAddingRoute(false); setAddRouteError(null); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                style={addRouteBtnStyle}
                onClick={() => { setAddingRoute(true); setAddRouteError(null); }}
              >
                + Add Route
              </button>
            )}
          </>
        )}

        {/* Workflow stays last: it is the least-used section and pushing the routing
            configuration below it buried the part people came here to change. */}
        <WorkflowHooksSection
          value={outcome.workflowHooks}
          onChange={(workflowHooks) => setOutcome({ ...outcome, workflowHooks })}
          kinds={OUTCOME_HOOKS}
          adapter={adapter}
          scopeNote="Runs for the task this outcome leads to, in addition to anything set on that step."
        />

        <div style={dividerStyle} />
        <button type="button" style={deleteBtnStyle} onClick={handleDelete}>
          Delete Decision
        </button>
      </div>
    </div>
  );
}

const panelHeaderStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-disabled)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid var(--border-strong)',
  flexShrink: 0,
};

const panelBodyStyle: React.CSSProperties = {
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  overflowY: 'auto',
  flex: 1,
};

const fieldGroupStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
};

const targetChipStyle: React.CSSProperties = {
  padding: '4px 8px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text-disabled)',
  fontSize: 12,
};

const toggleStyle: React.CSSProperties = {
  width: '100%',
  height: 30,
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
  textAlign: 'left',
  padding: '0 10px',
};

const toggleOnStyle: React.CSSProperties = {
  background: 'var(--primary-tint)',
  color: 'var(--primary)',
  border: '1px solid var(--primary-pressed)',
};

const toggleOffStyle: React.CSSProperties = {
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  border: 'none',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid var(--border-strong)',
  margin: '2px 0',
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  borderRadius: 8,
  padding: '0 5px',
  fontWeight: 700,
};

/** What the row says about a route: the fallback, a real condition, or neither. */
function describeRouteCondition(route: WorkflowRoute): string {
  if (route.isDefault) return 'else (fallback)';
  if (!hasRealCondition(route.filter)) return '⚠ No condition set';
  return '✎ Has condition — click to edit';
}

const routeOpenStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flex: 1,
  minWidth: 0,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  textAlign: 'left',
  padding: 0,
  font: 'inherit',
  color: 'inherit',
};

function routeDeleteStyle(): React.CSSProperties {
  return {
    flexShrink: 0,
    marginLeft: 6,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    padding: '3px 7px',
    borderRadius: 4,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  };
}

function buildRouteRowStyle(isFallback: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '7px 8px',
    background: isFallback ? 'var(--success-bg)' : 'var(--surface)',
    border: `1px solid ${isFallback ? 'var(--success)' : 'var(--border)'}`,
    borderRadius: 5,
    cursor: 'pointer',
    textAlign: 'left',
    width: '100%',
  };
}

const routeSeqStyle: React.CSSProperties = {
  minWidth: 18,
  height: 18,
  borderRadius: 3,
  background: 'var(--surface-alt)',
  color: 'var(--text-disabled)',
  fontSize: 9,
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  marginTop: 1,
};

const routeInfoStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
};

const routeNameStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const routeCondStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-secondary)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const routeNextStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--text-disabled)',
};

const routeArrowStyle: React.CSSProperties = {
  fontSize: 14,
  color: 'var(--text-secondary)',
  flexShrink: 0,
  lineHeight: 1,
  marginTop: 2,
};

const addFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
};

const checkRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
};

const checkLabelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-disabled)',
};

const addRouteErrorStyle: React.CSSProperties = {
  fontSize: 10,
  color: 'var(--error)',
  lineHeight: 1.4,
};

const addFormActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: 6,
};

const addConfirmBtnStyle: React.CSSProperties = {
  flex: 1,
  height: 28,
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: 'none',
  background: 'var(--primary-pressed)',
  color: 'var(--text-on-primary)',
  cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  fontSize: 11,
  fontWeight: 500,
  borderRadius: 4,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--text-disabled)',
  cursor: 'pointer',
};

const addRouteBtnStyle: React.CSSProperties = {
  height: 28,
  width: '100%',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: '1px dashed var(--border)',
  background: 'transparent',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const deleteBtnStyle: React.CSSProperties = {
  height: 30,
  width: '100%',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: '1px solid var(--error)',
  background: 'transparent',
  color: 'var(--error)',
  cursor: 'pointer',
  marginTop: 4,
};

const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontStyle: 'italic',
};
