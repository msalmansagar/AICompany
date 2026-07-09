import { useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import type { WorkflowRoute } from '@/types/WorkflowTypes';
import { confirm } from '@/components/ui/ConfirmDialog';

interface OutcomePropertiesPanelProps {
  outcomeId: string | null;
}

export function OutcomePropertiesPanel({ outcomeId }: OutcomePropertiesPanelProps) {
  const {
    outcomes,
    routes,
    routeOrder,
    steps,
    stepOrder,
    setOutcome,
    addRoute,
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
    deleteOutcome: s.deleteOutcome,
    selectNode: s.selectNode,
    clearSelection: s.clearSelection,
  }));

  const [addingRoute, setAddingRoute] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteTarget, setNewRouteTarget] = useState<string>('__end__');
  const [newRouteIsFallback, setNewRouteIsFallback] = useState(false);

  const rawId = outcomeId?.replace('outcome_', '') ?? null;
  const outcome = rawId ? outcomes[rawId] : null;

  if (!outcome) {
    return (
      <div style={panelStyle}>
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
    const maxSeq = outcomeRoutes.reduce((m, r) => Math.max(m, r.sequenceNumber), 0);
    const routeId = `tmp_${crypto.randomUUID()}`;
    addRoute({
      crmId: routeId,
      name: newRouteName.trim(),
      subject: '',
      sequenceNumber: maxSeq + 1,
      filter: newRouteIsFallback ? '' : '',
      outcomeId: outcome.crmId,
      nextStepId: newRouteTarget === '__end__' ? null : newRouteTarget,
    });
    selectNode(`route_edge_${routeId}`);
    setAddingRoute(false);
    setNewRouteName('');
    setNewRouteTarget('__end__');
    setNewRouteIsFallback(false);
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
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>{title}</div>
      <div style={panelBodyStyle}>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={outcome.name}
            onChange={(e) => setOutcome({ ...outcome, name: e.target.value })}
            style={inputStyle}
            placeholder="Decision name"
          />
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Goes To</label>
          <div style={targetChipStyle}>
            {targetStep ? `${targetStep.sequenceNo}. ${targetStep.name}` : '— End of workflow —'}
          </div>
        </div>

        <div style={fieldGroupStyle}>
          <label style={labelStyle}>Conditional Routing</label>
          <button
            type="button"
            role="switch"
            aria-checked={outcome.applyFilter}
            onClick={() => setOutcome({ ...outcome, applyFilter: !outcome.applyFilter })}
            style={{ ...toggleStyle, ...(outcome.applyFilter ? toggleOnStyle : toggleOffStyle) }}
          >
            {outcome.applyFilter ? '◈ Active — choose a route' : 'Off — direct transition'}
          </button>
        </div>

        {outcome.applyFilter && (
          <>
            <div style={dividerStyle} />
            <div style={sectionLabelStyle}>
              Routes
              <span style={countBadgeStyle}>{outcomeRoutes.length}</span>
            </div>

            {outcomeRoutes.map((route) => {
              const nextStep = route.nextStepId ? steps[route.nextStepId] : null;
              const isFallback = !route.filter?.trim();
              return (
                <button
                  key={route.crmId}
                  type="button"
                  style={buildRouteRowStyle(isFallback)}
                  onClick={() => selectNode(`route_edge_${route.crmId}`)}
                  title="Click to edit condition"
                >
                  <span style={routeSeqStyle}>{route.sequenceNumber}</span>
                  <div style={routeInfoStyle}>
                    <span style={routeNameStyle}>{route.name || '(unnamed)'}</span>
                    <span style={routeCondStyle}>
                      {isFallback ? 'else (fallback)' : '✎ Has condition — click to edit'}
                    </span>
                    <span style={routeNextStyle}>
                      → {nextStep ? `${nextStep.sequenceNo}. ${nextStep.name}` : 'End'}
                    </span>
                  </div>
                  <span style={routeArrowStyle}>›</span>
                </button>
              );
            })}

            {addingRoute ? (
              <div style={addFormStyle}>
                <input
                  type="text"
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  placeholder="Route name (optional)"
                  style={inputStyle}
                  autoFocus
                />
                <label style={labelStyle}>Goes to</label>
                <select
                  value={newRouteTarget}
                  onChange={(e) => setNewRouteTarget(e.target.value)}
                  style={selectStyle}
                >
                  <option value="__end__">— End —</option>
                  {availableSteps.map((s) => (
                    <option key={s!.crmId} value={s!.crmId}>
                      {s!.sequenceNo}. {s!.name}
                    </option>
                  ))}
                </select>
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
                    onClick={() => setAddingRoute(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                style={addRouteBtnStyle}
                onClick={() => setAddingRoute(true)}
              >
                + Add Route
              </button>
            )}
          </>
        )}

        <div style={dividerStyle} />
        <button type="button" style={deleteBtnStyle} onClick={handleDelete}>
          Delete Decision
        </button>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  background: '#0f172a',
  borderLeft: '1px solid #1e293b',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const panelHeaderStyle: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 11,
  fontWeight: 700,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  borderBottom: '1px solid #1e293b',
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

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
  height: 30,
  padding: '0 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const selectStyle: React.CSSProperties = {
  height: 30,
  padding: '0 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#e2e8f0',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const targetChipStyle: React.CSSProperties = {
  padding: '4px 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 4,
  color: '#94a3b8',
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
  background: '#1e3a5f',
  color: '#60a5fa',
  border: '1px solid #1d4ed8',
};

const toggleOffStyle: React.CSSProperties = {
  background: '#334155',
  color: '#94a3b8',
  border: 'none',
};

const dividerStyle: React.CSSProperties = {
  borderTop: '1px solid #1e293b',
  margin: '2px 0',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const countBadgeStyle: React.CSSProperties = {
  fontSize: 10,
  background: '#334155',
  color: '#94a3b8',
  borderRadius: 8,
  padding: '0 5px',
  fontWeight: 700,
};

function buildRouteRowStyle(isFallback: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 8,
    padding: '7px 8px',
    background: isFallback ? '#052e16' : '#1e293b',
    border: `1px solid ${isFallback ? '#166534' : '#334155'}`,
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
  background: '#334155',
  color: '#94a3b8',
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
  color: '#e2e8f0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const routeCondStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#64748b',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const routeNextStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#94a3b8',
};

const routeArrowStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#475569',
  flexShrink: 0,
  lineHeight: 1,
  marginTop: 2,
};

const addFormStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: '10px',
  background: '#1e293b',
  border: '1px solid #334155',
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
  color: '#94a3b8',
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
  background: '#1d4ed8',
  color: '#fff',
  cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  height: 28,
  padding: '0 12px',
  fontSize: 11,
  fontWeight: 500,
  borderRadius: 4,
  border: '1px solid #334155',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
};

const addRouteBtnStyle: React.CSSProperties = {
  height: 28,
  width: '100%',
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 4,
  border: '1px dashed #334155',
  background: 'transparent',
  color: '#64748b',
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
  border: '1px solid #7f1d1d',
  background: 'transparent',
  color: '#ef4444',
  cursor: 'pointer',
  marginTop: 4,
};

const emptyStyle: React.CSSProperties = {
  padding: 16,
  fontSize: 12,
  color: '#475569',
  fontStyle: 'italic',
};
